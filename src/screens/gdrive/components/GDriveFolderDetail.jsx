import React from 'react';
import { IconFolder, IconFile, IconPdf, IconImage, IconVideo } from '../../../components/DriveIcons';

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

function getFileIcon(item) {
  if (item.isFolder) {
    return <IconFolder className="h-4 w-4 shrink-0 text-amber-500" />;
  }
  const name = String(item.name || '').toLowerCase();
  if (name.endsWith('.pdf')) return <IconPdf className="h-4 w-4 shrink-0" />;
  if (name.endsWith('.jpg') || name.endsWith('.png') || name.endsWith('.webp') || name.endsWith('.gif')) {
    return <IconImage className="h-4 w-4 shrink-0" />;
  }
  if (name.endsWith('.mp4') || name.endsWith('.mkv') || name.endsWith('.webm') || name.endsWith('.avi')) {
    return <IconVideo className="h-4 w-4 shrink-0" />;
  }
  return <IconFile className="h-4 w-4 shrink-0 text-zinc-400" />;
}

function renderStatusBadge(status, errorMessage, t, item = null) {
  if (item?.isFolder) {
    const total = item.folderTotalFiles || 0;
    const synced = item.folderSyncedCount || 0;
    const isSynced = item.isSynced || (total > 0 && synced >= total);

    if (isSynced) {
      return (
        <span
          title={total > 0 ? `${synced}/${total} ${t('gdriveUnitFiles')}` : undefined}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t('gdriveCacheStatusSynced')}
        </span>
      );
    }

    if (synced > 0) {
      return (
        <span
          title={`${synced}/${total} ${t('gdriveUnitFiles')}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          📁 {synced}/{total}
        </span>
      );
    }

    if (total > 0) {
      return (
        <span
          title={`0/${total} ${t('gdriveUnitFiles')}`}
          className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-dashed border-sky-500/30"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          {t('gdriveCacheStatusPending')}
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
        📁 {t('gdriveCacheStatusFolder')}
      </span>
    );
  }

  switch (status) {
    case 'synced':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {t('gdriveCacheStatusSynced')}
        </span>
      );
    case 'queued':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 animate-pulse">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
          {t('gdriveCacheStatusQueued')}
        </span>
      );
    case 'error':
      return (
        <span
          title={errorMessage || t('gdriveSyncErrorGeneric')}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 cursor-help"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
          {t('gdriveCacheStatusError')}
        </span>
      );
    case 'skipped':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-500/10 text-zinc-500 border border-zinc-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-400" />
          {t('gdriveCacheStatusSkipped')}
        </span>
      );
    case 'trashed':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-rose-500/10 text-rose-500 border border-rose-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
          {t('gdriveCacheStatusTrashed')}
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-dashed border-sky-500/30">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-500" />
          {t('gdriveCacheStatusPending')}
        </span>
      );
  }
}

/**
 * Detail panel: breadcrumb + toolbar + file table for the selected folder.
 */
export function GDriveFolderDetail({
  t,
  items,
  total,
  page,
  setPage,
  limit,
  setLimit,
  search,
  handleSearchChange,
  status,
  handleStatusChange,
  sortBy,
  sortOrder,
  handleSort,
  loading,
  actionBusyId,
  syncFolderBusy,
  handleSyncFile,
  handleSyncFolder,
  handleOpenInVault,
  navigateToFolder,
  selectedFolderId,
  selectedFolderPath,
  navigateToBreadcrumb,
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startRow = total > 0 ? (page - 1) * limit + 1 : 0;
  const endRow = Math.min(page * limit, total);

  return (
    <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden bg-[var(--gd-surface)]">
      {/* Unified Toolbar */}
      <div className="shrink-0 px-3.5 py-2 border-b border-[var(--gd-border)] bg-[var(--gd-surface)] flex items-center justify-between gap-2.5 min-h-[44px]">
        {/* Left: Back (if not root) + Status Filter */}
        <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
          {selectedFolderId !== 'root' && selectedFolderPath?.length > 1 && (
            <button
              type="button"
              onClick={() => navigateToBreadcrumb(selectedFolderPath.length - 2)}
              title={selectedFolderPath[selectedFolderPath.length - 2]?.name}
              className="p-1.5 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] text-[var(--gd-text)] cursor-pointer transition-colors shadow-2xs shrink-0 flex items-center justify-center"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>
          )}

          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] cursor-pointer focus:outline-hidden focus:border-[var(--gd-primary)] shadow-2xs shrink-0"
          >
            <option value="all">{t('gdriveCacheStatusAll')}</option>
            <option value="pending">{t('gdriveCacheStatusPending')}</option>
            <option value="synced">{t('gdriveCacheStatusSynced')}</option>
          </select>
        </div>


      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--gd-surface-elevated)] text-[11px] font-semibold text-[var(--gd-text-secondary)] shadow-2xs">
            <tr>
              <th
                onClick={() => handleSort('name')}
                className="px-3.5 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center gap-1.5">
                  <span>{t('gdriveCacheColName')}</span>
                  {sortBy === 'name' && (
                    <span className="text-[var(--gd-primary)] font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('size')}
                className="px-3 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none text-right w-28 bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center justify-end gap-1.5">
                  <span>{t('gdriveCacheColSize')}</span>
                  {sortBy === 'size' && (
                    <span className="text-[var(--gd-primary)] font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('modified_time')}
                className="px-3 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none hidden md:table-cell w-36 bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center gap-1.5">
                  <span>{t('gdriveCacheColMtime')}</span>
                  {sortBy === 'modified_time' && (
                    <span className="text-[var(--gd-primary)] font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th
                onClick={() => handleSort('status')}
                className="px-3 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none w-32 text-center bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center justify-center gap-1.5">
                  <span>{t('gdriveCacheColStatus')}</span>
                  {sortBy === 'status' && (
                    <span className="text-[var(--gd-primary)] font-bold">{sortOrder === 'asc' ? '↑' : '↓'}</span>
                  )}
                </div>
              </th>
              <th className="px-3 py-2.5 text-right select-none whitespace-nowrap w-[80px] bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]">
                {t('gdriveCacheColActions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gd-border)]/60">
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-16 text-center">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <div className="h-10 w-10 rounded-full bg-[var(--gd-surface-elevated)] border border-[var(--gd-border)] flex items-center justify-center text-xl text-[var(--gd-text-secondary)] opacity-60">
                      📁
                    </div>
                    <span className="text-xs font-medium text-[var(--gd-text-secondary)]">
                      {loading ? t('loading') : t('gdriveFolderEmptyOrUnscanned')}
                    </span>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((item, idx) => {
                const isFolderSynced = item.isFolder && (
                  Boolean(item.isSynced) ||
                  ((item.folderTotalFiles || 0) > 0 && (item.folderSyncedCount || 0) >= (item.folderTotalFiles || 0))
                );
                const isFileSynced = !item.isFolder && (
                  item.status === 'synced' || Boolean(item.isSynced)
                );
                const isAlreadySynced = item.isFolder ? isFolderSynced : isFileSynced;

                const canAddToQueue = !isAlreadySynced && (
                  item.isFolder
                    ? (item.folderTotalFiles === undefined || item.folderTotalFiles > 0)
                    : (item.status === 'pending' || item.status === 'error')
                );

                const canOpenInVault = Boolean(item.vaultPath);
                const isBusy = item.isFolder
                  ? syncFolderBusy === item.id
                  : actionBusyId === item.id;

                return (
                  <tr
                    key={item.id ? `${item.id}-${idx}` : idx}
                    className={`hover:bg-[var(--gd-surface-hover)]/70 transition-colors group ${
                      item.isFolder ? 'cursor-pointer' : ''
                    }`}
                    onClick={item.isFolder ? () => navigateToFolder(item.id, item.name) : undefined}
                  >
                    {/* Name */}
                    <td className="px-3.5 py-2.5 max-w-[340px]">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {getFileIcon(item)}
                        <div className="min-w-0 flex-1">
                          <span
                            className={`truncate text-xs block ${
                              item.isFolder
                                ? 'font-semibold text-[var(--gd-text)] group-hover:text-[var(--gd-primary)]'
                                : 'font-normal text-[var(--gd-text)]'
                            }`}
                            title={item.name}
                          >
                            {item.name}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Size */}
                    <td className="px-3 py-2.5 text-right text-[var(--gd-text-secondary)] font-mono whitespace-nowrap text-[11px]">
                      {item.isFolder ? `${(item.folderTotalFiles || 0).toLocaleString()} ${t('gdriveUnitFiles')}` : formatSize(item.size)}
                    </td>

                    {/* Modified Time */}
                    <td className="px-3 py-2.5 text-[11px] text-[var(--gd-text-secondary)] hidden md:table-cell whitespace-nowrap">
                      {formatDate(item.modifiedTime)}
                    </td>

                    {/* Status */}
                    <td className="px-3 py-2.5 whitespace-nowrap text-center">
                      {renderStatusBadge(item.status, item.errorMessage, t, item)}
                    </td>

                    {/* Actions */}
                    <td className="px-3 py-2 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {canAddToQueue && (
                          <button
                            type="button"
                            onClick={() => (item.isFolder ? handleSyncFolder(item.id, true) : handleSyncFile(item.id))}
                            disabled={isBusy}
                            title={item.isFolder ? t('gdriveBtnSyncFolderTooltip') : t('gdriveCacheBtnAddToQueueTooltip')}
                            className="h-6 w-6 rounded-md bg-[var(--gd-primary)] text-white hover:opacity-90 disabled:opacity-50 cursor-pointer transition-all inline-flex items-center justify-center shadow-2xs active:scale-95 shrink-0"
                          >
                            {isBusy ? (
                              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : (
                              <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                              </svg>
                            )}
                          </button>
                        )}
                        {canOpenInVault && (
                          <button
                            type="button"
                            onClick={() => handleOpenInVault(item)}
                            title={
                              item.isFolder
                                ? t('gdriveCacheBtnOpenFolderInVault')
                                : t('gdriveCacheBtnOpenFileInVault')
                            }
                            className="h-6 w-6 rounded-md bg-[#24A1DE]/10 hover:bg-[#24A1DE]/20 dark:bg-[#24A1DE]/15 dark:hover:bg-[#24A1DE]/25 border border-[#24A1DE]/30 text-[#127fb5] dark:text-[#38bdf8] cursor-pointer transition-all inline-flex items-center justify-center shadow-2xs active:scale-95 shrink-0"
                          >
                            <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="12" fill="#24A1DE" />
                              <path
                                d="M5.4 11.9l11.6-4.6c.5-.2 1 .1.8.7l-2 9.4c-.1.6-.5.7-1 .4l-2.8-2.1-1.3 1.3c-.2.2-.3.3-.6.3l.2-2.8 5.1-4.6c.2-.2 0-.3-.3-.1l-6.3 4-2.7-.9c-.6-.2-.6-.6.1-.8z"
                                fill="#ffffff"
                              />
                            </svg>
                          </button>
                        )}
                        <a
                          href={item.isFolder ? `https://drive.google.com/drive/folders/${item.id}` : `https://drive.google.com/open?id=${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={t('gdriveCacheBtnOpenDrive')}
                          className="h-6 w-6 rounded-md bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] border border-[var(--gd-border)] text-[var(--gd-text)] cursor-pointer transition-all inline-flex items-center justify-center shadow-2xs active:scale-95 shrink-0"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const url = item.isFolder
                              ? `https://drive.google.com/drive/folders/${item.id}`
                              : `https://drive.google.com/open?id=${item.id}`;
                            if (window.televault?.shell?.openExternal) {
                              window.televault.shell.openExternal(url);
                            } else {
                              window.open(url, '_blank', 'noopener,noreferrer');
                            }
                          }}
                        >
                          <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 87.3 78" fill="none">
                            <path d="M6.6 66.85l3.85 6.65c.8 1.4 1.95 2.5 3.3 3.3l13.75-23.8H0c0 1.55.4 3.1 1.2 4.5l5.4 9.35z" fill="#0066DA" />
                            <path d="M43.65 25l13.75-23.8C56 0.4 54.45 0 52.9 0H34.4c-1.55 0-3.1.4-4.5 1.2L16.15 25h27.5z" fill="#00AC47" />
                            <path d="M73.55 76.8c1.35-.8 2.5-1.9 3.3-3.3l1.6-2.75 7.65-13.25c.8-1.4 1.2-2.95 1.2-4.5H60l5.7 9.9 7.85 13.9z" fill="#EA4335" />
                            <path d="M43.65 25L30 48.8h27.3L71 25H43.65z" fill="#2684FC" />
                            <path d="M30 48.8L16.25 72.6c1.35.8 2.9 1.2 4.5 1.2h32.9c1.55 0 3.1-.4 4.45-1.2L71 48.8H30z" fill="#FFBA00" />
                            <path d="M73.55 26.2L60 49.7h27.3c0-1.55-.4-3.1-1.2-4.5l-7.65-13.25-4.9-5.75z" fill="#00832D" />
                          </svg>
                        </a>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="shrink-0 px-3.5 py-2 border-t border-[var(--gd-border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--gd-text-secondary)] bg-[var(--gd-surface-elevated)]/60">
        <div className="flex items-center gap-3">
          <span>
            {t('gdrivePaginationRange', { start: startRow, end: endRow, total: total.toLocaleString() })}
          </span>
          <span className="opacity-40">|</span>
          <div className="flex items-center gap-1.5">
            <span>{t('gdrivePaginationDisplay')}</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="text-xs px-1.5 py-0.5 rounded-md border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] cursor-pointer"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span>
            {t('gdrivePaginationPage', { page, totalPages })}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="px-2 py-1 rounded-md border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
            >
              ←
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-1 rounded-md border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors shadow-2xs"
            >
              →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
