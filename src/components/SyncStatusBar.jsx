import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLiveQuery } from 'dexie-react-hooks'
import db from '../lib/db'
import useOnlineStatus from '../hooks/useOnlineStatus'
import { fullSync } from '../lib/syncEngine'
import toast from 'react-hot-toast'

export default function SyncStatusBar() {
  const { t } = useTranslation()
  const isOnline = useOnlineStatus()
  const [isSyncing, setIsSyncing] = useState(false)

  // Reactively track pending sync items in Dexie
  const pendingCount = useLiveQuery(() => db.syncQueue.count(), []) || 0

  const handleSyncNow = async () => {
    if (!isOnline) {
      toast.error(t('sync.offline', 'Cannot sync while offline'))
      return
    }

    setIsSyncing(true)
    try {
      const result = await fullSync()
      if (result.success) {
        toast.success(t('sync.syncSuccess', 'Sync completed!'))
      } else {
        toast.error(result.error || t('sync.syncError', 'Sync error occurred'))
      }
    } catch (err) {
      console.error('Sync failed:', err)
      toast.error(err.message || t('sync.syncError', 'Sync failed'))
    } finally {
      setIsSyncing(false)
    }
  }

  // Don't show when online and fully synced
  if (isOnline && pendingCount === 0 && !isSyncing) return null

  let alertClass, icon, message

  if (!isOnline) {
    alertClass = 'alert-error'
    icon = '📴'
    message = t('sync.offline', 'Offline — changes saved locally')
  } else if (isSyncing) {
    alertClass = 'alert-info'
    icon = '🔄'
    message = t('sync.syncing', 'Syncing...')
  } else if (pendingCount > 0) {
    alertClass = 'alert-warning'
    icon = '⏳'
    message = t('sync.pending', '{{count}} changes pending sync', { count: pendingCount })
  } else {
    return null
  }

  return (
    <div className={`alert ${alertClass} rounded-none py-2 px-4 text-xs sm:text-sm flex items-center justify-between min-h-0 shadow-sm transition-all sticky top-0 z-50`}>
      <span className="flex items-center gap-2 font-medium">
        <span className="text-base">{icon}</span>
        <span>{message}</span>
      </span>
      {isOnline && pendingCount > 0 && !isSyncing && (
        <button onClick={handleSyncNow} className="btn btn-neutral btn-xs font-semibold">
          {t('sync.syncNow', 'Sync Now')}
        </button>
      )}
    </div>
  )
}
