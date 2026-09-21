import { useEffect, useRef, useState } from 'react';
import { formatDate, formatSize } from '../utils/format';
import { formatFolderSummary } from '../utils/folderSummary';
import { useI18n } from '../context/I18nContext';
import { ContextMenu } from './ContextMenu';
import { DriveSelectionBar } from './DriveSelectionBar';
import { RowQuickActions } from './BrowserScreen';
import {
  fileTypeIcon,
  IconDownload,
  IconFolder,
  IconLock,
} from './DriveIcons';

const menuIconClass = 'h-5 w-5';

function isEditableTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function openMenu(setMenu, e, items, anchor = null) {
  setMenu({
    x: e.clientX,
    y: e.clientY,
    anchor,
    items,
  });
}

function SortHeader({ active, direction, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex items-center gap-1 hover:text-[var(--gd-text)]">
      {children}
      {active && <span className="text-[var(--gd-primary)]">{direction === 'asc' ? '↑' : '↓'}</span>}
    </button>
  );
}

function formatFolderItemCount(folder, t) {
  if (!folder) return null;
  const folderCount = folder.folderCount ?? 0;
  const fileCount = folder.fileCount ?? 0;
  const totalFiles = folder.totalFiles ?? fileCount;

  if (folderCount === 0 && fileCount === 0 && totalFiles === 0) {
    return t('folderItemCountEmpty');
  }

  const parts = [];
  if (folderCount > 0) {
    parts.push(t('folderCountLabel', { n: folderCount }));
  }
  if (fileCount > 0) {
    parts.push(t('fileCountLabel', { n: fileCount }));
  } else if (totalFiles > 0) {
    parts.push(`(${t('fileCountLabel', { n: totalFiles })})`);
  }

  return parts.join(', ');
}

function formatFolderTooltip(folder, t) {
  if (!folder) return '';
  const folderCount = folder.folderCount ?? 0;
  const totalFolders = folder.totalFolders ?? folderCount;
  const fileCount = folder.fileCount ?? 0;
  const totalFiles = folder.totalFiles ?? fileCount;

  return `${folder.name}\n${t('folderItemCountDetail', {
    folderCount,
    totalFolders,
    fileCount,
    totalFiles,
  })}`;
}

export function SharedBrowserScreen({
  folders,
  files,
  currentFolderCounts,
  loading,
  sortField,
  sortDirection,
  currentFolder,
  ownerName,
  selectedIds,
  selectedFolders,
  onOpenFolder,
  onToggleSort,
  onToggleSelect,
  onToggleFolderSelect,
  onApplyItemSelection,
  onOpenFile,
  onDownload,
  onPreview,
  selectionCount = 0,
  canDownloadSelection = false,
  onClearSelection,
  onDownloadSelected,
  onSelectAll,
}) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(null);
  const clickTimerRef = useRef(null);
  const folderSummary = formatFolderSummary({
    folders: displayedFolders,
    files: displayedFiles,
    counts: currentFolderCounts,
    t,
  });

  const displayedFiles = files || [];
  const displayedFolders = folders || [];
  const empty = !loading && displayedFolders.length === 0 && displayedFiles.length === 0;

  const orderedKeys = [
    ...displayedFolders.map((f) => `folder:${currentFolder}${f.name}/`),
    ...displayedFiles.map((f) => `file:${f.messageId}`),
  ];

  function scheduleSelect(selectFn) {
    if (clickTimerRef.current) clearTimeout(clickTimerRef.current);
    clickTimerRef.current = setTimeout(() => {
      selectFn();
      clickTimerRef.current = null;
    }, 220);
  }

  function cancelSelectTimer() {
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  }

  function handleItemMouseDown(e) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }

  function handleItemClick(e, key) {
    const additive = e.ctrlKey || e.metaKey;
    const range = e.shiftKey;
    const modifiers = { additive, range };

    if (additive || range) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      cancelSelectTimer();
      onApplyItemSelection(key, modifiers, orderedKeys);
      return;
    }

    scheduleSelect(() => {
      onApplyItemSelection(key, { additive: false, range: false }, orderedKeys);
    });
  }

  function handleOpen(openFn) {
    cancelSelectTimer();
    openFn();
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      if (isEditableTarget(e.target)) return;
      if (loading || empty) return;

      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      onSelectAll?.();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, empty, onSelectAll]);

  function showFileMenu(e, file, anchor = null) {
    e.preventDefault();
    e.stopPropagation();
    openMenu(setMenu, e, [
      {
        label: t('download'),
        icon: <IconDownload className={menuIconClass} />,
        action: () => onDownload?.(file),
      },
    ], anchor);
  }

  const [bannerVisible, setBannerVisible] = useState(true);
  const [bannerFading, setBannerFading] = useState(false);

  useEffect(() => {
    const fadeTimer = setTimeout(() => setBannerFading(true), 9000);
    const hideTimer = setTimeout(() => setBannerVisible(false), 10000);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--gd-text-secondary)]">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--gd-primary)] border-t-transparent" />
          <span>{t('sharedVaultScanning')}</span>
        </div>
      </div>
    );
  }

  if (empty) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--gd-text-secondary)]">
        <IconFolder className="h-16 w-16 opacity-80" />
        <p className="text-base">{t('sharedVaultEmpty')}</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Read-only badge — auto-hides after 10s */}
      {bannerVisible && (
        <div className={`flex items-center gap-2 px-4 py-1.5 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400 text-xs transition-opacity duration-1000 ${bannerFading ? 'opacity-0' : 'opacity-100'}`}>
          <IconLock className="h-3.5 w-3.5" />
          <span className="font-medium">{t('sharedVaultReadOnly')} — {ownerName}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 px-4 py-2">
        {selectionCount > 0 ? (
          <DriveSelectionBar
            count={selectionCount}
            isTrash={false}
            canDownload={canDownloadSelection}
            canTrash={false}
            canMove={false}
            canRestore={false}
            canDeleteForever={false}
            onClear={onClearSelection}
            onDownload={onDownloadSelected}
          />
        ) : (
          <div
            className="flex items-center gap-2 text-xs font-medium text-[var(--gd-text-secondary)] select-none"
            title={folderSummary.tooltip}
          >
            <span>{folderSummary.text}</span>
          </div>
        )}
      </div>

      <div className={`min-h-0 flex-1 overflow-auto px-2 pb-4 ${selectionCount > 0 ? 'gd-list-has-selection' : ''}`}>
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
              <th className="w-12 px-3 py-2" />
              <th className="px-3 py-2">
                <SortHeader active={sortField === 'name'} direction={sortDirection} onClick={() => onToggleSort?.('name')}>
                  {t('colName')}
                </SortHeader>
              </th>
              <th className="hidden w-52 px-3 py-2 md:table-cell whitespace-nowrap">
                <SortHeader active={sortField === 'mtime'} direction={sortDirection} onClick={() => onToggleSort?.('mtime')}>
                  {t('colModified')}
                </SortHeader>
              </th>
              <th className="hidden w-28 px-3 py-2 sm:table-cell whitespace-nowrap">
                <SortHeader active={sortField === 'size'} direction={sortDirection} onClick={() => onToggleSort?.('size')}>
                  {t('colSize')}
                </SortHeader>
              </th>
              <th className="w-36 px-2 py-2" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {displayedFolders.map((folder) => {
              const key = `folder:${currentFolder}${folder.name}/`;
              const selected = selectedFolders?.has(key) || false;
              const countText = formatFolderItemCount(folder, t);
              const tooltipText = formatFolderTooltip(folder, t);
              return (
                <tr
                  key={key}
                  className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${selected ? 'selected' : ''}`}
                  onMouseDown={handleItemMouseDown}
                  onClick={(e) => handleItemClick(e, key)}
                  onDoubleClick={() => handleOpen(() => onOpenFolder?.(folder.name))}
                >
                  <td className="w-12 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="gd-row-checkbox"
                      checked={selected}
                      onChange={() => onToggleFolderSelect?.(folder.name)}
                    />
                  </td>
                  <td className="px-3 py-2.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <IconFolder className="h-6 w-6 shrink-0" />
                      <span
                        className={`truncate ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
                        title={tooltipText}
                      >
                        {folder.name}
                      </span>
                      {countText && (
                        <span
                          className="shrink-0 rounded-full bg-[var(--gd-border)]/40 px-2 py-0.5 text-[11px] font-normal text-[var(--gd-text-secondary)]"
                          title={tooltipText}
                        >
                          {countText}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="hidden w-52 px-3 py-2.5 text-[var(--gd-text-secondary)] md:table-cell whitespace-nowrap">
                    {formatDate(folder.mtime)}
                  </td>
                  <td className="hidden w-28 px-3 py-2.5 text-[var(--gd-text-secondary)] sm:table-cell whitespace-nowrap">
                    {folder.size > 0 ? formatSize(folder.size) : '—'}
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <RowQuickActions
                      onMore={(e) => {/* no folder context menu for shared */}}
                    />
                  </td>
                </tr>
              );
            })}
            {displayedFiles.map((file) => {
              const key = `file:${file.messageId}`;
              const selected = selectedIds?.has(file.messageId) || selectedIds?.has(key);
              return (
                <tr
                  key={key}
                  className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${selected ? 'selected' : ''}`}
                  onMouseDown={handleItemMouseDown}
                  onClick={(e) => handleItemClick(e, key)}
                  onDoubleClick={() => handleOpen(() => onOpenFile?.(file))}
                  onContextMenu={(e) => showFileMenu(e, file)}
                >
                  <td className="w-12 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="gd-row-checkbox"
                      checked={!!selected}
                      onChange={() => onToggleSelect?.(key)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-3 py-2.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {fileTypeIcon(file.name, 'h-6 w-6 shrink-0')}
                      <span
                        className={`truncate ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
                        title={file.name}
                      >
                        {file.name}
                      </span>
                    </div>
                  </td>
                  <td className="hidden w-52 px-3 py-2.5 text-[var(--gd-text-secondary)] md:table-cell whitespace-nowrap">
                    {formatDate(file.mtime)}
                  </td>
                  <td className="hidden w-28 px-3 py-2.5 text-[var(--gd-text-secondary)] sm:table-cell whitespace-nowrap">
                    {formatSize(file.size)}
                  </td>
                  <td className="px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <RowQuickActions
                      onDownload={() => onDownload?.(file)}
                      onMore={(e) => showFileMenu(e, file, e.currentTarget)}
                      showDownload
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          anchor={menu.anchor}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
