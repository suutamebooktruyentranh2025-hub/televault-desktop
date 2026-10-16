import React, { useState } from 'react';

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

export function GDriveCacheSummaryBar({ summary = {}, t, onRescanVault, onCancelRescanVault, rescanBusy, rescanProgress = 0, onSyncAllPending, syncAllBusy, scanPhase }) {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('televault_gdrive_summary_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('televault_gdrive_summary_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  const totalFiles = summary.totalFiles || 0;
  const totalFolders = summary.totalFolders || 0;
  const totalItems = totalFiles + totalFolders;
  const syncedCount = summary.syncedCount || 0;
  const pendingCount = summary.pendingCount || 0;
  const queuedCount = summary.queuedCount || 0;
  const errorCount = summary.errorCount || 0;
  const skippedCount = summary.skippedCount || 0;
  const trashedCount = summary.trashedCount || 0;

  const pct = totalFiles > 0 ? Math.round((syncedCount / totalFiles) * 100) : 0;

  if (collapsed) {
    return (
      <div className="shrink-0 mb-2.5 px-3 py-1.5 rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-2xs flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Total Badge */}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[var(--gd-surface-elevated)] border border-[var(--gd-border)]/60 text-[11px] font-medium text-[var(--gd-text)]">
            <span className="opacity-70">📦</span>
            <span>{t('gdriveCacheStatTotal')}:</span>
            <strong className="font-semibold">{totalItems.toLocaleString()}</strong>
            <span className="text-[10px] text-[var(--gd-text-secondary)]">({formatSize(summary.totalSizeBytes)})</span>
          </span>

          {/* Synced Badge */}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span>{t('gdriveCacheStatSynced')}:</span>
            <strong className="font-semibold">{syncedCount.toLocaleString()}</strong>
            <span className="text-[10px] font-bold text-emerald-500">({pct}%)</span>
          </span>

          {/* Pending Badge */}
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-[11px] font-medium text-sky-600 dark:text-sky-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
            <span>{t('gdriveCacheStatPending')}:</span>
            <strong className="font-semibold">{pendingCount.toLocaleString()}</strong>
            {queuedCount > 0 && (
              <span className="text-[10px] text-amber-600 dark:text-amber-400 animate-pulse font-semibold">
                ({queuedCount} {t('gdriveCacheStatusQueued')})
              </span>
            )}
          </span>

          {/* Errors Badge */}
          {errorCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-red-500/10 border border-red-500/20 text-[11px] font-medium text-red-600 dark:text-red-400">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span>{t('gdriveCacheStatErrors')}:</span>
              <strong className="font-semibold">{errorCount}</strong>
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={toggleCollapsed}
          title={t('gdriveSummaryToggleExpand')}
          className="shrink-0 text-xs px-2 py-1 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface-elevated)] hover:bg-[var(--gd-surface-hover)] text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>{t('gdriveSummaryToggleExpand')}</span>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="shrink-0 mb-3">
      <div className="flex items-center justify-end mb-1.5">
        <button
          type="button"
          onClick={toggleCollapsed}
          title={t('gdriveSummaryToggleCollapse')}
          className="text-[11px] px-2 py-0.5 rounded-md border border-[var(--gd-border)]/60 bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>{t('gdriveSummaryToggleCollapse')}</span>
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
      {/* Card 1: Tổng mục */}
      <div className="rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] p-3 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--gd-text-secondary)] mb-1">
            <span>{t('gdriveCacheStatTotal')}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-500/10 text-zinc-400 font-medium">Cache</span>
          </div>
          <div className="text-xl font-bold text-[var(--gd-text)]">
            {totalItems.toLocaleString()} <span className="text-xs font-normal opacity-60">{t('gdriveUnitItems')}</span>
          </div>
          <div className="text-[11px] text-[var(--gd-text-secondary)] mt-1 truncate">
            {totalFiles.toLocaleString()} {t('gdriveUnitFiles')} · {totalFolders.toLocaleString()} {t('gdriveUnitFolders')} ({formatSize(summary.totalSizeBytes)})
          </div>
        </div>
        {summary.lastFullScanAt && (
          <div className="text-[10px] text-[var(--gd-text-secondary)] mt-2 opacity-60">
            {t('gdriveCacheLastScan', { time: new Date(summary.lastFullScanAt).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) })}
          </div>
        )}
      </div>

      {/* Card 2: Đã đồng bộ */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-emerald-600 dark:text-emerald-400 mb-1">
            <span>{t('gdriveCacheStatSynced')}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold">{pct}%</span>
          </div>
          <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {syncedCount.toLocaleString()} <span className="text-xs font-normal opacity-70">{t('gdriveUnitFiles')}</span>
          </div>
          <div className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80 mt-1 truncate">
            {t('gdriveCacheUploadedSize', { size: formatSize(summary.syncedSizeBytes) })}
          </div>
        </div>
        {typeof onRescanVault === 'function' && (
          <div className="mt-2">
            {rescanBusy ? (
              <div className="flex items-center justify-between gap-1 w-full text-[11px] px-2 py-1 rounded-lg border border-emerald-500/40 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-medium shadow-2xs">
                <div className="flex items-center gap-1.5 min-w-0 truncate">
                  <svg className="h-3 w-3 shrink-0 animate-spin text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="truncate">
                    {rescanProgress > 0
                      ? t('gdriveRescanVaultScanning', { n: rescanProgress.toLocaleString() })
                      : t('gdriveRescanVaultBusy')}
                  </span>
                </div>
                {typeof onCancelRescanVault === 'function' && (
                  <button
                    type="button"
                    onClick={onCancelRescanVault}
                    title={t('rescanVaultCancel')}
                    className="shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 text-emerald-800 dark:text-emerald-200 cursor-pointer transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={onRescanVault}
                className="w-full text-[11px] px-2 py-1 rounded-lg border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                {t('gdriveRescanVault')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Card 3: Chưa đồng bộ & Trong hàng đợi */}
      <div className="rounded-xl border border-sky-500/20 bg-sky-500/5 p-3 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-sky-600 dark:text-sky-400 mb-1">
            <span>{t('gdriveCacheStatPending')}</span>
            {queuedCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500 font-medium animate-pulse">
                {t('gdriveCacheQueuedDownloading', { count: queuedCount })}
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-sky-600 dark:text-sky-400">
            {pendingCount.toLocaleString()} <span className="text-xs font-normal opacity-70">{t('gdriveUnitFiles')}</span>
          </div>
          <div className="text-[11px] text-[var(--gd-text-secondary)] mt-1 truncate">
            {queuedCount > 0 ? t('gdriveCacheFilesInQueue', { count: queuedCount }) : t('gdriveCacheWaitingQueue')}
          </div>
        </div>
        {pendingCount > 0 && typeof onSyncAllPending === 'function' && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onSyncAllPending}
              disabled={syncAllBusy}
              className="w-full text-[11px] px-2 py-1 rounded-lg border border-sky-500/30 bg-sky-500/10 hover:bg-sky-500/20 text-sky-600 dark:text-sky-400 font-medium flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {syncAllBusy ? (
                <svg className="animate-spin h-3 w-3 text-sky-600 dark:text-sky-400" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth={4} />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
              ) : (
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
              )}
              <span>{syncAllBusy ? t('gdriveCacheBtnSyncingAll') : t('gdriveCacheBtnSyncAllPending')}</span>
            </button>
          </div>
        )}
      </div>

      {/* Card 4: Lỗi & Bỏ qua */}
      <div className="rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] p-3 shadow-xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between text-xs text-[var(--gd-text-secondary)] mb-1">
            <span>{t('gdriveCacheStatErrors')}</span>
            {errorCount > 0 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-500 font-bold">
                {t('gdriveCacheErrorCount', { count: errorCount })}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-medium">
                {t('gdriveCacheStatusGood')}
              </span>
            )}
          </div>
          <div className="text-xl font-bold text-[var(--gd-text)]">
            {errorCount} <span className="text-xs font-normal text-red-500">{t('gdriveUnitErrors')}</span> · {skippedCount} <span className="text-xs font-normal text-zinc-400">{t('gdriveUnitSkipped')}</span>
          </div>
          <div className="text-[11px] text-[var(--gd-text-secondary)] mt-1 truncate">
            {trashedCount > 0 ? t('gdriveCacheInDriveTrash', { count: trashedCount }) : t('gdriveCacheNoCorruptFiles')}
          </div>
        </div>
      </div>
    </div>
  </div>
  );
}
