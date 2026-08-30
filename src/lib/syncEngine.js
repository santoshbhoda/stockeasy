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

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isValidUuid(val) {
  return typeof val === 'string' && UUID_REGEX.test(val)
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
 * Sanitize local record to match PostgreSQL table schema before pushing to Supabase
 * @param {string} table 
 * @param {object} raw 
 * @returns {object|null}
 */
export function sanitizeRecordForRemote(table, raw) {
  if (!raw || typeof raw !== 'object') return null
  const clean = { ...raw }

  if (table === 'products') {
    const barcodeVal = clean.barcode ? String(clean.barcode).trim() : ''
    if (!barcodeVal && !clean.name) return null

    return {
      id: isValidUuid(clean.id) ? clean.id : crypto.randomUUID(),
      barcode: barcodeVal || `GEN-${Date.now()}`,
      name: String(clean.name || 'Unnamed Product').trim(),
      brand: String(clean.brand || 'Generic').trim(),
      model: clean.model ? String(clean.model).trim() : null,
      category_id: isValidUuid(clean.category_id) ? clean.category_id : null,
      mrp: clean.mrp !== undefined && clean.mrp !== null ? Number(clean.mrp) : (clean.price !== undefined ? Number(clean.price) : null),
      purchase_price: clean.purchase_price !== undefined && clean.purchase_price !== null ? Number(clean.purchase_price) : (clean.cost_price !== undefined ? Number(clean.cost_price) : null),
      reorder_level: clean.reorder_level !== undefined && clean.reorder_level !== null ? Number(clean.reorder_level) : (clean.min_stock_level !== undefined ? Number(clean.min_stock_level) : 5),
      is_active: clean.is_active !== undefined ? Boolean(clean.is_active) : true,
      created_at: clean.created_at || new Date().toISOString(),
      updated_at: clean.updated_at || new Date().toISOString()
    }
  }

  if (table === 'inventory') {
    if (!isValidUuid(clean.product_id) || !isValidUuid(clean.branch_id)) {
      console.warn('Inventory record skipped: Missing valid product_id or branch_id UUID:', clean)
      return null
    }

    return {
      id: isValidUuid(clean.id) ? clean.id : crypto.randomUUID(),
      product_id: clean.product_id,
      branch_id: clean.branch_id,
      quantity: Math.max(0, Number(clean.quantity) || 0),
      updated_at: clean.updated_at || new Date().toISOString()
    }
  }

  if (table === 'stock_movements') {
    if (!isValidUuid(clean.product_id) || !isValidUuid(clean.branch_id)) {
      console.warn('Stock movement skipped: Missing valid product_id or branch_id UUID:', clean)
      return null
    }

    return {
      id: isValidUuid(clean.id) ? clean.id : crypto.randomUUID(),
      product_id: clean.product_id,
      branch_id: clean.branch_id,
      user_id: isValidUuid(clean.user_id) ? clean.user_id : null,
      type: clean.type || 'IN',
      quantity: Math.max(1, Number(clean.quantity) || 1),
      reason: clean.reason || 'purchase',
      notes: clean.notes || null,
      created_at: clean.created_at || new Date().toISOString()
    }
  }

  if (table === 'categories') {
    if (!clean.name) return null
    return {
      id: isValidUuid(clean.id) ? clean.id : crypto.randomUUID(),
      name: String(clean.name).trim(),
      icon: clean.icon || null,
      created_at: clean.created_at || new Date().toISOString()
    }
  }

  if (table === 'branches') {
    if (!clean.name) return null
    return {
      id: isValidUuid(clean.id) ? clean.id : crypto.randomUUID(),
      name: String(clean.name).trim(),
      address: clean.address || null,
      phone: clean.phone || null,
      created_at: clean.created_at || new Date().toISOString(),
      updated_at: clean.updated_at || new Date().toISOString()
    }
  }

  return clean
}

/**
 * Process all pending items in syncQueue (Push to Supabase)
 * @returns {Promise<{ synced: number, failed: number, remaining: number, error?: string }>}
 */
export async function processSyncQueue() {
  if (!isOnline()) {
    const remaining = await db.syncQueue.count()
    return { synced: 0, failed: 0, remaining, error: 'Offline' }
  }

  // Ensure user has active session in Supabase before pushing
  let currentUser = null
  try {
    const { data: { session } } = await supabase.auth.getSession()
    currentUser = session?.user || null
  } catch (authErr) {
    console.warn('Auth check error during sync:', authErr)
  }

  if (!currentUser) {
    console.warn('Sync push skipped: No active login session found.')
    const remaining = await db.syncQueue.count()
    return { synced: 0, failed: 0, remaining, error: 'Please log in to sync changes to cloud' }
  }

  let synced = 0
  let failed = 0
  let lastErrorMsg = null

  try {
    const items = await db.syncQueue.orderBy('id').toArray()

    for (const item of items) {
      const remoteTable = TABLE_MAP_LOCAL_TO_REMOTE[item.table] || item.table
      const operation = (item.operation || '').toUpperCase()

      try {
        const sanitizedData = item.data ? sanitizeRecordForRemote(remoteTable, item.data) : null

        // If the item data was invalid and could not be sanitized, remove from queue
        if (!sanitizedData && item.data && operation !== 'DELETE') {
          console.warn(`Pruning corrupted queue item #${item.id} from table ${remoteTable}:`, item.data)
          await db.syncQueue.delete(item.id)
          continue
        }

        let result
        if (operation === 'DELETE') {
          result = await supabase.from(remoteTable).delete().eq('id', item.record_id)
        } else if (remoteTable === 'products') {
          result = await supabase.from('products').upsert(sanitizedData, { onConflict: 'barcode' })
        } else if (remoteTable === 'inventory') {
          result = await supabase.from('inventory').upsert(sanitizedData, { onConflict: 'product_id,branch_id' })
        } else if (remoteTable === 'categories') {
          result = await supabase.from('categories').upsert(sanitizedData, { onConflict: 'name' })
        } else if (remoteTable === 'branches') {
          result = await supabase.from('branches').upsert(sanitizedData, { onConflict: 'name' })
        } else if (remoteTable === 'stock_movements') {
          result = await supabase.from('stock_movements').insert(sanitizedData)
        } else {
          result = await supabase.from(remoteTable).upsert(sanitizedData)
        }

        if (result?.error) {
          lastErrorMsg = result.error.message || result.error.details || JSON.stringify(result.error)
          console.error(`Sync error for table ${remoteTable} (${operation}):`, lastErrorMsg, result.error)
          failed++

          // Discard permanent format errors so queue is not permanently blocked
          const isPermanentClientError = 
            result.error.code === '22P02' || // invalid uuid
            result.error.code === '23503' || // foreign key violation
            result.error.code === 'PGRST100' || // column not found
            lastErrorMsg.includes('invalid input syntax') ||
            lastErrorMsg.includes('violates foreign key');

          if (isPermanentClientError) {
            console.warn(`Discarding unresolvable queue item #${item.id} (${remoteTable}):`, lastErrorMsg)
            await db.syncQueue.delete(item.id)
          } else {
            // Stop loop on network / permission errors to preserve FIFO
            break
          }
          continue
        }

        // Successfully pushed to Supabase -> remove from local queue
        await db.syncQueue.delete(item.id)
        synced++
      } catch (itemErr) {
        lastErrorMsg = itemErr.message || 'Unknown item sync error'
        console.error(`Sync exception for table ${remoteTable}:`, itemErr)
        failed++
        break
      }
    }
  } catch (err) {
    lastErrorMsg = err.message || 'Queue iteration error'
    console.error('Error in processSyncQueue:', err)
  }

  const remaining = await db.syncQueue.count()
  return { synced, failed, remaining, error: lastErrorMsg }
}

/**
 * Pull latest data from Supabase and upsert locally with Last Write Wins
 * @param {string|null} [lastSyncTime] 
 * @returns {Promise<{ success: boolean, timestamp: string|null, tablesPulled: object, error?: string }>}
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

  const tablesWithUpdatedAt = new Set(['products', 'branches', 'inventory'])
  const tablesToPull = ['categories', 'branches', 'products', 'inventory']
  const tablesPulled = {}
  let pullError = null

  try {
    for (const table of tablesToPull) {
      let query = supabase.from(table).select('*')

      const localTableKey = TABLE_MAP_REMOTE_TO_LOCAL[table] || table
      const localTable = db[localTableKey]
      const localCount = localTable ? await localTable.count() : 0

      if (effectiveSyncTime && tablesWithUpdatedAt.has(table) && localCount > 0) {
        query = query.gt('updated_at', effectiveSyncTime)
      }

      let { data, error } = await query

      // Fallback query if error occurred with gt
      if (error && effectiveSyncTime) {
        const fallback = await supabase.from(table).select('*')
        if (!fallback.error) {
          data = fallback.data
          error = null
        }
      }

      if (error) {
        pullError = error.message
        console.warn(`Could not pull table ${table}:`, error.message)
        continue
      }

      if (data && data.length > 0 && localTable) {
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
      error: err.message || pullError
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
    const combinedError = pushResult.error || pullResult.error || (pushResult.failed > 0 ? `${pushResult.failed} item(s) failed to sync` : null)

    return {
      success: isSuccess,
      push: pushResult,
      pull: pullResult,
      timestamp,
      error: isSuccess ? null : combinedError
    }
  } catch (err) {
    console.error('Error in fullSync:', err)
    return {
      success: false,
      push: { synced: 0, failed: 0, remaining: await db.syncQueue.count() },
      pull: { success: false, error: err.message },
      timestamp,
      error: err.message || 'Sync failed unexpectedly'
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

  // Periodic sync every 20 seconds
  const intervalId = setInterval(triggerSync, 20000)

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
