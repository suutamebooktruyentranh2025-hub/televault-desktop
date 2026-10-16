import React from 'react';
import { IconClose } from '../../../components/DriveIcons';

export function GDriveErrorsTab({
  t,
  gdriveErrors,
  selectedErrorIds,
  setSelectedErrorIds,
  visibleErrorsCount,
  setVisibleErrorsCount,
  lastSelectedErrorRef,
  applyErrorSelection,
  handleSelectionClick,
  handleRetryFile,
  handleRetryErrors,
}) {
  return (
    <div className="h-full flex flex-col">
      {gdriveErrors.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm opacity-60">
          {t('gdriveSyncErrorsEmpty')}
        </div>
      ) : (
        <div className={`flex-1 overflow-y-auto ${selectedErrorIds.size > 0 ? 'gd-list-has-selection' : ''}`}>
          {selectedErrorIds.size > 0 && (
            <div className="shrink-0 bg-[var(--gd-surface)] border-b border-[var(--gd-border)] p-2 flex items-center justify-between text-xs shadow-sm sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--gd-primary)]">
                  {t('gdriveSelectedFilesCount', { n: selectedErrorIds.size })}
                </span>
                <button
                  type="button"
                  className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline"
                  onClick={() => {
                    setSelectedErrorIds(new Set());
                    lastSelectedErrorRef.current = null;
                  }}
                >
                  {t('gdriveBtnDeselect')}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="px-3 py-1 bg-[#0066cc]/10 hover:bg-[#0066cc]/20 text-[#0066cc] rounded font-medium flex items-center gap-1 transition-colors"
                  onClick={() => {
                    const ids = Array.from(selectedErrorIds);
                    if (typeof handleRetryErrors === 'function') {
                      handleRetryErrors(ids);
                    } else {
                      for (const id of ids) {
                        handleRetryFile(id);
                      }
                    }
                    setSelectedErrorIds(new Set());
                    if (lastSelectedErrorRef) lastSelectedErrorRef.current = null;
                  }}
                >
                  {t('gdriveBtnRetrySelected')}
                </button>
                <button
                  type="button"
                  className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded font-medium flex items-center gap-1 transition-colors"
                  onClick={() => {
                    for (const id of selectedErrorIds) {
                      window.televault?.gdrive?.removeErrorItem(id);
                    }
                    setSelectedErrorIds(new Set());
                  }}
                >
                  <IconClose className="h-4 w-4" />
                  {t('gdriveBtnDeleteSelected')}
                </button>
              </div>
            </div>
          )}
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                <th className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="cursor-pointer accent-[var(--gd-primary)] align-middle"
                    checked={gdriveErrors.length > 0 && selectedErrorIds.size === gdriveErrors.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = selectedErrorIds.size > 0 && selectedErrorIds.size < gdriveErrors.length;
                      }
                    }}
                    onChange={() => {
                      if (selectedErrorIds.size === gdriveErrors.length) {
                        setSelectedErrorIds(new Set());
                        if (lastSelectedErrorRef) lastSelectedErrorRef.current = null;
                      } else {
                        const allIds = gdriveErrors.map((item) => item.driveFileId);
                        setSelectedErrorIds(new Set(allIds));
                      }
                    }}
                    title={selectedErrorIds.size === gdriveErrors.length ? t('gdriveBtnDeselect') : t('gdriveBtnSelectAll')}
                    aria-label={t('gdriveBtnSelectAll')}
                  />
                </th>
                <th className="w-2/5 px-3 py-2 min-w-0">{t('gdriveSyncErrorColFile')}</th>
                <th className="px-3 py-2 min-w-0">{t('gdriveSyncErrorColError')}</th>
                <th className="w-36 px-3 py-2 whitespace-nowrap">{t('gdriveSyncErrorColTime')}</th>
                <th className="w-16 px-3 py-2 text-center whitespace-nowrap">{t('gdriveColStatus')}</th>
                <th className="w-14 px-2 py-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {gdriveErrors.slice(0, visibleErrorsCount).map((err, idx) => (
                <tr 
                  key={err.driveFileId ? `${err.driveFileId}-${idx}` : idx} 
                  className={`gd-row border-b border-[var(--gd-border)] cursor-pointer hover:bg-[var(--gd-hover)] transition-colors ${selectedErrorIds.has(err.driveFileId) ? 'selected' : ''}`}
                  onMouseDown={(e) => {
                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                    }
                  }}
                  onClick={(e) => {
                    const orderedKeys = gdriveErrors.slice(0, visibleErrorsCount).map(i => i.driveFileId);
                    handleSelectionClick(e, err.driveFileId, orderedKeys, applyErrorSelection);
                  }}
                >
                  <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="gd-row-checkbox"
                      checked={selectedErrorIds.has(err.driveFileId)}
                      onChange={() => applyErrorSelection(err.driveFileId, { additive: true, range: false })}
                    />
                  </td>
                  <td className="px-3 py-2.5 min-w-0">
                    <div className="min-w-0 flex flex-col justify-center">
                      <span className="text-xs font-medium break-words line-clamp-2 text-[var(--gd-text)]" title={err.fileName}>
                        {err.fileName}
                      </span>
                      <div className="text-[11px] opacity-60 truncate mt-0.5 text-[var(--gd-text-secondary)]" title={err.drivePath}>
                        {err.drivePath}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-red-500 min-w-0">
                    <span className="break-words line-clamp-2 block" title={err.errorMessage}>
                      {err.errorMessage}
                    </span>
                  </td>
                  <td className="w-36 px-3 py-2.5 text-[var(--gd-text-secondary)] text-[11px] whitespace-nowrap">
                    {new Date(err.failedAt).toLocaleString()}
                  </td>
                  <td className="w-16 px-3 py-2.5 text-center">
                    <span className="text-red-500 font-semibold">❌</span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="gd-row-actions justify-end shrink-0">
                      <button
                        type="button"
                        className="gd-row-action text-[var(--gd-primary)]"
                        onClick={() => handleRetryFile(err.driveFileId)}
                        title={t('gdriveSyncErrorActionRetry')}
                      >
                        <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleErrorsCount < gdriveErrors.length && (
            <div className="p-3 flex justify-center">
              <button
                type="button"
                className="px-4 py-2 text-xs font-medium text-[var(--gd-primary)] border border-[var(--gd-primary)] rounded hover:bg-[var(--gd-primary-light)]/10 transition-colors"
                onClick={() => setVisibleErrorsCount((c) => c + 50)}
              >
                {t('gdriveShowMore')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
