import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { formatDate, formatSize } from '../utils/format';
import { formatFolderSummary } from '../utils/folderSummary';
import { sanitizeFolderPath } from '../utils/pathUtils';
import { useI18n } from '../context/I18nContext';
import { DEFAULT_TRASH_FOLDER, isTrashPath } from '../constants/vaultConstants';
import {
  buildDragPayload,
  isValidDropTarget,
  isMoveDragEvent,
  parseMovePayload,
  TELEVAULT_MOVE_MIME,
} from '../utils/dragDropMove';
import { ContextMenu } from './ContextMenu';
import { DriveSelectionBar } from './DriveSelectionBar';
import {
  fileTypeIcon,
  IconDeleteForever,
  IconDownload,
  IconDuplicate,
  IconFolder,
  IconFolderGrid,
  IconGridView,
  IconLabel,
  IconListView,
  IconMoveTo,
  IconMoreVert,
  IconNewFolder,
  IconOpen,
  IconPreview,
  IconRename,
  IconRestore,
  IconSaveAs,
  IconTrash,
  IconUploadFile,
  IconUploadFolder,
} from './DriveIcons';

const menuIconClass = 'h-5 w-5';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function isEditableTarget(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function fileExt(name) {
  return name.includes('.') ? name.split('.').pop()?.toLowerCase() : '';
}

function openMenu(setMenu, e, items, anchor = null) {
  setMenu({
    x: e.clientX,
    y: e.clientY,
    anchor,
    items,
  });
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

const EMPTY_SET = new Set();

export function BrowserScreen({
  folders,
  files,
  currentFolderCounts,
  loading,
  emptyText = null,
  viewMode,
  sortField,
  sortDirection,
  trashFolder,
  currentFolder,
  selectedIds = EMPTY_SET,
  selectedFolders = EMPTY_SET,
  onOpenFolder,
  onToggleSort,
  onToggleViewMode,
  onToggleSelect,
  onToggleFolderSelect,
  onOpenFile,
  onRenameFile,
  onRenameFolder,
  onMoveFile,
  onMoveFolder,
  onMoveEntriesDirect = null,
  onFolderTags,
  onTrashFile,
  onTrashFolder,
  onRestoreFile,
  onRestoreFolder,
  onDeleteForeverFile,
  onDeleteForeverFolder,
  onDownload,
  onDownloadFolder,
  onSaveAs,
  onPreview,
  onUploadFiles,
  onUploadFolder,
  onCreateFolder,
  selectionCount = 0,
  canDownloadSelection = false,
  onClearSelection,
  onDownloadSelected,
  onMoveSelected,
  onTrashSelected,
  onRestoreSelected,
  onDeleteForeverSelected,
  onApplyItemSelection,
  onSelectAll,
  readonly = false,
  deleteForeverBusy = false,
  deleteForeverTargetKeys = [],
  onOpenDuplicates,
  hideToolbar = false,
}) {
  const delete_forever_target_set = new Set(deleteForeverTargetKeys);
  const { t } = useI18n();
  const folderSummary = formatFolderSummary({
    folders,
    files,
    counts: currentFolderCounts,
    t,
  });
  const trash_root = trashFolder || DEFAULT_TRASH_FOLDER;
  const isTrash = isTrashPath(currentFolder, trash_root);
  const empty = !loading && folders.length === 0 && files.length === 0;
  const [menu, setMenu] = useState(null);
  const [dragTargetFolder, setDragTargetFolder] = useState(null);
  const [draggingItemKey, setDraggingItemKey] = useState(null);
  const activeDragRef = useRef(null);

  const INITIAL_VISIBLE_COUNT = 100;
  const [visibleFileCount, setVisibleFileCount] = useState(INITIAL_VISIBLE_COUNT);
  const [visibleFolderCount, setVisibleFolderCount] = useState(INITIAL_VISIBLE_COUNT);

  useEffect(() => {
    setVisibleFileCount(INITIAL_VISIBLE_COUNT);
    setVisibleFolderCount(INITIAL_VISIBLE_COUNT);
  }, [currentFolder, sortField, sortDirection, files.length, folders.length]);

  const handleListScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 400) {
      setVisibleFileCount((prev) => (prev < files.length ? Math.min(prev + 100, files.length) : prev));
      setVisibleFolderCount((prev) => (prev < folders.length ? Math.min(prev + 100, folders.length) : prev));
    }
  };

  const visibleFiles = files.length > INITIAL_VISIBLE_COUNT ? files.slice(0, visibleFileCount) : files;
  const visibleFolders = folders.length > INITIAL_VISIBLE_COUNT ? folders.slice(0, visibleFolderCount) : folders;

  const orderedKeys = useMemo(() => [
    ...folders.map((folder) => `folder:${folder.path || sanitizeFolderPath(`${currentFolder}${folder.name}/`)}`),
    ...files.map((file) => `file:${file.messageId}`),
  ], [folders, files, currentFolder]);

  function createDragGhost(count, label) {
    const badge = document.createElement('div');
    badge.style.position = 'fixed';
    badge.style.top = '-1000px';
    badge.style.left = '-1000px';
    badge.style.zIndex = '99999';
    badge.style.pointerEvents = 'none';
    badge.style.background = '#2563eb';
    badge.style.color = '#ffffff';
    badge.style.padding = '6px 14px';
    badge.style.borderRadius = '20px';
    badge.style.fontSize = '12px';
    badge.style.fontWeight = '600';
    badge.style.boxShadow = '0 4px 14px rgba(0,0,0,0.3)';
    badge.style.display = 'flex';
    badge.style.alignItems = 'center';
    badge.style.gap = '6px';
    badge.textContent = count > 1 ? t('dragItemCount', { count }) : `📄 ${label}`;
    document.body.appendChild(badge);
    return badge;
  }

  function handleItemDragStart(e, itemType, item) {
    if (readonly || isTrash) return;

    const folderPath = item.path || `${currentFolder}${item.name}/`;
    const payload = buildDragPayload({
      itemType,
      file: itemType === 'file' ? item : undefined,
      folderName: itemType === 'folder' ? item.name : undefined,
      currentFolder: itemType === 'folder' && item.path ? item.path.slice(0, item.path.lastIndexOf('/', item.path.length - 2) + 1) || '/' : currentFolder,
      selectedIds,
      selectedFolders,
    });

    activeDragRef.current = payload;
    const itemKey =
      itemType === 'file'
        ? `file:${item.messageId}`
        : `folder:${folderPath}`;
    setDraggingItemKey(itemKey);

    e.dataTransfer.setData(
      TELEVAULT_MOVE_MIME,
      JSON.stringify({
        messageIds: payload.messageIds,
        folders: payload.folders,
      }),
    );
    e.dataTransfer.effectAllowed = 'move';

    if (e.dataTransfer.setDragImage) {
      const ghost = createDragGhost(payload.totalCount, payload.label);
      e.dataTransfer.setDragImage(ghost, 20, 20);
      setTimeout(() => {
        if (ghost.parentNode) ghost.parentNode.removeChild(ghost);
      }, 0);
    }
  }

  function handleItemDragEnd() {
    activeDragRef.current = null;
    setDraggingItemKey(null);
    setDragTargetFolder(null);
  }

  function handleFolderDragOver(e, folderName, folderPath = null) {
    if (readonly || isTrash) return;
    if (!isMoveDragEvent(e)) return;

    const targetPath = folderPath || `${currentFolder}${folderName}/`;
    const payload = activeDragRef.current;
    if (payload && !isValidDropTarget(targetPath, payload)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }

    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    if (dragTargetFolder !== targetPath) {
      setDragTargetFolder(targetPath);
    }
  }

  function handleFolderDragLeave(e, folderName, folderPath = null) {
    const targetPath = folderPath || `${currentFolder}${folderName}/`;
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragTargetFolder((current) => (current === targetPath ? null : current));
    }
  }

  function handleFolderDrop(e, folderName, folderPath = null) {
    if (readonly || isTrash) return;
    if (!isMoveDragEvent(e)) return;

    e.preventDefault();
    e.stopPropagation();
    setDragTargetFolder(null);

    const targetPath = folderPath || `${currentFolder}${folderName}/`;
    const payload = activeDragRef.current || parseMovePayload(e);
    activeDragRef.current = null;
    setDraggingItemKey(null);

    if (!payload || !isValidDropTarget(targetPath, payload)) return;

    const { messageIds = [], folders = [] } = payload;
    if (!messageIds.length && !folders.length) return;

    void onMoveEntriesDirect?.(messageIds, folders, targetPath);
  }

  function handleItemMouseDown(e) {
    if (isEditableTarget(e.target)) return;
  }

  function handleItemClick(e, key) {
    const additive = e.ctrlKey || e.metaKey;
    const range = e.shiftKey;
    const modifiers = { additive, range };

    if (additive || range) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      onApplyItemSelection(key, modifiers, orderedKeys);
      return;
    }

    onApplyItemSelection(key, { additive: false, range: false }, orderedKeys);
  }

  function handleOpen(openFn) {
    if (loading) return;
    openFn();
  }

  useEffect(() => {
    function onKeyDown(e) {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'a') return;
      if (isEditableTarget(e.target)) return;
      if (loading || empty) return;

      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      onSelectAll();
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loading, empty, onSelectAll]);

  function showEmptyMenu(e) {
    if (readonly || isTrash) return;
    e.preventDefault();
    openMenu(setMenu, e, [
      {
        label: t('newFolder'),
        icon: <IconNewFolder className={menuIconClass} />,
        action: onCreateFolder,
      },
      { separator: true },
      {
        label: t('uploadFile'),
        icon: <IconUploadFile className={menuIconClass} />,
        action: onUploadFiles,
      },
      {
        label: t('uploadFolder'),
        icon: <IconUploadFolder className={menuIconClass} />,
        action: onUploadFolder,
      },
    ]);
  }

  function showFileMenu(e, file, anchor = null) {
    e.preventDefault();
    e.stopPropagation();
    
    if (readonly) {
      openMenu(setMenu, e, [
        {
          label: t('download'),
          icon: <IconDownload className={menuIconClass} />,
          action: () => onDownload(file),
        }
      ], anchor);
      return;
    }

    const items = isTrash
      ? [
          {
            label: t('restore'),
            icon: <IconRestore className={menuIconClass} />,
            action: () => onRestoreFile(file),
          },
          {
            label: t('deleteForever'),
            icon: <IconDeleteForever className={menuIconClass} />,
            action: () => onDeleteForeverFile(file),
            danger: true,
          },
        ]
      : [
          {
            label: t('download'),
            icon: <IconDownload className={menuIconClass} />,
            action: () => onDownload(file),
          },
          {
            label: t('rename'),
            icon: <IconRename className={menuIconClass} />,
            action: () => onRenameFile(file),
          },
          {
            label: t('move'),
            icon: <IconMoveTo className={menuIconClass} />,
            action: () => onMoveFile(file),
          },
          {
            label: t('trash'),
            icon: <IconTrash className={menuIconClass} />,
            action: () => onTrashFile(file),
            danger: true,
          },
        ];
    openMenu(setMenu, e, items, anchor);
  }

  function showFolderMenu(e, name, anchor = null, explicitPath = null) {
    e.preventDefault();
    e.stopPropagation();
    const folderPath = explicitPath || `${currentFolder}${name}/`;

    if (readonly) {
      // For folders in readonly mode, we might only allow opening (which is handled by click).
      // If there's a download folder function, we could show it, but for now just don't show the context menu.
      if (onDownloadFolder) {
        openMenu(setMenu, e, [
          {
            label: t('download'),
            icon: <IconDownload className={menuIconClass} />,
            action: () => onDownloadFolder(name, folderPath),
          }
        ], anchor);
      }
      return;
    }

    const items = isTrash
      ? [
          {
            label: t('open'),
            icon: <IconOpen className={menuIconClass} />,
            action: () => onOpenFolder(name, folderPath),
          },
          {
            label: t('restore'),
            icon: <IconRestore className={menuIconClass} />,
            action: () => onRestoreFolder(name, folderPath),
          },
          {
            label: t('deleteForever'),
            icon: <IconDeleteForever className={menuIconClass} />,
            action: () => onDeleteForeverFolder(name, folderPath),
            danger: true,
          },
        ]
      : [
          {
            label: t('download'),
            icon: <IconDownload className={menuIconClass} />,
            action: () => onDownloadFolder(name, folderPath),
          },
          {
            label: t('rename'),
            icon: <IconRename className={menuIconClass} />,
            action: () => onRenameFolder(name, folderPath),
          },
          {
            label: t('move'),
            icon: <IconMoveTo className={menuIconClass} />,
            action: () => onMoveFolder(name, folderPath),
          },
          {
            label: t('addTags'),
            icon: <IconLabel className={menuIconClass} />,
            action: () => onFolderTags(name, folderPath),
          },
          {
            label: t('trash'),
            icon: <IconTrash className={menuIconClass} />,
            action: () => onTrashFolder(name, folderPath),
            danger: true,
          },
        ];
    openMenu(setMenu, e, items, anchor);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" onContextMenu={showEmptyMenu}>
      {!hideToolbar && (
        <div className="flex items-center justify-between gap-3 px-4 py-2">
          {selectionCount > 0 ? (
            <DriveSelectionBar
              count={selectionCount}
              isTrash={isTrash}
              canDownload={canDownloadSelection}
              onClear={onClearSelection}
              onDownload={() => void onDownloadSelected()}
              onMove={readonly ? undefined : () => void onMoveSelected()}
              onTrash={readonly ? undefined : () => void onTrashSelected()}
              onRestore={readonly || deleteForeverBusy ? undefined : () => void onRestoreSelected()}
              onDeleteForever={
                readonly || deleteForeverBusy ? undefined : () => void onDeleteForeverSelected()
              }
              readonly={readonly}
              deleteForeverBusy={deleteForeverBusy}
            />
          ) : (
            <div
              className="flex items-center gap-2 text-xs font-medium text-[var(--gd-text-secondary)] select-none"
              title={folderSummary.tooltip}
            >
              <span>{folderSummary.text}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5">
            {!readonly && !isTrash && onOpenDuplicates && (
              <>
                <button
                  type="button"
                  onClick={onOpenDuplicates}
                  title={t('navDuplicates')}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--gd-border)] px-3 py-1 text-xs font-medium text-[var(--gd-text-secondary)] transition-colors hover:border-[var(--gd-primary)] hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)]"
                >
                  <IconDuplicate className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline">{t('navDuplicates')}</span>
                </button>
                <div className="mx-0.5 h-4 w-[1px] bg-[var(--gd-border)]" />
              </>
            )}
            <IconToggle
              active={viewMode === 'list'}
              label={t('viewList')}
              onClick={() => viewMode !== 'list' && onToggleViewMode()}
            >
              <IconListView className="h-5 w-5" />
            </IconToggle>
            <IconToggle
              active={viewMode === 'grid'}
              label={t('viewGrid')}
              onClick={() => viewMode !== 'grid' && onToggleViewMode()}
            >
              <IconGridView className="h-5 w-5" />
            </IconToggle>
          </div>
        </div>
      )}

      {loading && folders.length === 0 && files.length === 0 ? (
        <div className="flex flex-1 items-center justify-center text-sm text-[var(--gd-text-secondary)]">
          {t('loading')}
        </div>
      ) : empty ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-[var(--gd-text-secondary)]">
          <IconFolder className="h-16 w-16 opacity-80" />
          <p className="text-base">{emptyText || (isTrash ? t('emptyTrash') : t('emptyFolder'))}</p>
          {!isTrash && !emptyText && <p className="max-w-sm text-center text-sm">{readonly ? t('emptyFolderReadonlyHint') : t('emptyFolderHint')}</p>}
        </div>
      ) : (
        <>
          {loading && (
            <div className="h-0.5 w-full overflow-hidden bg-transparent shrink-0">
              <div className="h-full w-1/3 bg-[var(--gd-primary)] animate-pulse rounded-full" />
            </div>
          )}
          {viewMode === 'grid' ? (
            <div onScroll={handleListScroll} className="gd-grid flex-1 overflow-auto px-6 pt-4 pb-6">
          {visibleFolders.map((folder) => {
            const folderPath = folder.path || sanitizeFolderPath(`${currentFolder}${folder.name}/`);
            return (
              <FolderGridCard
                key={folder.path || folder.name}
                name={folder.name}
                path={folder.path}
                countText={formatFolderItemCount(folder, t)}
                tooltip={formatFolderTooltip(folder, t) || folder.path}
                selected={selectedFolders?.has(folderPath)}
                draggable={!readonly && !isTrash}
                onDragStart={(e) => handleItemDragStart(e, 'folder', folder)}
                onDragEnd={handleItemDragEnd}
                onDragOver={(e) => handleFolderDragOver(e, folder.name, folderPath)}
                onDragLeave={(e) => handleFolderDragLeave(e, folder.name, folderPath)}
                onDrop={(e) => handleFolderDrop(e, folder.name, folderPath)}
                isDropTarget={dragTargetFolder === folderPath}
                isDragging={draggingItemKey === `folder:${folderPath}`}
                onMouseDown={handleItemMouseDown}
                onClick={(e) => handleItemClick(e, `folder:${folderPath}`)}
                onDoubleClick={() => handleOpen(() => onOpenFolder(folder.name, folderPath))}
                onContextMenu={(e) => showFolderMenu(e, folder.name, null, folderPath)}
                onMenu={
                  readonly || isTrash
                    ? undefined
                    : (e) => showFolderMenu(e, folder.name, e.currentTarget, folderPath)
                }
                onRestore={readonly || !isTrash ? undefined : () => onRestoreFolder(folder.name, folderPath)}
                onDeleteForever={
                  readonly || !isTrash ? undefined : () => onDeleteForeverFolder(folder.name, folderPath)
                }
                actionsDisabled={deleteForeverBusy && isTrash}
                actionsBusy={
                  isTrash &&
                  delete_forever_target_set.has(folderPath)
                }
              />
            );
          })}
          {visibleFolderCount < folders.length && (
            <div className="col-span-full py-2 text-center">
              <button
                type="button"
                onClick={() => setVisibleFolderCount((prev) => Math.min(prev + 100, folders.length))}
                className="rounded-lg px-4 py-1.5 bg-[var(--gd-surface-elevated)] hover:bg-[var(--gd-surface)] border border-[var(--gd-border)] text-xs font-medium text-[var(--gd-text)] shadow-xs transition-colors cursor-pointer"
              >
                {t('loadMoreFolders', { remaining: folders.length - visibleFolderCount })}
              </button>
            </div>
          )}
          {visibleFiles.map((file) => (
            <FileGridCard
              key={file.messageId}
              file={file}
              currentFolder={currentFolder}
              selected={selectedIds?.has(file.messageId)}
              draggable={!readonly && !isTrash}
              isTrash={isTrash}
              onDragStart={(e) => handleItemDragStart(e, 'file', file)}
              onDragEnd={handleItemDragEnd}
              isDragging={draggingItemKey === `file:${file.messageId}`}
              onMouseDown={handleItemMouseDown}
              onClick={(e) => handleItemClick(e, `file:${file.messageId}`)}
              onDoubleClick={() => handleOpen(() => onOpenFile(file))}
              onContextMenu={(e) => showFileMenu(e, file)}
              onMenu={
                readonly || isTrash
                  ? undefined
                  : (e) => showFileMenu(e, file, e.currentTarget)
              }
              onRestore={readonly || !isTrash ? undefined : () => onRestoreFile(file)}
              onDeleteForever={
                readonly || !isTrash ? undefined : () => onDeleteForeverFile(file)
              }
              actionsDisabled={deleteForeverBusy && isTrash}
              actionsBusy={isTrash && delete_forever_target_set.has(`file:${file.messageId}`)}
            />
          ))}
          {visibleFileCount < files.length && (
            <div className="col-span-full py-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleFileCount((prev) => Math.min(prev + 200, files.length))}
                className="rounded-lg px-4 py-2 bg-[var(--gd-surface-elevated)] hover:bg-[var(--gd-surface)] border border-[var(--gd-border)] text-xs font-medium text-[var(--gd-text)] shadow-xs transition-colors cursor-pointer"
              >
                {t('loadMoreFiles', { remaining: files.length - visibleFileCount })}
              </button>
            </div>
          )}
        </div>
      ) : (
        <div onScroll={handleListScroll} className={`min-h-0 flex-1 overflow-auto px-2 pb-4 ${selectionCount > 0 ? 'gd-list-has-selection' : ''}`}>
          <table className="w-full table-fixed border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
                <th className="w-12 px-3 py-2" />
                <th className="px-3 py-2">
                  <SortHeader
                    active={sortField === 'name'}
                    direction={sortDirection}
                    onClick={() => onToggleSort('name')}
                    label={t('colName')}
                  >
                    {t('colName')}
                  </SortHeader>
                </th>
                <th className="hidden w-52 px-3 py-2 md:table-cell whitespace-nowrap">
                  <SortHeader
                    active={sortField === 'mtime'}
                    direction={sortDirection}
                    onClick={() => onToggleSort('mtime')}
                    label={t('colModified')}
                  >
                    {t('colModified')}
                  </SortHeader>
                </th>
                <th className="hidden w-28 px-3 py-2 sm:table-cell whitespace-nowrap">
                  <SortHeader
                    active={sortField === 'size'}
                    direction={sortDirection}
                    onClick={() => onToggleSort('size')}
                    label={t('colSize')}
                  >
                    {t('colSize')}
                  </SortHeader>
                </th>
                <th className="w-36 px-2 py-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {visibleFolders.map((folder) => {
                const folderPath = folder.path || sanitizeFolderPath(`${currentFolder}${folder.name}/`);
                return (
                  <FolderTableRow
                    key={folder.path || folder.name}
                    folder={folder}
                    folderPath={folderPath}
                    selected={selectedFolders?.has(folderPath)}
                    isDropTarget={dragTargetFolder === folderPath}
                    isDragging={draggingItemKey === `folder:${folderPath}`}
                    countText={formatFolderItemCount(folder, t)}
                    tooltipText={formatFolderTooltip(folder, t) || folder.path}
                    readonly={readonly}
                    isTrash={isTrash}
                    deleteForeverBusy={deleteForeverBusy}
                    actionsBusy={isTrash && delete_forever_target_set.has(folderPath)}
                    onDragStart={(e) => handleItemDragStart(e, 'folder', folder)}
                    onDragEnd={handleItemDragEnd}
                    onDragOver={(e) => handleFolderDragOver(e, folder.name, folderPath)}
                    onDragLeave={(e) => handleFolderDragLeave(e, folder.name, folderPath)}
                    onDrop={(e) => handleFolderDrop(e, folder.name, folderPath)}
                    onMouseDown={handleItemMouseDown}
                    onClick={(e) => handleItemClick(e, `folder:${folderPath}`)}
                    onDoubleClick={() => handleOpen(() => onOpenFolder(folder.name, folderPath))}
                    onContextMenu={(e) => showFolderMenu(e, folder.name, null, folderPath)}
                    onToggleFolderSelect={() => onToggleFolderSelect(folder.name, folderPath)}
                    onRenameFolder={() => onRenameFolder(folder.name, folderPath)}
                    onRestoreFolder={() => onRestoreFolder(folder.name, folderPath)}
                    onDeleteForeverFolder={() => onDeleteForeverFolder(folder.name, folderPath)}
                    onShowFolderMenu={(e) => showFolderMenu(e, folder.name, e.currentTarget, folderPath)}
                  />
                );
              })}
              {visibleFolderCount < folders.length && (
                <tr className="border-b border-[var(--gd-border)]">
                  <td colSpan={5} className="py-2 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleFolderCount((prev) => Math.min(prev + 100, folders.length))}
                      className="rounded-lg px-4 py-1.5 bg-[var(--gd-surface-elevated)] hover:bg-[var(--gd-surface)] border border-[var(--gd-border)] text-xs font-medium text-[var(--gd-text)] shadow-xs transition-colors cursor-pointer"
                    >
                      {t('loadMoreFolders', { remaining: folders.length - visibleFolderCount })}
                    </button>
                  </td>
                </tr>
              )}
              {visibleFiles.map((file) => (
                <FileTableRow
                  key={file.messageId}
                  file={file}
                  currentFolder={currentFolder}
                  selected={selectedIds?.has(file.messageId)}
                  isDragging={draggingItemKey === `file:${file.messageId}`}
                  readonly={readonly}
                  isTrash={isTrash}
                  deleteForeverBusy={deleteForeverBusy}
                  actionsBusy={isTrash && delete_forever_target_set.has(`file:${file.messageId}`)}
                  onDragStart={(e) => handleItemDragStart(e, 'file', file)}
                  onDragEnd={handleItemDragEnd}
                  onMouseDown={handleItemMouseDown}
                  onClick={(e) => handleItemClick(e, `file:${file.messageId}`)}
                  onDoubleClick={() => handleOpen(() => onOpenFile(file))}
                  onContextMenu={(e) => showFileMenu(e, file)}
                  onToggleSelect={() => onToggleSelect(file.messageId)}
                  onDownload={() => onDownload(file)}
                  onRenameFile={() => onRenameFile(file)}
                  onRestoreFile={() => onRestoreFile(file)}
                  onDeleteForeverFile={() => onDeleteForeverFile(file)}
                  onShowFileMenu={(e) => showFileMenu(e, file, e.currentTarget)}
                />
              ))}
              {visibleFileCount < files.length && (
                <tr className="border-b border-[var(--gd-border)]">
                  <td colSpan={5} className="py-4 text-center">
                    <button
                      type="button"
                      onClick={() => setVisibleFileCount((prev) => Math.min(prev + 200, files.length))}
                      className="rounded-lg px-4 py-2 bg-[var(--gd-surface-elevated)] hover:bg-[var(--gd-surface)] border border-[var(--gd-border)] text-xs font-medium text-[var(--gd-text)] shadow-xs transition-colors cursor-pointer"
                    >
                      {t('loadMoreFiles', { remaining: files.length - visibleFileCount })}
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}

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

function SortHeader({ active, direction, onClick, label, children }) {
  const { t } = useI18n();
  const columnTitle = label || (typeof children === 'string' ? children : '');

  const tooltipText = active
    ? (direction === 'asc' ? t('sortHeaderTooltipAsc') : t('sortHeaderTooltipDesc'))
    : t('sortHeaderTooltipDefault', { column: columnTitle });

  return (
    <div className="relative group/sort inline-block">
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 py-1 px-2 -mx-2 rounded-md font-medium text-xs transition-all duration-150 cursor-pointer select-none ${
          active
            ? 'text-[var(--gd-primary)] font-semibold bg-[var(--gd-primary-light)]/40 hover:bg-[var(--gd-primary-light)]/70'
            : 'text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-[var(--gd-hover)]'
        }`}
      >
        <span>{children}</span>
        {active ? (
          <span className="shrink-0 transition-transform duration-200" aria-hidden="true">
            {direction === 'asc' ? (
              <svg className="h-3.5 w-3.5 text-[var(--gd-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5 text-[var(--gd-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            )}
          </span>
        ) : (
          <span className="shrink-0 opacity-0 group-hover/sort:opacity-50 transition-opacity duration-150 text-[var(--gd-text-secondary)]" aria-hidden="true">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
            </svg>
          </span>
        )}
      </button>

      {/* Modern Floating Tooltip */}
      <div
        role="tooltip"
        className="pointer-events-none absolute left-0 top-full mt-1.5 z-40 hidden group-hover/sort:flex flex-col items-start whitespace-nowrap rounded-md bg-zinc-900/95 dark:bg-zinc-800/95 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg border border-white/10 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      >
        <span className="absolute -top-1 left-3.5 h-2 w-2 rotate-45 bg-zinc-900/95 dark:bg-zinc-800/95 border-t border-l border-white/10" />
        <span className="relative z-10">{tooltipText}</span>
      </div>
    </div>
  );
}

function IconToggle({ active, label, onClick, children }) {
  return (
    <button
      type="button"
      title={label}
      onClick={onClick}
      className={`rounded-full p-2 ${
        active ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)]' : 'text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)]'
      }`}
    >
      {children}
    </button>
  );
}

function GridMenuButton({ onClick }) {
  return (
    <button
      type="button"
      className="gd-grid-menu"
      aria-label="More actions"
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
    >
      <IconMoreVert className="h-5 w-5" />
    </button>
  );
}

const GridTrashActions = memo(function GridTrashActions({ onRestore, onDeleteForever, disabled = false, busy = false }) {
  const { t } = useI18n();
  if (!onRestore && !onDeleteForever) return null;
  return (
    <div className="flex shrink-0 items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {onRestore && (
        <button
          type="button"
          className="gd-row-action"
          title={t('restore')}
          disabled={disabled || busy}
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
        >
          <IconRestore className="h-5 w-5" />
        </button>
      )}
      {onDeleteForever && (
        <button
          type="button"
          className="gd-row-action"
          title={t('deleteForever')}
          disabled={disabled || busy}
          onClick={(e) => {
            e.stopPropagation();
            onDeleteForever();
          }}
        >
          {busy ? (
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--gd-primary)] border-t-transparent"
              role="status"
              aria-label={t('deleteForeverProgress')}
            />
          ) : (
            <IconDeleteForever className="h-5 w-5" />
          )}
        </button>
      )}
    </div>
  );
});

const FolderTableRow = memo(function FolderTableRow({
  folder,
  folderPath,
  selected,
  isDropTarget,
  isDragging,
  countText,
  tooltipText,
  readonly,
  isTrash,
  deleteForeverBusy,
  actionsBusy,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleFolderSelect,
  onRenameFolder,
  onRestoreFolder,
  onDeleteForeverFolder,
  onShowFolderMenu,
}) {
  return (
    <tr
      className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''} ${isDragging ? 'gd-drag-source' : ''}`}
      draggable={!readonly && !isTrash}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <td className="w-12 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="gd-row-checkbox"
          checked={selected}
          onChange={onToggleFolderSelect}
        />
      </td>
      <td className="px-3 py-2.5 min-w-0">
        <div className="flex items-center gap-3 min-w-0 pointer-events-none">
          <IconFolder className="h-6 w-6 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
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
            {folder.path && (
              <div className="truncate text-[11px] font-normal text-[var(--gd-text-secondary)]">
                {folder.path}
              </div>
            )}
          </div>
        </div>
      </td>
      <td className="hidden w-52 px-3 py-2.5 text-[var(--gd-text-secondary)] md:table-cell whitespace-nowrap">
        {folder.mtime ? formatDate(folder.mtime) : '—'}
      </td>
      <td className="hidden w-28 px-3 py-2.5 text-[var(--gd-text-secondary)] sm:table-cell whitespace-nowrap">
        {folder.size > 0 ? formatSize(folder.size) : '—'}
      </td>
      <td className="w-36 px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <RowQuickActions
          onRename={readonly || isTrash ? undefined : onRenameFolder}
          onRestore={readonly || !isTrash ? undefined : onRestoreFolder}
          onDeleteForever={readonly || !isTrash ? undefined : onDeleteForeverFolder}
          onMore={readonly || isTrash ? undefined : onShowFolderMenu}
          busy={actionsBusy}
          actionsLocked={deleteForeverBusy && isTrash}
          alwaysVisible={isTrash}
        />
      </td>
    </tr>
  );
}, (prev, next) => {
  return (
    prev.folder === next.folder &&
    prev.folderPath === next.folderPath &&
    prev.selected === next.selected &&
    prev.isDropTarget === next.isDropTarget &&
    prev.isDragging === next.isDragging &&
    prev.countText === next.countText &&
    prev.tooltipText === next.tooltipText &&
    prev.readonly === next.readonly &&
    prev.isTrash === next.isTrash &&
    prev.deleteForeverBusy === next.deleteForeverBusy &&
    prev.actionsBusy === next.actionsBusy
  );
});

const FileTableRow = memo(function FileTableRow({
  file,
  currentFolder,
  selected,
  isDragging,
  readonly,
  isTrash,
  deleteForeverBusy,
  actionsBusy,
  onDragStart,
  onDragEnd,
  onMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onToggleSelect,
  onDownload,
  onRenameFile,
  onRestoreFile,
  onDeleteForeverFile,
  onShowFileMenu,
}) {
  const { t } = useI18n();
  const fileDir = file.path ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : '';
  const showPath = Boolean(fileDir && currentFolder && fileDir !== currentFolder);

  return (
    <tr
      id={`vault-file-${file.messageId}`}
      className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${selected ? 'selected' : ''} ${isDragging ? 'gd-drag-source' : ''}`}
      draggable={!readonly && !isTrash}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <td className="w-12 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="gd-row-checkbox"
          checked={selected}
          onChange={onToggleSelect}
        />
      </td>
      <td className="px-3 py-2.5 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          {fileTypeIcon(file.name, 'h-6 w-6 shrink-0')}
          <div className="min-w-0 flex-1">
            <span
              className={`truncate block ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
              title={file.name}
            >
              {file.name}
            </span>
            {isTrash && file.originalPath ? (
              <div
                className="truncate text-[11px] font-normal text-[var(--gd-text-secondary)]"
                title={`${t('originalLocation')}: ${file.originalPath}`}
              >
                <span className="opacity-70">{t('originalLocation')}:</span> {file.originalPath}
              </div>
            ) : showPath ? (
              <div className="truncate text-[11px] font-normal text-[var(--gd-text-secondary)]" title={file.path}>
                {file.path}
              </div>
            ) : null}
          </div>
        </div>
      </td>
      <td className="hidden w-52 px-3 py-2.5 text-[var(--gd-text-secondary)] md:table-cell whitespace-nowrap">
        {formatDate(file.mtime)}
      </td>
      <td className="hidden w-28 px-3 py-2.5 text-[var(--gd-text-secondary)] sm:table-cell whitespace-nowrap">
        {formatSize(file.size)}
      </td>
      <td className="w-36 px-2 py-2" onClick={(e) => e.stopPropagation()}>
        <RowQuickActions
          onDownload={onDownload}
          onRename={readonly || isTrash ? undefined : onRenameFile}
          onRestore={readonly || !isTrash ? undefined : onRestoreFile}
          onDeleteForever={readonly || !isTrash ? undefined : onDeleteForeverFile}
          onMore={readonly || isTrash ? undefined : onShowFileMenu}
          showDownload={!isTrash}
          busy={actionsBusy}
          actionsLocked={deleteForeverBusy && isTrash}
          alwaysVisible={isTrash}
        />
      </td>
    </tr>
  );
}, (prev, next) => {
  return (
    prev.file === next.file &&
    prev.currentFolder === next.currentFolder &&
    prev.selected === next.selected &&
    prev.isDragging === next.isDragging &&
    prev.readonly === next.readonly &&
    prev.isTrash === next.isTrash &&
    prev.deleteForeverBusy === next.deleteForeverBusy &&
    prev.actionsBusy === next.actionsBusy
  );
});

const FolderGridCard = memo(function FolderGridCard({
  name,
  path,
  countText,
  tooltip,
  selected,
  onMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMenu,
  onRestore,
  onDeleteForever,
  actionsDisabled = false,
  actionsBusy = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragEnter,
  onDragLeave,
  onDrop,
  isDropTarget = false,
  isDragging = false,
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      title={tooltip}
      className={`gd-grid-folder ${selected ? 'selected' : ''} ${isDropTarget ? 'drop-target' : ''} ${isDragging ? 'gd-drag-source' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }}
    >
      <IconFolderGrid className="h-6 w-6 shrink-0 pointer-events-none" />
      <div className="min-w-0 flex-1 pointer-events-none">
        <div
          className={`truncate text-sm ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
        >
          {name}
        </div>
        {path && (
          <div className="truncate text-[11px] font-normal text-[var(--gd-text-secondary)]">
            {path}
          </div>
        )}
        {countText && (
          <div className="truncate text-[11px] font-normal text-[var(--gd-text-secondary)]">
            {countText}
          </div>
        )}
      </div>
      <GridTrashActions
        onRestore={onRestore}
        onDeleteForever={onDeleteForever}
        disabled={actionsDisabled}
        busy={actionsBusy}
      />
      {onMenu && <GridMenuButton onClick={onMenu} />}
    </div>
  );
}, (prev, next) => {
  return (
    prev.name === next.name &&
    prev.path === next.path &&
    prev.selected === next.selected &&
    prev.isDropTarget === next.isDropTarget &&
    prev.isDragging === next.isDragging &&
    prev.countText === next.countText &&
    prev.tooltip === next.tooltip &&
    prev.actionsDisabled === next.actionsDisabled &&
    prev.actionsBusy === next.actionsBusy &&
    prev.draggable === next.draggable
  );
});

const FileGridCard = memo(function FileGridCard({
  file,
  currentFolder,
  selected,
  onMouseDown,
  onClick,
  onDoubleClick,
  onContextMenu,
  onMenu,
  onRestore,
  onDeleteForever,
  actionsDisabled = false,
  actionsBusy = false,
  draggable = false,
  onDragStart,
  onDragEnd,
  isDragging = false,
  isTrash = false,
}) {
  const { t } = useI18n();
  const ext = fileExt(file.name);
  const isImage = IMAGE_EXT.has(ext || '');
  const thumbSrc = isImage && file.localPath ? `file://${file.localPath}` : null;
  const fileDir = file.path ? file.path.substring(0, file.path.lastIndexOf('/') + 1) : '';
  const showPath = Boolean(fileDir && currentFolder && fileDir !== currentFolder);

  return (
    <div
      id={`vault-file-${file.messageId}`}
      role="button"
      tabIndex={0}
      className={`gd-grid-file ${selected ? 'selected' : ''} ${isDragging ? 'gd-drag-source' : ''}`}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMouseDown={onMouseDown}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(e);
        }
      }}
    >
      <div className="gd-grid-file-header">
        {fileTypeIcon(file.name, 'h-5 w-5 shrink-0')}
        <div className="min-w-0 flex-1">
          <span
            className={`truncate block text-sm ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
            title={file.name}
          >
            {file.name}
          </span>
          {isTrash && file.originalPath ? (
            <div
              className="truncate text-[10px] font-normal text-[var(--gd-text-secondary)]"
              title={`${t('originalLocation')}: ${file.originalPath}`}
            >
              <span className="opacity-70">{t('originalLocation')}:</span> {file.originalPath}
            </div>
          ) : showPath ? (
            <div className="truncate text-[10px] font-normal text-[var(--gd-text-secondary)]" title={file.path}>
              {file.path}
            </div>
          ) : null}
        </div>
        <GridTrashActions
          onRestore={onRestore}
          onDeleteForever={onDeleteForever}
          disabled={actionsDisabled}
          busy={actionsBusy}
        />
        {onMenu && <GridMenuButton onClick={onMenu} />}
      </div>
      {thumbSrc ? (
        <div className="gd-grid-file-preview">
          <img src={thumbSrc} alt="" loading="lazy" />
        </div>
      ) : (
        <div className="gd-grid-file-preview gd-grid-file-preview--placeholder">
          {fileTypeIcon(file.name, 'h-12 w-12 opacity-80')}
        </div>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.file === next.file &&
    prev.currentFolder === next.currentFolder &&
    prev.selected === next.selected &&
    prev.isDragging === next.isDragging &&
    prev.actionsDisabled === next.actionsDisabled &&
    prev.actionsBusy === next.actionsBusy &&
    prev.draggable === next.draggable &&
    prev.isTrash === next.isTrash
  );
});

export const RowQuickActions = memo(function RowQuickActions({
  onDownload,
  onRename,
  onRestore,
  onDeleteForever,
  onMore,
  showDownload = false,
  onOpenFolder,
  busy = false,
  actionsLocked = false,
  alwaysVisible = false,
}) {
  const { t } = useI18n();
  const actions_class = alwaysVisible
    ? 'gd-row-actions gd-row-actions--always'
    : 'gd-row-actions';
  const controls_disabled = busy || actionsLocked;

  return (
    <div className={actions_class}>
      {onOpenFolder && (
        <button type="button" className="gd-row-action" title={t('openFolder')} onClick={onOpenFolder}>
          <IconFolder className="h-5 w-5" />
        </button>
      )}
      {showDownload && onDownload && (
        <button type="button" className="gd-row-action" title={t('download')} onClick={onDownload}>
          <IconDownload className="h-5 w-5" />
        </button>
      )}
      {onRename && (
        <button type="button" className="gd-row-action" title={t('rename')} onClick={onRename}>
          <IconRename className="h-5 w-5" />
        </button>
      )}
      {onRestore && (
        <button
          type="button"
          className="gd-row-action"
          title={t('restore')}
          onClick={onRestore}
          disabled={controls_disabled}
        >
          <IconRestore className="h-5 w-5" />
        </button>
      )}
      {onDeleteForever && (
        <button
          type="button"
          className="gd-row-action"
          title={t('deleteForever')}
          onClick={onDeleteForever}
          disabled={controls_disabled}
        >
          {busy ? (
            <span
              className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--gd-primary)] border-t-transparent"
              role="status"
              aria-label={t('deleteForeverProgress')}
            />
          ) : (
            <IconDeleteForever className="h-5 w-5" />
          )}
        </button>
      )}
      {onMore && (
        <button type="button" className="gd-row-action" title={t('moreActions')} onClick={onMore}>
          <IconMoreVert className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}, (prev, next) => {
  return (
    prev.busy === next.busy &&
    prev.actionsLocked === next.actionsLocked &&
    prev.alwaysVisible === next.alwaysVisible &&
    prev.showDownload === next.showDownload
  );
});
