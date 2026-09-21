import React from 'react';
import { IconClose, IconFolder } from '../../../components/DriveIcons';

export function GDriveHistoryTab({
  t,
  gdriveRecentSynced,
  selectedHistoryIds,
  setSelectedHistoryIds,
  visibleHistoryCount,
  setVisibleHistoryCount,
  lastSelectedHistoryRef,
  applyHistorySelection,
  handleSelectionClick,
}) {
  return (
    <div className="h-full flex flex-col">
      {gdriveRecentSynced.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-sm opacity-60">
          {t('gdriveRecentSyncedEmpty')}
        </div>
      ) : (
        <div className={`flex-1 overflow-y-auto ${selectedHistoryIds.size > 0 ? 'gd-list-has-selection' : ''}`}>
          {selectedHistoryIds.size > 0 && (
            <div className="shrink-0 bg-[var(--gd-surface)] border-b border-[var(--gd-border)] p-2 flex items-center justify-between text-xs shadow-sm sticky top-0 z-10">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[var(--gd-primary)]">
                  {t('gdriveSelectedFilesCount', { n: selectedHistoryIds.size })}
                </span>
                <button
                  type="button"
                  className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline"
                  onClick={() => {
                    setSelectedHistoryIds(new Set());
                    lastSelectedHistoryRef.current = null;
                  }}
                >
                  {t('gdriveBtnDeselect')}
                </button>
              </div>
              <button
                type="button"
                className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded font-medium flex items-center gap-1 transition-colors"
                onClick={() => {
                  for (const id of selectedHistoryIds) {
                    window.televault?.gdrive?.removeHistoryItem(id);
                  }
                  setSelectedHistoryIds(new Set());
                }}
              >
                <IconClose className="h-4 w-4" />
                {t('gdriveBtnDeleteSelected')}
              </button>
            </div>
          )}
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                <th className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="cursor-pointer accent-[var(--gd-primary)] align-middle"
                    checked={gdriveRecentSynced.length > 0 && selectedHistoryIds.size === gdriveRecentSynced.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = selectedHistoryIds.size > 0 && selectedHistoryIds.size < gdriveRecentSynced.length;
                      }
                    }}
                    onChange={() => {
                      if (selectedHistoryIds.size === gdriveRecentSynced.length) {
                        setSelectedHistoryIds(new Set());
                        if (lastSelectedHistoryRef) lastSelectedHistoryRef.current = null;
                      } else {
                        const allIds = gdriveRecentSynced.map((item) => item.driveFileId);
                        setSelectedHistoryIds(new Set(allIds));
                      }
                    }}
                    title={selectedHistoryIds.size === gdriveRecentSynced.length ? t('gdriveBtnDeselect') : t('gdriveBtnSelectAll')}
                    aria-label={t('gdriveBtnSelectAll')}
                  />
                </th>
                <th className="px-3 py-2 min-w-0">{t('gdriveColFileName')}</th>
                <th className="w-24 px-3 py-2 text-right whitespace-nowrap">{t('gdriveColSize')}</th>
                <th className="w-36 px-3 py-2 whitespace-nowrap">{t('gdriveSyncErrorColTime')}</th>
                <th className="w-16 px-3 py-2 text-center whitespace-nowrap">{t('gdriveColStatus')}</th>
                <th className="w-14 px-2 py-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {gdriveRecentSynced.slice(0, visibleHistoryCount).map((item, idx) => (
                <tr 
                  key={item.driveFileId ? `${item.driveFileId}-${idx}` : idx} 
                  className={`gd-row border-b border-[var(--gd-border)] cursor-pointer hover:bg-[var(--gd-hover)] transition-colors ${selectedHistoryIds.has(item.driveFileId) ? 'selected' : ''}`}
                  onMouseDown={(e) => {
                    if (e.shiftKey || e.ctrlKey || e.metaKey) {
                      e.preventDefault();
                    }
                  }}
                  onClick={(e) => {
                    const orderedKeys = gdriveRecentSynced.slice(0, visibleHistoryCount).map(i => i.driveFileId);
                    handleSelectionClick(e, item.driveFileId, orderedKeys, applyHistorySelection);
                  }}
                >
                  <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="gd-row-checkbox"
                      checked={selectedHistoryIds.has(item.driveFileId)}
                      onChange={() => applyHistorySelection(item.driveFileId, { additive: true, range: false })}
                    />
                  </td>
                  <td className="px-3 py-2.5 min-w-0">
                    <div className="min-w-0 flex flex-col justify-center">
                      <span
                        className="text-xs font-medium break-words line-clamp-2 text-[var(--gd-text)]"
                        title={item.drivePath.split('/').at(-1) || item.drivePath}
                      >
                        {item.drivePath.split('/').at(-1) || item.drivePath}
                      </span>
                      <div
                        className="text-[11px] opacity-60 truncate mt-0.5 text-[var(--gd-text-secondary)]"
                        title={`Drive: ${item.drivePath} → Vault: ${item.vaultPath}`}
                      >
                        Drive: {item.drivePath} → Vault: {item.vaultPath}
                      </div>
                    </div>
                  </td>
                  <td className="w-24 px-3 py-2.5 text-[var(--gd-text-secondary)] text-right text-xs whitespace-nowrap">
                    {item.size > 0 ? `${(item.size / (1024 * 1024)).toFixed(2)} MB` : '—'}
                  </td>
                  <td className="w-36 px-3 py-2.5 text-[var(--gd-text-secondary)] text-[11px] whitespace-nowrap">
                    {new Date(item.syncedAt).toLocaleString()}
                  </td>
                  <td className="w-16 px-3 py-2.5 text-center">
                    <span className="text-green-500 font-semibold">✓</span>
                  </td>
                  <td className="px-2 py-2">
                    <div className="gd-row-actions justify-end shrink-0">
                      <button
                        type="button"
                        className="gd-row-action"
                        onClick={() => {
                          const vaultDir = item.vaultPath.substring(0, item.vaultPath.lastIndexOf('/'));
                          window.dispatchEvent(new CustomEvent('gd-navigate', { detail: vaultDir + '/' }));
                        }}
                        title={t('gdriveOpenFolder')}
                      >
                        <IconFolder className="h-5 w-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleHistoryCount < gdriveRecentSynced.length && (
            <div className="p-3 flex justify-center">
              <button
                type="button"
                className="px-4 py-2 text-xs font-medium text-[var(--gd-primary)] border border-[var(--gd-primary)] rounded hover:bg-[var(--gd-primary-light)]/10 transition-colors"
                onClick={() => setVisibleHistoryCount((c) => c + 50)}
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
