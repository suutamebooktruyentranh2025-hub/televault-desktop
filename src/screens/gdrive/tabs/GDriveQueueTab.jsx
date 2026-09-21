import React, { useMemo } from 'react';
import { GDriveQueueRow } from '../components/GDriveQueueRow';
import { formatGdriveSyncStatus } from '../components/GDriveSharedSettings';
import { IconClose } from '../../../components/DriveIcons';
import { useToast } from '../../../context/ToastContext';

export function GDriveQueueTab({
  t,
  gdriveQueue = [],
  selectedQueueIds,
  setSelectedQueueIds,
  visibleQueueCount,
  setVisibleQueueCount,
  lastSelectedRef,
  applyQueueSelection,
  handleSelectionClick,
  gdriveActiveTasks = [],
  gdriveCurrentSyncFile,
  gdriveCurrentSyncProgress,
  gdriveCurrentSyncSpeedBps,
  gdriveSyncPhase,
  gdriveDownloadProgress,
  gdriveUploadProgress,
  handleScanNow,
  isScanning,
  handleClearQueue,
}) {
  const { showToast } = useToast();

  const activeTasksMap = useMemo(() => {
    const byId = new Map();
    const byName = new Map();
    if (Array.isArray(gdriveActiveTasks)) {
      for (const task of gdriveActiveTasks) {
        if (task.driveFileId) byId.set(task.driveFileId, task);
        if (task.fileName) byName.set(task.fileName, task);
      }
    }
    return { byId, byName };
  }, [gdriveActiveTasks]);

  const handleDeselect = () => {
    setSelectedQueueIds(new Set());
    if (lastSelectedRef) lastSelectedRef.current = null;
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedQueueIds);
    if (ids.length === 0) return;
    if (typeof window.televault?.gdrive?.removeQueueBatch === 'function') {
      await window.televault.gdrive.removeQueueBatch(ids);
    } else {
      for (const id of ids) {
        await window.televault?.gdrive?.removeQueueItem?.(id);
      }
    }
    showToast(t('gdriveToastQueueDeletedCount', { count: ids.length }), { variant: 'success' });
    setSelectedQueueIds(new Set());
    if (lastSelectedRef) lastSelectedRef.current = null;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header Toolbar */}
      <div className="shrink-0 bg-[var(--gd-surface)] border-b border-[var(--gd-border)] px-3 py-2 flex items-center justify-between text-xs shadow-xs">
        {selectedQueueIds.size > 0 ? (
          <>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-[var(--gd-primary)]">
                {t('gdriveSelectedFilesCount', { n: selectedQueueIds.size })}
              </span>
              <button
                type="button"
                className="px-2 py-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:underline cursor-pointer"
                onClick={handleDeselect}
              >
                {t('gdriveBtnDeselect')}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                className="px-3 py-1 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded font-medium flex items-center gap-1 transition-colors cursor-pointer"
                onClick={handleDeleteSelected}
              >
                <IconClose className="h-4 w-4" />
                {t('gdriveBtnDeleteSelected')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <span className="text-[var(--gd-text-secondary)] font-medium">
                {t('gdriveSyncQueueTotalCount', { count: gdriveQueue.length })}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {gdriveQueue.length > 0 && handleClearQueue && (
                <button
                  type="button"
                  className="text-red-500 hover:underline font-medium cursor-pointer px-2 py-1"
                  onClick={handleClearQueue}
                >
                  {t('gdriveSyncQueueClearAll')}
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {gdriveQueue.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm opacity-60">
          <span>{t('gdriveSyncQueueEmpty')}</span>
          {handleScanNow && (
            <button
              type="button"
              className="px-3 py-1.5 text-xs font-medium bg-[var(--gd-primary)] text-white rounded-lg hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer"
              onClick={handleScanNow}
              disabled={isScanning}
            >
              {isScanning ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>{t('gdriveSyncQueueScanning')}</span>
                </>
              ) : (
                <>
                  <span>🔄 {t('gdriveSyncQueueScanNow')}</span>
                </>
              )}
            </button>
          )}
        </div>
      ) : (
        <div className={`flex-1 overflow-y-auto overflow-x-hidden ${selectedQueueIds.size > 0 ? 'gd-list-has-selection' : ''}`}>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                <th className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="cursor-pointer accent-[var(--gd-primary)] align-middle"
                    checked={gdriveQueue.length > 0 && selectedQueueIds.size === gdriveQueue.length}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = selectedQueueIds.size > 0 && selectedQueueIds.size < gdriveQueue.length;
                      }
                    }}
                    onChange={() => {
                      if (selectedQueueIds.size === gdriveQueue.length) {
                        setSelectedQueueIds(new Set());
                        if (lastSelectedRef) lastSelectedRef.current = null;
                      } else {
                        const allIds = gdriveQueue.map((item) => item.driveFileId);
                        setSelectedQueueIds(new Set(allIds));
                      }
                    }}
                    title={selectedQueueIds.size === gdriveQueue.length ? t('gdriveBtnClearSelection') : t('gdriveBtnSelectAll')}
                    aria-label={t('gdriveBtnSelectAll')}
                  />
                </th>
                <th className="px-3 py-2 min-w-0">{t('gdriveColFileName')}</th>
                <th className="w-24 px-3 py-2 text-right whitespace-nowrap">{t('gdriveColSize')}</th>
                <th className="w-64 px-3 py-2 whitespace-nowrap">{t('gdriveColStatus')}</th>
                <th className="w-20 px-2 py-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {gdriveQueue.slice(0, visibleQueueCount).map((item, idx) => {
                const task = (item.driveFileId && activeTasksMap.byId.get(item.driveFileId))
                  || (item.fileName && activeTasksMap.byName.get(item.fileName));

                let isCurrentSync = false;
                let syncPhase = null;
                let downloadProgress = 0;
                let uploadProgress = 0;
                let speedBps = 0;

                if (task) {
                  isCurrentSync = true;
                  syncPhase = task.phase || 'download';
                  speedBps = task.speedBps || 0;
                  if (task.downloadProgress !== undefined) {
                    downloadProgress = task.downloadProgress;
                  } else {
                    downloadProgress = task.phase === 'download' ? (task.progress || 0) : 1;
                  }
                  if (task.uploadProgress !== undefined) {
                    uploadProgress = task.uploadProgress;
                  } else {
                    uploadProgress = task.phase === 'upload' ? (task.progress || 0) : 0;
                  }
                } else if (!gdriveActiveTasks || gdriveActiveTasks.length === 0) {
                  if (item.fileName === gdriveCurrentSyncFile) {
                    isCurrentSync = true;
                    syncPhase = gdriveSyncPhase;
                    downloadProgress = gdriveDownloadProgress;
                    uploadProgress = gdriveUploadProgress;
                    speedBps = gdriveCurrentSyncSpeedBps;
                  }
                }

                return (
                  <GDriveQueueRow
                    key={item.driveFileId ? `${item.driveFileId}-${idx}` : idx}
                    item={item}
                    isSelected={selectedQueueIds.has(item.driveFileId)}
                    onToggle={applyQueueSelection}
                    onClick={(e) => {
                      const orderedKeys = gdriveQueue.slice(0, visibleQueueCount).map(i => i.driveFileId);
                      handleSelectionClick(e, item.driveFileId, orderedKeys, applyQueueSelection);
                    }}
                    isCurrentSync={isCurrentSync}
                    syncPhase={syncPhase}
                    downloadProgress={downloadProgress}
                    uploadProgress={uploadProgress}
                    speedBps={speedBps}
                  />
                );
              })}
            </tbody>
          </table>
          {visibleQueueCount < gdriveQueue.length && (
            <div className="p-3 flex justify-center">
              <button
                type="button"
                className="px-4 py-2 text-xs font-medium text-[var(--gd-primary)] border border-[var(--gd-primary)] rounded hover:bg-[var(--gd-primary-light)]/10 transition-colors"
                onClick={() => setVisibleQueueCount(prev => prev + 50)}
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
