import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';
import { formatSpeed, formatDate } from '../utils/format';

export function DriveSyncIndicator({ syncStatus, onNavigateSection, align = 'right' }) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const overallStatus = syncStatus?.status || 'off';
  const totalPending = syncStatus?.totalPendingCount || 0;
  const gdrive = syncStatus?.gdrive;
  const local = syncStatus?.local;

  const tooltip = syncStatus?.labelKey ? t(syncStatus.labelKey) : t('syncStatusNotConfigured');

  return (
    <div className="relative inline-block" ref={containerRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={tooltip}
        className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all cursor-pointer ${
          isOpen
            ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)] ring-2 ring-[var(--gd-primary)]/30'
            : 'text-[var(--gd-text-secondary)] hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)]'
        }`}
        aria-label={tooltip}
        aria-expanded={isOpen}
      >
        {overallStatus === 'syncing' && (
          <svg className="h-[18px] w-[18px] text-[var(--gd-primary)] animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.5 2v6h-6" />
            <path d="M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
        )}

        {overallStatus === 'synced' && (
          <svg className="h-[18px] w-[18px] text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <polyline points="9 13 11.5 15.5 15 11" />
          </svg>
        )}

        {overallStatus === 'pending' && (
          <svg className="h-[18px] w-[18px] text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
            <circle cx="12" cy="13" r="2.5" />
          </svg>
        )}

        {overallStatus === 'conflict' && (
          <svg className="h-[18px] w-[18px] text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        )}

        {overallStatus === 'paused' && (
          <svg className="h-[17px] w-[17px] text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="10" y1="15" x2="10" y2="9" />
            <line x1="14" y1="15" x2="14" y2="9" />
          </svg>
        )}

        {overallStatus === 'error' && (
          <svg className="h-[18px] w-[18px] text-red-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        )}

        {overallStatus === 'off' && (
          <svg className="h-[18px] w-[18px] text-zinc-400 opacity-60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
            <path d="m2 2 20 20" />
            <path d="M5.782 5.782A7 7 0 0 0 9 19h8.5a4.5 4.5 0 0 0 1.307-.193" />
            <path d="M21.532 16.5A4.5 4.5 0 0 0 17.5 10h-1.79A7.008 7.008 0 0 0 10 5.07" />
          </svg>
        )}

        {/* Small pending badge */}
        {totalPending > 0 && overallStatus !== 'syncing' && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-white shadow-sm">
            {totalPending > 99 ? '99+' : totalPending}
          </span>
        )}
      </button>

      {/* Sync Details Popover */}
      {isOpen && (
        <div
          className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} top-10 z-50 mt-1 w-80 rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] p-4 shadow-xl backdrop-blur-md`}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[var(--gd-border)] pb-3">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--gd-text-secondary)]">
                {t('syncOverviewTitle')}
              </h2>
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className={`h-2 w-2 rounded-full ${
                    overallStatus === 'syncing'
                      ? 'bg-blue-500 animate-ping'
                      : overallStatus === 'synced'
                      ? 'bg-emerald-500'
                      : overallStatus === 'pending'
                      ? 'bg-amber-500'
                      : overallStatus === 'error'
                      ? 'bg-red-500'
                      : overallStatus === 'paused'
                      ? 'bg-zinc-400'
                      : 'bg-zinc-300 dark:bg-zinc-600'
                  }`}
                />
                <span className="text-sm font-medium text-[var(--gd-text)]">
                  {tooltip}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded-md p-1 text-[var(--gd-text-secondary)] hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)] transition-colors cursor-pointer"
              aria-label="Close"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {/* Google Drive Block */}
            <div className="rounded-lg border border-[var(--gd-border)] bg-black/5 p-3 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M7.71 3.5 1.15 15l3.43 6 6.55-11.5z" opacity="0.8" />
                    <path d="m22.85 15-3.43 6H6.57l3.43-6z" opacity="0.9" />
                    <path d="M12 9.5 15.43 3.5h6.86L15.72 15z" />
                  </svg>
                  <span className="text-xs font-semibold text-[var(--gd-text)]">
                    {t('syncGdriveTitle')}
                  </span>
                </div>
                {onNavigateSection && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onNavigateSection('gdrive');
                    }}
                    className="text-[11px] font-medium text-[var(--gd-primary)] hover:underline cursor-pointer"
                  >
                    {t('syncOpenGDrive')} →
                  </button>
                )}
              </div>

              {gdrive?.isConnected ? (
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[var(--gd-text-secondary)]">
                    <span className="truncate max-w-[170px]" title={gdrive.email}>
                      {gdrive.email || t('gdriveConnected')}
                    </span>
                    <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                      {gdrive.status === 'syncing'
                        ? t('syncStatusSyncing')
                        : gdrive.scanPhase
                        ? t('syncScanning')
                        : gdrive.pendingCount > 0
                        ? `${gdrive.pendingCount} ${t('syncInQueue')}`
                        : t('syncStatusSynced')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-[var(--gd-text-secondary)] pt-1 border-t border-[var(--gd-border)]/50">
                    <span>{t('syncStatusSynced')}: <strong className="text-[var(--gd-text)]">{gdrive.syncedCount || 0}</strong> {t('syncFilesCount')}</span>
                    <span>{t('syncPending')}: <strong className="text-[var(--gd-text)]">{gdrive.pendingCount || 0}</strong></span>
                  </div>

                  {gdrive.currentSyncFile && (
                    <div className="rounded bg-[var(--gd-surface)] p-1.5 text-[11px] border border-[var(--gd-border)]/40 mt-1">
                      <div className="flex items-center justify-between text-[10px] text-[var(--gd-text-secondary)]">
                        <span className="truncate max-w-[150px]" title={gdrive.currentSyncFile}>
                          {gdrive.currentSyncFile}
                        </span>
                        {gdrive.speedBps > 0 && (
                          <span className="font-mono text-blue-500 font-medium">
                            {formatSpeed(gdrive.speedBps)}
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {gdrive.lastSyncAt && (
                    <div className="text-[10px] text-[var(--gd-text-secondary)] text-right pt-0.5">
                      {t('syncLastSync')}: {formatDate(gdrive.lastSyncAt)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-xs text-[var(--gd-text-secondary)]">
                  {t('syncNotConnected')}
                </div>
              )}
            </div>

            {/* Local Folder Sync Block */}
            <div className="rounded-lg border border-[var(--gd-border)] bg-black/5 p-3 dark:bg-white/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-amber-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                  </svg>
                  <span className="text-xs font-semibold text-[var(--gd-text)]">
                    {t('syncLocalTitle')}
                  </span>
                </div>
                {onNavigateSection && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onNavigateSection('settings');
                    }}
                    className="text-[11px] font-medium text-[var(--gd-primary)] hover:underline cursor-pointer"
                  >
                    {t('syncOpenSettings')} →
                  </button>
                )}
              </div>

              {local?.isConfigured ? (
                <div className="mt-2 space-y-1.5 text-xs">
                  <div className="truncate text-[var(--gd-text-secondary)]" title={local.folder || ''}>
                    📁 {local.folder || t('syncFolderNone')}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-[var(--gd-text-secondary)] pt-1 border-t border-[var(--gd-border)]/50">
                    <span>{t('syncPending')}: <strong className="text-[var(--gd-text)]">{local.pendingCount || 0}</strong></span>
                    {local.conflictCount > 0 && (
                      <span className="text-amber-500 font-semibold">{t('syncStatusConflict')}: {local.conflictCount}</span>
                    )}
                  </div>
                  {local.lastSyncAt && (
                    <div className="text-[10px] text-[var(--gd-text-secondary)] text-right pt-0.5">
                      {t('syncLastSync')}: {formatDate(local.lastSyncAt)}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-2 text-xs text-[var(--gd-text-secondary)]">
                  {t('syncNotEnabled')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
