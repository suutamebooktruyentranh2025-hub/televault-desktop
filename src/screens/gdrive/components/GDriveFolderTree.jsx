import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { IconFolder, IconChevronRight } from '../../../components/DriveIcons';

/**
 * Determine sync status indicator color for a folder.
 */
function getFolderStatusColor(folder) {
  if (!folder || folder.totalFiles === 0) return 'bg-zinc-400'; // no files
  if (folder.errorCount > 0) return 'bg-red-500'; // has errors
  if (folder.syncedCount >= folder.totalFiles) return 'bg-emerald-500'; // fully synced
  if (folder.syncedCount > 0) return 'bg-amber-500'; // partial
  return 'bg-sky-500'; // nothing synced
}

/**
 * Recursive folder tree sidebar with lazy-loading, sync stats, and context menu.
 */
export function GDriveFolderTree({
  t,
  treeData,
  expandedFolders,
  selectedFolderId,
  selectedFolderPath,
  treeLoading,
  treeSearch,
  setTreeSearch,
  treeSearchResults = [],
  treeSearchLoading = false,
  selectFolderFromSearch,
  toggleFolder,
  selectFolder,
  syncFolderBusy,
  handleSyncFolder,
  hideIgnored,
  handleToggleHideIgnored,
}) {
  const [contextMenu, setContextMenu] = useState(null);
  const contextMenuRef = useRef(null);

  // Close context menu on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target)) {
        setContextMenu(null);
      }
    };
    if (contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [contextMenu]);

  const handleContextMenu = useCallback((e, folder) => {
    e.preventDefault();
    const menuWidth = 220;
    const menuHeight = 140;
    const padding = 12;

    let x = e.clientX;
    let y = e.clientY;

    if (y + menuHeight > window.innerHeight - padding) {
      y = Math.max(padding, y - menuHeight);
    }
    if (x + menuWidth > window.innerWidth - padding) {
      x = Math.max(padding, window.innerWidth - menuWidth - padding);
    }

    setContextMenu({
      x,
      y,
      folder,
    });
  }, []);

  useLayoutEffect(() => {
    if (!contextMenu || !contextMenuRef.current) return;
    const el = contextMenuRef.current;
    const rect = el.getBoundingClientRect();
    const padding = 12;

    let adjustedX = contextMenu.x;
    let adjustedY = contextMenu.y;

    if (adjustedX + rect.width > window.innerWidth - padding) {
      adjustedX = Math.max(padding, window.innerWidth - rect.width - padding);
    }
    if (adjustedY + rect.height > window.innerHeight - padding) {
      adjustedY = Math.max(padding, window.innerHeight - rect.height - padding);
    }

    if (adjustedX !== contextMenu.x || adjustedY !== contextMenu.y) {
      el.style.left = `${adjustedX}px`;
      el.style.top = `${adjustedY}px`;
    }
  }, [contextMenu]);

  const rootFolders = treeData['root'] || [];

  // Filter folders by search
  const filterFolders = useCallback((folders) => {
    if (!treeSearch) return folders;
    const term = treeSearch.toLowerCase();
    return folders.filter((f) => f.name.toLowerCase().includes(term));
  }, [treeSearch]);

  return (
    <div className="gd-folder-tree flex flex-col h-full min-w-0 border-r border-[var(--gd-border)] bg-[var(--gd-surface)]">
      {/* Tree Search & Ignored Filter */}
      <div className="p-2 border-b border-[var(--gd-border)] shrink-0 flex flex-col gap-1.5">
        <div className="relative flex items-center">
          <input
            type="text"
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
            placeholder={t('gdriveSearchFolderPlaceholder')}
            className="w-full text-[11px] pl-7 pr-7 py-1.5 rounded-md border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] focus:outline-hidden focus:border-[var(--gd-primary)] transition-colors"
          />
          <svg
            className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none h-3 w-3 text-[var(--gd-text-secondary)] opacity-50"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {Boolean(treeSearch) && (
            <button
              type="button"
              onClick={() => setTreeSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 rounded-full flex items-center justify-center text-[10px] text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-[var(--gd-surface-hover)] cursor-pointer transition-colors"
              title={t('gdriveClearSearch')}
            >
              ✕
            </button>
          )}
        </div>

        {/* Hide Ignored Checkbox */}
        <label
          className="flex items-center gap-1.5 text-[11px] text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] cursor-pointer select-none px-0.5"
          title={t('gdriveCacheHideIgnoredTooltip')}
        >
          <input
            type="checkbox"
            checked={Boolean(hideIgnored)}
            onChange={(e) => handleToggleHideIgnored?.(e.target.checked)}
            className="rounded border-[var(--gd-border)] text-[var(--gd-primary)] focus:ring-0 cursor-pointer h-3.5 w-3.5"
          />
          <span className="truncate">{t('gdriveCacheHideIgnored')}</span>
        </label>
      </div>

      {/* Main Content: Search Results vs Tree View */}
      {treeSearch.trim() ? (
        <div className="flex-1 overflow-auto min-h-0 py-1">
          <div className="px-3 py-1 flex items-center justify-between text-[11px] text-[var(--gd-text-secondary)] font-medium border-b border-[var(--gd-border)]/40 mb-1">
            <span>
              {treeSearchLoading
                ? t('gdriveSearchFoldersSearching')
                : t('gdriveSearchResultsCount', { n: treeSearchResults.length })}
            </span>
          </div>

          {treeSearchLoading ? (
            <div className="p-4 text-center text-xs text-[var(--gd-text-secondary)]">
              <span className="animate-pulse">{t('gdriveSearchFoldersSearching')}</span>
            </div>
          ) : treeSearchResults.length === 0 ? (
            <div className="p-4 text-center text-xs text-[var(--gd-text-secondary)] opacity-70">
              {t('gdriveSearchNoFoldersFound')}
            </div>
          ) : (
            <div className="space-y-0.5">
              {treeSearchResults.map((folder) => {
                const isSelected = selectedFolderId === folder.id;
                const parentPath = folder.drivePath
                  ? folder.drivePath.replace(new RegExp(`/${folder.name}/?$`), '') || '/'
                  : '/';
                return (
                  <div
                    key={folder.id}
                    className={`group flex items-center gap-1.5 px-3 py-1.5 cursor-pointer transition-colors text-xs select-none ${
                      isSelected
                        ? 'bg-[var(--gd-primary)]/10 text-[var(--gd-primary)] font-semibold'
                        : 'text-[var(--gd-text)] hover:bg-[var(--gd-surface-hover)]'
                    }`}
                    onClick={() => {
                      if (typeof selectFolderFromSearch === 'function') {
                        selectFolderFromSearch(folder);
                      } else {
                        selectFolder(folder.id, [
                          { id: 'root', name: t('gdriveMyDrive') },
                          { id: folder.id, name: folder.name },
                        ]);
                      }
                    }}
                    onContextMenu={(e) => handleContextMenu(e, folder)}
                  >
                    <IconFolder className="h-4 w-4 text-amber-500 shrink-0" />

                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium leading-tight">{folder.name}</div>
                      <div className="truncate text-[10px] text-[var(--gd-text-secondary)] opacity-70 leading-tight">
                        {parentPath}
                      </div>
                    </div>

                    {folder.totalFiles > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--gd-surface-elevated)] border border-[var(--gd-border)]/50 text-[var(--gd-text-secondary)] tabular-nums">
                        <span className={`h-1.5 w-1.5 rounded-full ${getFolderStatusColor(folder)}`} />
                        <span>{folder.syncedCount}/{folder.totalFiles}</span>
                      </span>
                    )}

                    <button
                      type="button"
                      className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-[var(--gd-surface-hover)] cursor-pointer transition-opacity"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleContextMenu(
                          { preventDefault: () => {}, clientX: e.clientX, clientY: e.clientY },
                          folder
                        );
                      }}
                    >
                      <span className="text-[10px]">⋯</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Root node */
        <div className="flex-1 overflow-auto min-h-0 py-1">
          <FolderNode
            t={t}
            folder={{ id: 'root', name: t('gdriveMyDrive'), hasChildren: rootFolders.length > 0, totalFiles: 0, syncedCount: 0, pendingCount: 0, errorCount: 0 }}
            depth={0}
            currentBreadcrumb={[{ id: 'root', name: t('gdriveMyDrive') }]}
            isExpanded={true}
            isSelected={selectedFolderId === 'root'}
            treeData={treeData}
            expandedFolders={expandedFolders}
            selectedFolderId={selectedFolderId}
            toggleFolder={toggleFolder}
            selectFolder={selectFolder}
            onContextMenu={handleContextMenu}
            treeSearch={treeSearch}
            filterFolders={filterFolders}
            hideIgnored={hideIgnored}
            isRoot={true}
          />
        </div>
      )}

      {treeLoading && !treeSearch.trim() && (
        <div className="p-2 text-center text-[10px] text-[var(--gd-text-secondary)] opacity-60 shrink-0 border-t border-[var(--gd-border)]">
          <span className="animate-pulse">{t('gdriveFolderTreeLoading')}</span>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && createPortal(
        <>
          <div
            className="fixed inset-0 z-50 bg-transparent cursor-default"
            onClick={() => setContextMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu(null);
            }}
          />
          <div
            ref={contextMenuRef}
            className="fixed z-50 min-w-[210px] bg-[var(--gd-surface-elevated)] border border-[var(--gd-border)] rounded-xl shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <ContextMenuItem
              icon="🔄"
              label={t('gdriveSyncThisFolder')}
              busy={syncFolderBusy === contextMenu.folder.id}
              onClick={() => {
                handleSyncFolder(contextMenu.folder.id, false);
                setContextMenu(null);
              }}
            />
            <ContextMenuItem
              icon="📂"
              label={t('gdriveSyncSubfolders')}
              busy={syncFolderBusy === contextMenu.folder.id}
              onClick={() => {
                handleSyncFolder(contextMenu.folder.id, true);
                setContextMenu(null);
              }}
            />
            <div className="my-1 border-t border-[var(--gd-border)]" />
            <ContextMenuItem
              icon="↗"
              label={t('gdriveOpenInGDrive')}
              onClick={() => {
                const url = `https://drive.google.com/drive/folders/${contextMenu.folder.id}`;
                if (window.televault?.shell?.openExternal) {
                  window.televault.shell.openExternal(url);
                } else {
                  window.open(url, '_blank', 'noopener,noreferrer');
                }
                setContextMenu(null);
              }}
            />
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

function ContextMenuItem({ icon, label, onClick, busy = false }) {
  return (
    <button
      type="button"
      className="w-full text-left px-3 py-1.5 text-xs text-[var(--gd-text)] hover:bg-[var(--gd-surface-hover)] flex items-center gap-2 disabled:opacity-40 cursor-pointer transition-colors"
      onClick={onClick}
      disabled={busy}
    >
      <span className="w-4 text-center text-[11px]">{busy ? '⏳' : icon}</span>
      <span>{label}</span>
    </button>
  );
}

function folderNodePropsAreEqual(prev, next) {
  if (prev.isSelected !== next.isSelected) return false;
  if (prev.isExpanded !== next.isExpanded) return false;
  if (prev.depth !== next.depth) return false;
  if (prev.folder !== next.folder) return false;
  if (prev.treeSearch !== next.treeSearch) return false;
  if (prev.hideIgnored !== next.hideIgnored) return false;
  if (prev.t !== next.t) return false;

  // If expanded, check if this node's own children in treeData changed
  if (next.isExpanded) {
    if (prev.treeData[prev.folder.id] !== next.treeData[next.folder.id]) return false;
    const children = next.treeData[next.folder.id] || [];
    for (const ch of children) {
      if ((prev.selectedFolderId === ch.id) !== (next.selectedFolderId === ch.id)) return false;
      if (prev.expandedFolders.has(ch.id) !== next.expandedFolders.has(ch.id)) return false;
    }
  }

  return true;
}

const FolderNode = React.memo(function FolderNode({
  t,
  folder,
  depth,
  currentBreadcrumb,
  isExpanded,
  isSelected,
  treeData,
  expandedFolders,
  selectedFolderId,
  toggleFolder,
  selectFolder,
  onContextMenu,
  treeSearch,
  filterFolders,
  hideIgnored,
  isRoot = false,
}) {
  const rootName = t ? t('gdriveMyDrive') : 'My Vault';
  const children = treeData[folder.id] || [];
  const displayChildren = filterFolders(children);
  const hasExpandableChildren = folder.hasChildren || children.length > 0;

  // Determine sync status indicator color
  const getStatusColor = () => getFolderStatusColor(folder);

  const handleClick = (e) => {
    e.stopPropagation();
    const breadcrumb = currentBreadcrumb || (isRoot ? [{ id: 'root', name: rootName }] : [{ id: 'root', name: rootName }, { id: folder.id, name: folder.name }]);
    selectFolder(folder.id, breadcrumb);
    if (!isExpanded && hasExpandableChildren) {
      toggleFolder(folder.id);
    }
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    toggleFolder(folder.id);
  };

  const paddingLeft = 4 + depth * 20;

  return (
    <>
      <div
        className={`group flex items-center gap-1 px-1 py-0.5 cursor-pointer transition-colors text-[12px] select-none ${
          isSelected
            ? 'bg-[var(--gd-primary)]/10 text-[var(--gd-primary)] font-semibold'
            : 'text-[var(--gd-text)] hover:bg-[var(--gd-surface-hover)]'
        }`}
        style={{ paddingLeft }}
        onClick={handleClick}
        onContextMenu={(e) => !isRoot && onContextMenu(e, folder)}
      >
        {/* Expand/Collapse arrow */}
        {hasExpandableChildren ? (
          <button
            type="button"
            className="shrink-0 w-4 h-4 flex items-center justify-center rounded hover:bg-[var(--gd-surface-hover)] cursor-pointer"
            onClick={handleToggle}
          >
            <IconChevronRight
              className={`h-3 w-3 transition-transform duration-150 ${
                isExpanded ? 'rotate-90' : ''
              }`}
            />
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}

        {/* Folder icon */}
        <IconFolder className={`h-4 w-4 shrink-0 ${isRoot ? 'text-[var(--gd-primary)]' : 'text-amber-500'}`} />

        {/* Name */}
        <span className="truncate flex-1 min-w-0">{folder.name}</span>

        {/* Stats badge with status indicator dot */}
        {!isRoot && folder.totalFiles > 0 && (
          <span className="shrink-0 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--gd-surface-elevated)] border border-[var(--gd-border)]/50 text-[var(--gd-text-secondary)] tabular-nums">
            <span className={`h-1.5 w-1.5 rounded-full ${getStatusColor()}`} />
            <span>{folder.syncedCount}/{folder.totalFiles}</span>
          </span>
        )}

        {/* Context menu trigger (visible on hover) */}
        {!isRoot && (
          <button
            type="button"
            className="shrink-0 w-4 h-4 flex items-center justify-center rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-[var(--gd-surface-hover)] cursor-pointer transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onContextMenu(
                { preventDefault: () => {}, clientX: e.clientX, clientY: e.clientY },
                folder
              );
            }}
          >
            <span className="text-[10px]">⋯</span>
          </button>
        )}
      </div>

      {/* Children */}
      {isExpanded && displayChildren.length > 0 && (
        <div>
          {displayChildren.map((child, idx) => (
            <FolderNode
              key={child.id ? `${child.id}-${idx}` : idx}
              t={t}
              folder={child}
              depth={depth + 1}
              currentBreadcrumb={[...(currentBreadcrumb || [{ id: 'root', name: rootName }]), { id: child.id, name: child.name }]}
              isExpanded={expandedFolders.has(child.id)}
              isSelected={selectedFolderId === child.id}
              treeData={treeData}
              expandedFolders={expandedFolders}
              selectedFolderId={selectedFolderId}
              toggleFolder={toggleFolder}
              selectFolder={selectFolder}
              onContextMenu={onContextMenu}
              treeSearch={treeSearch}
              filterFolders={filterFolders}
              hideIgnored={hideIgnored}
            />
          ))}
        </div>
      )}
    </>
  );
}, folderNodePropsAreEqual);
