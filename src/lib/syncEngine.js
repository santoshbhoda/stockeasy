import { supabase } from './supabase'
import db from './db'

const TABLE_MAP_LOCAL_TO_REMOTE = {
  products: 'products',
  categories: 'categories',
  branches: 'branches',
  inventory: 'inventory',
  stockMovements: 'stock_movements',
  stock_movements: 'stock_movements'
}

const TABLE_MAP_REMOTE_TO_LOCAL = {
  products: 'products',
  categories: 'categories',
  branches: 'branches',
  inventory: 'inventory',
  stock_movements: 'stockMovements',
  stockMovements: 'stockMovements'
}

/**
 * Checks if current environment is online
 * @returns {boolean}
 */
export function isOnline() {
  if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
    return navigator.onLine
  }
  return true
}

/**
 * Process all pending items in syncQueue (Push to Supabase)
 * @returns {Promise<{ synced: number, failed: number, remaining: number }>}
 */
export async function processSyncQueue() {
  if (!isOnline()) {
    const remaining = await db.syncQueue.count()
    return { synced: 0, failed: 0, remaining }
  }

  let synced = 0
  let failed = 0

  try {
    const items = await db.syncQueue.orderBy('id').toArray()

    for (const item of items) {
      const remoteTable = TABLE_MAP_LOCAL_TO_REMOTE[item.table] || item.table
      const operation = (item.operation || '').toUpperCase()

      try {
        let result
        if (operation === 'INSERT' || operation === 'UPSERT') {
          result = await supabase.from(remoteTable).upsert(item.data)
        } else if (operation === 'UPDATE') {
          if (item.data) {
            result = await supabase.from(remoteTable).upsert(item.data)
          } else {
            result = await supabase.from(remoteTable).update(item.data).eq('id', item.record_id)
          }
        } else if (operation === 'DELETE') {
          result = await supabase.from(remoteTable).delete().eq('id', item.record_id)
        } else {
          result = await supabase.from(remoteTable).upsert(item.data)
        }

        if (result?.error) {
          console.error(`Sync error for table ${remoteTable} (${operation}):`, result.error)
          failed++
          // Stop queue processing on network/connection failure to maintain FIFO ordering
          break
        }

        // Successfully pushed to Supabase -> remove from local queue
        await db.syncQueue.delete(item.id)
        synced++
      } catch (itemErr) {
        console.error(`Sync exception for table ${remoteTable}:`, itemErr)
        failed++
        break
      }
    }
  } catch (err) {
    console.error('Error in processSyncQueue:', err)
  }

  const remaining = await db.syncQueue.count()
  return { synced, failed, remaining }
}

/**
 * Pull latest data from Supabase and upsert locally with Last Write Wins
 * @param {string|null} [lastSyncTime] 
 * @returns {Promise<{ success: boolean, timestamp: string, tablesPulled: object, error?: string }>}
 */
export async function pullFromCloud(lastSyncTime = null) {
  if (!isOnline()) {
    return { success: false, error: 'Offline', timestamp: null, tablesPulled: {} }
  }

  let effectiveSyncTime = lastSyncTime
  if (!effectiveSyncTime) {
    const meta = await db.syncMeta.get('last_sync_time')
    effectiveSyncTime = meta?.value || null
  }

  const tablesToPull = ['categories', 'branches', 'products', 'inventory']
  const tablesPulled = {}

  try {
    for (const table of tablesToPull) {
      let query = supabase.from(table).select('*')

      if (effectiveSyncTime) {
        query = query.gt('updated_at', effectiveSyncTime)
      }

      let { data, error } = await query

      // Fallback if updated_at is not present on table
      if (error && effectiveSyncTime) {
        const fallback = await supabase.from(table).select('*')
        if (!fallback.error) {
          data = fallback.data
          error = null
        }
      }

      if (error) {
        console.warn(`Could not pull table ${table}:`, error.message)
        continue
      }

      if (data && data.length > 0) {
        const localTableKey = TABLE_MAP_REMOTE_TO_LOCAL[table] || table
        const localTable = db[localTableKey]

        if (localTable) {
          const ids = data.map(d => d.id).filter(Boolean)
          if (ids.length > 0) {
            const existingRecords = await localTable.bulkGet(ids)
            const localMap = new Map()
            existingRecords.forEach(r => {
              if (r && r.id) localMap.set(r.id, r)
            })

            const recordsToPut = []
            for (const remote of data) {
              const local = localMap.get(remote.id)
              if (!local) {
                recordsToPut.push(remote)
              } else {
                const remoteTime = remote.updated_at ? new Date(remote.updated_at).getTime() : (remote.created_at ? new Date(remote.created_at).getTime() : 0)
                const localTime = local.updated_at ? new Date(local.updated_at).getTime() : (local.created_at ? new Date(local.created_at).getTime() : 0)
                // Last Write Wins: remote wins if newer or equal
                if (remoteTime >= localTime) {
                  recordsToPut.push(remote)
                }
              }
            }

            if (recordsToPut.length > 0) {
              await localTable.bulkPut(recordsToPut)
            }
            tablesPulled[table] = recordsToPut.length
          }
        }
      } else {
        tablesPulled[table] = 0
      }
    }

    const newSyncTime = new Date().toISOString()
    await db.syncMeta.put({ key: 'last_sync_time', value: newSyncTime })

    return {
      success: true,
      timestamp: newSyncTime,
      tablesPulled
    }
  } catch (err) {
    console.error('Error in pullFromCloud:', err)
    return {
      success: false,
      timestamp: null,
      tablesPulled,
      error: err.message
    }
  }
}

/**
 * Complete sync cycle: push pending changes first, then pull updates from cloud
 * @returns {Promise<{ success: boolean, push: object, pull: object, timestamp: string, error?: string }>}
 */
export async function fullSync() {
  const timestamp = new Date().toISOString()
  try {
    const pushResult = await processSyncQueue()
    const pullResult = await pullFromCloud()

    const isSuccess = pushResult.failed === 0 && (pullResult.success || !isOnline())
    return {
      success: isSuccess,
      push: pushResult,
      pull: pullResult,
      timestamp
    }
  } catch (err) {
    console.error('Error in fullSync:', err)
    return {
      success: false,
      push: { synced: 0, failed: 0, remaining: await db.syncQueue.count() },
      pull: { success: false, error: err.message },
      timestamp,
      error: err.message
    }
  }
}

/**
 * Returns current sync status
 * @returns {Promise<{ pendingCount: number, lastSyncTime: string|null, isOnline: boolean }>}
 */
export async function getSyncStatus() {
  const pendingCount = await db.syncQueue.count()
  const meta = await db.syncMeta.get('last_sync_time')
  const lastSyncTime = meta?.value || null

  return {
    pendingCount,
    lastSyncTime,
    isOnline: isOnline()
  }
}

/**
 * Initializes automatic background synchronization
 * @returns {() => void} Cleanup function
 */
export function initializeSync() {
  let isSyncing = false

  const triggerSync = async () => {
    if (isSyncing || !isOnline()) return
    try {
      isSyncing = true
      await fullSync()
    } catch (err) {
      console.warn('Auto-sync execution error:', err)
    } finally {
      isSyncing = false
    }
  }

  // Initial sync on startup if online
  if (isOnline()) {
    triggerSync()
  }

  // Periodic sync every 30 seconds
  const intervalId = setInterval(triggerSync, 30000)

  // Listen for online/offline events
  const handleOnline = () => {
    triggerSync()
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
  }

  return () => {
    clearInterval(intervalId)
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', handleOnline)
    }
  }
}
