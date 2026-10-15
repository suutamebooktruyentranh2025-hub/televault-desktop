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
    if (item.isSynced) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          📁 {t('gdriveCacheStatusSynced')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">
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
    case 'folder':
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-blue-500/10 text-blue-500 border border-blue-500/20">
          📁 {t('gdriveCacheStatusFolder')}
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

export function GDriveCacheTable({
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
  typeFilter,
  handleTypeChange,
  sortBy,
  sortOrder,
  handleSort,
  loading,
  actionBusyId,
  syncAllBusy,
  handleSyncFile,
  handleSyncAllPending,
  handleExportCsv,
  refresh,
}) {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const startRow = total > 0 ? (page - 1) * limit + 1 : 0;
  const endRow = Math.min(page * limit, total);

  const handleOpenInVault = (item) => {
    if (!item?.vaultPath) return;
    let targetFolder = '/';
    let targetFilePath = null;

    if (item.isFolder) {
      targetFolder = item.vaultPath.endsWith('/') ? item.vaultPath : `${item.vaultPath}/`;
    } else {
      targetFilePath = item.vaultPath;
      const lastSlash = item.vaultPath.lastIndexOf('/');
      if (lastSlash >= 0) {
        targetFolder = item.vaultPath.substring(0, lastSlash + 1) || '/';
      } else {
        targetFolder = '/';
      }
    }
    if (!targetFolder.startsWith('/')) {
      targetFolder = '/' + targetFolder;
    }

    window.dispatchEvent(
      new CustomEvent('gd-navigate', {
        detail: {
          folder: targetFolder,
          filePath: targetFilePath,
        },
      })
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[var(--gd-surface)] rounded-xl border border-[var(--gd-border)] overflow-hidden shadow-xs">
      {/* Toolbar */}
      <div className="p-3 border-b border-[var(--gd-border)] flex flex-wrap items-center justify-between gap-3 bg-[var(--gd-surface-elevated)]">
        <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[280px]">
          {/* Search box */}
          <div className="relative flex-1 min-w-[200px] max-w-[340px]">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder={t('gdriveCacheSearchPlaceholder')}
              className="w-full text-xs pl-8 pr-3 py-1.5 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] focus:outline-hidden focus:border-[var(--gd-primary)] transition-colors"
            />
            <svg
              className="absolute left-2.5 top-2 h-3.5 w-3.5 text-[var(--gd-text-secondary)] opacity-60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Status Filter */}
          <select
            value={status}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] cursor-pointer focus:outline-hidden focus:border-[var(--gd-primary)]"
          >
            <option value="all">{t('gdriveCacheStatusAll')}</option>
            <option value="pending">{t('gdriveCacheStatusPending')}</option>
            <option value="synced">{t('gdriveCacheStatusSynced')}</option>
            <option value="queued">{t('gdriveCacheStatusQueued')}</option>
            <option value="error">{t('gdriveCacheStatusError')}</option>
            <option value="skipped">{t('gdriveCacheStatusSkipped')}</option>
            <option value="trashed">{t('gdriveCacheStatusTrashed')}</option>
            <option value="folder">{t('gdriveCacheStatusFolder')}</option>
          </select>

          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] cursor-pointer focus:outline-hidden focus:border-[var(--gd-primary)]"
          >
            <option value="all">{t('gdriveCacheTypeAll')}</option>
            <option value="files">{t('gdriveCacheTypeFiles')}</option>
            <option value="folders">{t('gdriveCacheTypeFolders')}</option>
          </select>

          {/* Refresh button */}
          <button
            type="button"
            onClick={refresh}
            title={t('gdriveBtnRefreshList')}
            className="p-1.5 text-xs rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] text-[var(--gd-text)] cursor-pointer transition-colors"
          >
            <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[var(--gd-primary)]' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSyncAllPending}
            disabled={syncAllBusy}
            className="text-xs px-3 py-1.5 rounded-lg bg-[var(--gd-primary)] text-white hover:opacity-90 disabled:opacity-50 cursor-pointer font-medium flex items-center gap-1.5 transition-opacity"
          >
            {syncAllBusy && (
              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            )}
            {t('gdriveCacheBtnSyncAllPending')}
          </button>


          <button
            type="button"
            onClick={handleExportCsv}
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] text-[var(--gd-text)] cursor-pointer font-medium flex items-center gap-1.5 transition-colors"
          >
            <svg className="h-3.5 w-3.5 text-[var(--gd-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('gdriveCacheBtnExportCsv')}
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="sticky top-0 z-10 bg-[var(--gd-surface-elevated)] text-[11px] font-semibold text-[var(--gd-text-secondary)] shadow-xs">
            <tr>
              <th
                onClick={() => handleSort('name')}
                className="px-3 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center gap-1">
                  <span>{t('gdriveCacheColName')}</span>
                  {sortBy === 'name' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </th>
              <th
                onClick={() => handleSort('drive_path')}
                className="px-3 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none hidden md:table-cell bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center gap-1">
                  <span>{t('gdriveCacheColPath')}</span>
                  {sortBy === 'drive_path' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </th>
              <th
                onClick={() => handleSort('size')}
                className="px-3 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none text-right w-24 bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center justify-end gap-1">
                  <span>{t('gdriveCacheColSize')}</span>
                  {sortBy === 'size' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </th>
              <th
                onClick={() => handleSort('modified_time')}
                className="px-3 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none hidden lg:table-cell w-36 bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center gap-1">
                  <span>{t('gdriveCacheColMtime')}</span>
                  {sortBy === 'modified_time' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </th>
              <th
                onClick={() => handleSort('status')}
                className="px-3 py-2.5 cursor-pointer hover:text-[var(--gd-text)] select-none w-32 bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]"
              >
                <div className="flex items-center gap-1">
                  <span>{t('gdriveCacheColStatus')}</span>
                  {sortBy === 'status' && <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>}
                </div>
              </th>
              <th className="px-3 py-2.5 text-right select-none whitespace-nowrap min-w-[120px] bg-[var(--gd-surface-elevated)] border-b border-[var(--gd-border)]">
                {t('gdriveCacheColActions')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--gd-border)]">
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="text-center py-12 text-sm text-[var(--gd-text-secondary)] opacity-60">
                  {loading ? t('gdriveLoadingList') : t('gdriveCacheEmpty')}
                </td>
              </tr>
            ) : (
              items.map((item) => {
                const canSync = !item.isFolder && (item.status === 'pending' || item.status === 'error');
                const canOpenInVault = Boolean(item.vaultPath);
                const isBusy = actionBusyId === item.id;

                return (
                  <tr
                    key={item.id}
                    className="hover:bg-[var(--gd-surface-hover)] transition-colors group"
                  >
                    {/* Tên */}
                    <td className="px-3 py-2 max-w-[240px]">
                      <div className="flex items-center gap-2">
                        {getFileIcon(item)}
                        <span className="font-medium text-[var(--gd-text)] truncate" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      {/* Monospace path fallback for mobile */}
                      <div className="text-[10px] text-[var(--gd-text-secondary)] truncate md:hidden mt-0.5 opacity-70">
                        {item.drivePath}
                      </div>
                    </td>

                    {/* Đường dẫn */}
                    <td className="px-3 py-2 text-[11px] text-[var(--gd-text-secondary)] font-mono truncate max-w-[260px] hidden md:table-cell" title={item.drivePath}>
                      {item.drivePath}
                    </td>

                    {/* Kích thước */}
                    <td className="px-3 py-2 text-right text-[var(--gd-text-secondary)] font-mono whitespace-nowrap">
                      {formatSize(item.size)}
                    </td>

                    {/* Ngày sửa đổi */}
                    <td className="px-3 py-2 text-[11px] text-[var(--gd-text-secondary)] hidden lg:table-cell whitespace-nowrap">
                      {formatDate(item.modifiedTime)}
                    </td>

                    {/* Trạng thái */}
                    <td className="px-3 py-2 whitespace-nowrap">
                      {renderStatusBadge(item.status, item.errorMessage, t, item)}
                    </td>

                    {/* Thao tác */}
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {canSync && (
                          <button
                            type="button"
                            onClick={() => handleSyncFile(item.id)}
                            disabled={isBusy}
                            title={t('gdriveCacheBtnAddToQueueTooltip')}
                            className="h-6 w-6 rounded-md bg-[var(--gd-primary)] text-white hover:opacity-90 disabled:opacity-50 cursor-pointer transition-all inline-flex items-center justify-center shadow-2xs active:scale-95 shrink-0"
                          >
                            {isBusy ? (
                              <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                              </svg>
                            ) : (
                              <svg className="h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7m4-4v6m3-3h-6" />
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
      <div className="p-3 border-t border-[var(--gd-border)] flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--gd-text-secondary)] bg-[var(--gd-surface-elevated)] shrink-0">
        <div className="flex items-center gap-2">
          <span>
            {t('gdrivePaginationRange', { start: startRow, end: endRow, total: total.toLocaleString() })}
          </span>
          <span className="opacity-40">|</span>
          <div className="flex items-center gap-1">
            <span>{t('gdrivePaginationDisplay')}</span>
            <select
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
              className="text-xs px-1.5 py-0.5 rounded border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] cursor-pointer"
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
              className="px-2 py-1 rounded border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {t('gdrivePaginationPrevious')}
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="px-2 py-1 rounded border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              {t('gdrivePaginationNext')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
