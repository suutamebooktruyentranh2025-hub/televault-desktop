import React from 'react';

export function GDriveStatsBar({
  t,
  gdriveEmail,
  gdriveStatus,
  currentThrottle,
  telegramFloodWaitSec,
  gdriveLastError,
  gdriveScanPhase,
  gdriveScanInfo,
  gdriveTotalCount,
  gdriveSyncedCount,
  gdriveCurrentSyncFile,
  gdriveIsPaused,
  gdriveQueueLength = 0,
  checkConnBusy = false,
  onCheckConnection,
  onScanNow,
  onStartSync,
  onTogglePause,
}) {
  const isScanning = Boolean(gdriveScanPhase);

  return (
    <>
      <div className="p-4 border-b border-gray-100 dark:border-zinc-800 flex justify-between items-center">
        <div>
          <div className="font-medium text-sm text-[#0066cc]">{t('gdriveConnected')}</div>
          <div className="text-xs opacity-70 mt-0.5">{gdriveEmail}</div>
          <div className="text-xs opacity-70 mt-1 text-[var(--gd-text-secondary)]">
            {t('gdriveStatusLabel')}: <span className="font-semibold text-[var(--gd-text)] inline-flex items-center gap-1.5">
              {isScanning ? (
                <span className="text-blue-500 inline-flex items-center gap-1.5">
                  {t('gdriveStatsScanningDrive')}
                  <svg className="animate-spin h-3.5 w-3.5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : gdriveStatus === 'syncing' ? (
                <>
                  {t('gdriveStatusSyncing')}
                  <svg className="animate-spin h-3.5 w-3.5 text-[#0066cc]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </>
              ) : gdriveStatus === 'paused' ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 rounded text-[11px] font-bold uppercase tracking-wider">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  {t('gdriveStatsPaused')}
                </div>
              ) : gdriveStatus === 'idle' ? (
                t('gdriveStatusIdle')
              ) : gdriveStatus === 'disconnected' ? (
                t('gdriveStatusDisconnected')
              ) : gdriveStatus === 'error' ? (
                t('gdriveStatusError')
              ) : null}
            </span>
          </div>
          {(currentThrottle?.throttled || currentThrottle?.isThrottled) && (
            <div className="mt-1 text-[11px] font-medium text-amber-600 dark:text-amber-300">
              {t('gdriveThrottleStatus', {
                concurrency: currentThrottle.concurrency
                  ?? currentThrottle.currentConcurrency
                  ?? 1,
              })}
            </div>
          )}
          {telegramFloodWaitSec > 0 && (
            <div
              className="mt-1 inline-flex max-w-full items-center rounded-md border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300"
              role="status"
            >
              {t('gdriveTelegramFloodBadge', { n: telegramFloodWaitSec })}
            </div>
          )}
          {gdriveLastError && (
            <div className="text-xs text-red-500 mt-1 font-normal">{gdriveLastError}</div>
          )}
        </div>
        <div className="flex gap-2">
          {!isScanning && gdriveStatus === 'idle' && !gdriveIsPaused && gdriveQueueLength > 0 && (
            <button
              type="button"
              className="text-xs px-4 py-2 font-semibold rounded-lg bg-[var(--gd-primary)] hover:opacity-90 text-white transition-all flex items-center gap-1.5 shadow-sm"
              onClick={onStartSync}
            >
              {t('gdriveStatsStartSync', { n: gdriveQueueLength })}
            </button>
          )}
          <button
            type="button"
            className={`text-xs px-3 py-2 font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              checkConnBusy
                ? 'bg-zinc-300 text-zinc-600 dark:bg-zinc-700 dark:text-zinc-300 cursor-default'
                : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300'
            }`}
            onClick={checkConnBusy ? undefined : onCheckConnection}
            disabled={checkConnBusy}
            title={t('gdriveCheckConnectionTooltip')}
          >
            {checkConnBusy ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-zinc-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('gdriveCheckingConnection')}
              </>
            ) : (
              t('gdriveCheckConnectionBtn')
            )}
          </button>
          <button
            type="button"
            className={`text-xs px-4 py-2 font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              isScanning
                ? 'bg-blue-500 text-white cursor-default'
                : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300'
            } ${gdriveIsPaused ? 'opacity-50 pointer-events-none' : ''}`}
            onClick={isScanning ? undefined : onScanNow}
            disabled={gdriveIsPaused}
          >
            {isScanning ? (
              <>
                <svg className="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                {t('gdriveStatsScanning')}
              </>
            ) : (
              `🔄 ${t('gdriveScanNow')}`
            )}
          </button>
          <button
            type="button"
            className={`text-xs px-4 py-2 font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
              gdriveIsPaused
                ? 'bg-amber-500 hover:bg-amber-600 text-white'
                : 'bg-zinc-200 hover:bg-zinc-300 text-zinc-700 dark:bg-zinc-800 dark:hover:bg-zinc-700 dark:text-zinc-300'
            }`}
            onClick={onTogglePause}
          >
            {gdriveIsPaused ? (
              <>
                <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                <span>{t('gdriveStatsResume')}</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" /></svg>
                <span>{t('gdriveStatsPause')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {isScanning && (
        <div className="mx-4 mt-3 mb-4 p-3 bg-gray-50 dark:bg-zinc-800 rounded border border-gray-100 dark:border-zinc-700/50 text-xs text-[var(--gd-text)]">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="inline-block animate-spin">🔍</span>
            <span className="font-semibold">
              {gdriveScanPhase === 'indexing' ? t('gdriveStatsIndexing') : t('gdriveStatsScanningFolder')}
            </span>
          </div>
          {gdriveScanInfo && (
            <div className="space-y-1 pl-6 text-[11px] opacity-80">
              {gdriveScanInfo.currentFolder && gdriveScanInfo.currentFolder !== '/' && (
                <div className="truncate">
                  📂 <span className="font-medium">{gdriveScanInfo.currentFolder}</span>
                </div>
              )}
              <div>
                {t('gdriveStatsFilesFound', { count: gdriveScanInfo.filesFound })}
              </div>
            </div>
          )}
        </div>
      )}

      {!isScanning && gdriveStatus === 'syncing' && gdriveTotalCount > 0 && (
        <div className="mx-4 mt-3 mb-4 p-3 bg-gray-50 dark:bg-zinc-800 rounded border border-gray-100 dark:border-zinc-700/50">
          <div className="flex justify-between items-center text-xs font-semibold mb-1">
            <span className="truncate pr-2 text-[var(--gd-text)]">
              🔄 {gdriveCurrentSyncFile ? t('gdriveSyncingFileProgress', { current: gdriveSyncedCount, total: gdriveTotalCount, file: gdriveCurrentSyncFile }) : t('gdriveStatsWaitingFiles')}
            </span>
            <span className="shrink-0 text-[var(--gd-primary)] font-medium">
              {Math.min(100, Math.round((gdriveSyncedCount / gdriveTotalCount) * 100))}%
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden mt-1.5">
            <div
              className="bg-gradient-to-r from-[var(--gd-primary)] to-[#34a853] h-full transition-all duration-300 rounded-full"
              style={{ width: `${Math.min(100, Math.round((gdriveSyncedCount / gdriveTotalCount) * 100))}%` }}
            />
          </div>
        </div>
      )}
    </>
  );
}
