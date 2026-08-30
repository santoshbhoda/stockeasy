import { useTranslation } from 'react-i18next'
import useOnlineStatus from '../hooks/useOnlineStatus'

export default function SyncStatusBar({ pendingCount = 0, isSyncing = false, onSyncNow }) {
  const { t } = useTranslation()
  const isOnline = useOnlineStatus()

  // Don't show when everything is fine
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
    <div className={`alert ${alertClass} rounded-none py-1.5 px-4 text-sm flex items-center justify-between min-h-0`}>
      <span className="flex items-center gap-2">
        <span>{icon}</span>
        <span>{message}</span>
      </span>
      {isOnline && pendingCount > 0 && onSyncNow && (
        <button onClick={onSyncNow} className="btn btn-ghost btn-xs">
          {t('sync.syncNow', 'Sync Now')}
        </button>
      )}
    </div>
  )
}
