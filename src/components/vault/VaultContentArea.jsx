import { useState, useEffect, useMemo } from 'react';
import { BrowserScreen } from '../BrowserScreen';
import { SearchResultsBody } from '../SearchResultsBody';
import { SettingsScreen } from '../../screens/SettingsScreen';
import { GDriveSyncScreen } from '../../screens/GDriveSyncScreen';
import { TransferScreen } from '../../screens/TransferScreen';
import { DashboardScreen } from '../../screens/DashboardScreen';
import { DuplicatesScreen } from '../../screens/DuplicatesScreen';
import { DriveBreadcrumb } from '../DriveBreadcrumb';
import { CreateTagDialog } from '../CreateTagDialog';
import { IconDeleteForever } from '../DriveIcons';
import { useDialog } from '../../context/DialogContext';
import { DEFAULT_TRASH_FOLDER, isTrashPath } from '../../constants/vaultConstants';

export function VaultContentArea({
  section,
  navigation,
  vault,
  sharedVaults,
  selection,
  actions,
  tagFilter,
  folderSummary,
  activeAccount,
  onSignOut,
  onOpenUpdateModal,
  t,
  showToast,
}) {
  const {
    isSearching,
    searchResults,
    searchLoading,
    setSection,
    setSearchQuery,
    vaultView,
    setVaultView,
  } = navigation;

  const {
    selectedIds,
    selectedFolders,
    selectionCount,
    canDownloadSelection,
    clearSelection,
    toggleSelect,
    applyItemSelection,
    selectAllInView,
  } = selection;

  const {
    setPreviewFile,
    handleDownload,
    handleDownloadFolder,
    handleSaveAs,
    handleOpenFile,
    handleRenameFile,
    handleRenameFolder,
    handleMoveFile,
    handleMoveFolder,
    handleMoveEntriesDirect,
    handleFolderTags,
    handleTrashFile,
    handleTrashFolder,
    handleRestoreFolder,
    handleDeleteForeverFolder,
    handleRestoreFile,
    handleDeleteForeverFile,
    handleUploadFiles,
    handleUploadFolder,
    handleCreateFolder,
    handleDownloadSelected,
    handleMoveSelected,
    handleTrashSelected,
    handleRestoreSelected,
    handleDeleteForeverSelected,
    delete_forever_busy,
    delete_forever_target_keys,
  } = actions;

  const { prompt, confirm } = useDialog();
  const [showCreateTagDialog, setShowCreateTagDialog] = useState(false);
  const [visitedSections, setVisitedSections] = useState(() => new Set(['vault', section]));

  useEffect(() => {
    setVisitedSections((prev) => {
      if (prev.has(section)) return prev;
      const next = new Set(prev);
      next.add(section);
      return next;
    });
  }, [section]);

  async function handleRenameTag(tag) {
    const newName = await prompt(t('newName'), tag);
    if (!newName?.trim() || newName.trim() === tag) return;
    const ok = await tagFilter?.renameTag?.(tag, newName.trim());
    if (!ok) {
      showToast(t('errorGeneric'), { variant: 'error' });
    }
  }

  async function handleDeleteTag(tag) {
    const ok = await confirm(t('tagDeleteConfirm', { name: tag }));
    if (!ok) return;
    const res = await tagFilter?.deleteTag?.(tag);
    if (!res) {
      showToast(t('errorGeneric'), { variant: 'error' });
    }
  }

  async function handleSaveNewTag(tagName, folderPath) {
    const folderRes = await window.televault?.vault?.getFolderTags(folderPath);
    const existingTags = folderRes?.ok ? folderRes.tags || [] : [];
    if (!existingTags.includes(tagName)) {
      const nextTags = [...existingTags, tagName];
      const saveRes = await window.televault?.vault?.setFolderTags(folderPath, nextTags);
      if (!saveRes?.ok) {
        showToast(saveRes?.error || t('errorGeneric'), { variant: 'error' });
        return false;
      }
    }
    await tagFilter?.refresh?.();
    return true;
  }

  function openFolder(name, explicitPath = null) {
    clearSelection();
    tagFilter?.clearTags?.();
    if (explicitPath) {
      vault.goTo(explicitPath);
    } else {
      const base = vault.currentFolder.endsWith('/') ? vault.currentFolder : `${vault.currentFolder}/`;
      const parts = base.split('/').filter(Boolean);
      if (parts.length > 0 && parts[parts.length - 1] === name) {
        vault.goTo(base);
      } else {
        vault.goTo(`${base}${name}/`);
      }
    }
  }

  function handleDashboardOpenFolder(folderPath) {
    clearSelection();
    setSection('vault');
    vault.goTo(folderPath);
  }

  function handleDashboardOpenFile(file) {
    clearSelection();
    setSection('vault');
    const parent = file.path.slice(0, file.path.lastIndexOf('/') + 1) || '/';
    vault.goTo(parent);
    void handleOpenFile(file);
  }

  const sortedTagFolders = useMemo(() => {
    const items = [...(tagFilter?.filteredFolderItems || [])];
    const isShared = section === 'shared-vault';
    const field = (isShared ? sharedVaults?.sortField : vault?.sortField) || 'name';
    const dir = (isShared ? sharedVaults?.sortDirection : vault?.sortDirection) || 'asc';
    items.sort((a, b) => {
      let cmp = 0;
      if (field === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '');
      } else if (field === 'mtime') {
        const timeA = a.mtime ? new Date(a.mtime).getTime() : 0;
        const timeB = b.mtime ? new Date(b.mtime).getTime() : 0;
        cmp = timeA - timeB;
      } else if (field === 'size') {
        cmp = (a.size || 0) - (b.size || 0);
      }
      return dir === 'asc' ? cmp : -cmp;
    });
    return items;
  }, [
    tagFilter?.filteredFolderItems,
    section,
    sharedVaults?.sortField,
    sharedVaults?.sortDirection,
    vault?.sortField,
    vault?.sortDirection,
  ]);

  function renderSharedVault() {
    const noop = () => {};

    const sharedDownloadFolder = async (folderName) => {
      const folderPath = `${sharedVaults.currentFolder}${folderName}/`;
      const result = await window.televault?.sharedVault?.downloadFolder(sharedVaults.activeVaultId, folderPath);
      if (result?.cancelled) return;
      if (!result?.ok) {
        showToast(result?.error || t('errorGeneric'), { variant: 'error' });
        return;
      }
      showToast(t('saveFolderDone', { saved: result.saved, total: result.total, path: result.destRoot }));
    };

    const sharedDownload = async (file) => {
      const result = await window.televault?.sharedVault?.download(sharedVaults.activeVaultId, file.messageId);
      if (result?.cancelled) return;
      if (!result?.ok) {
        showToast(result?.error || t('errorGeneric'), { variant: 'error' });
        return;
      }
      showToast(t('downloadDone', { path: result.path }));
    };

    if (isSearching) {
      return (
        <SearchResultsBody
          files={searchResults}
          loading={searchLoading}
          selectedIds={selectedIds}
          onToggleSelect={toggleSelect}
          onOpenFile={noop}
          onApplyItemSelection={applyItemSelection}
          onDownload={sharedDownload}
          onRenameFile={noop}
          onMoveFile={noop}
          onTrashFile={noop}
          onSaveAs={noop}
          onPreview={(file) => setPreviewFile(file)}
        />
      );
    }

    const activeTagCount = tagFilter?.activeTags?.length || (tagFilter?.activeTag ? 1 : 0);
    const isTagFiltered = activeTagCount > 0;

    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
        {/* Breadcrumb Bar at the top of Shared Vault content */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--gd-border)] bg-[var(--gd-bg)] min-h-[40px] shrink-0 gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <DriveBreadcrumb
              crumbs={sharedVaults.breadcrumbs}
              onNavigate={sharedVaults.goTo}
              showSingle={true}
            />
            {folderSummary?.text && (
              <span
                className="text-xs text-[var(--gd-text-secondary)] whitespace-nowrap select-none opacity-75 hidden sm:inline shrink-0"
                title={folderSummary.tooltip}
              >
                • {folderSummary.text}
              </span>
            )}
          </div>
        </div>

        {isTagFiltered && (
          <div className="flex items-center justify-between px-4 pt-2.5 pb-2 text-xs text-[var(--gd-text-secondary)] border-b border-[var(--gd-border)] bg-[var(--gd-bg)]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>{t('tagsTitle')}:</span>
              <span className="font-semibold text-[var(--gd-text)]">
                {(tagFilter.activeTags || [tagFilter.activeTag]).join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span>{t('tagFolderCount', { n: String(tagFilter.filteredFolders?.length || 0) })}</span>
              <button
                type="button"
                onClick={() => tagFilter.clearTags?.()}
                className="inline-flex items-center gap-1 rounded-full border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                title={t('clearFilter')}
              >
                <span>✕</span>
                <span>{t('clearFilter')}</span>
              </button>
            </div>
          </div>
        )}

        <BrowserScreen
          folders={isTagFiltered ? sortedTagFolders : sharedVaults.folders}
          files={isTagFiltered ? [] : sharedVaults.files}
          currentFolderCounts={isTagFiltered ? null : sharedVaults.currentFolderCounts}
          loading={isTagFiltered ? Boolean(tagFilter?.tagFilterLoading) : (sharedVaults.loading || sharedVaults.scanning)}
          emptyText={
            isTagFiltered
              ? t('tagFoldersEmpty')
              : sharedVaults.browseScope === 'stories'
              ? t('scopeStoriesEmpty')
              : sharedVaults.browseScope === 'files'
              ? t('scopeFilesEmpty')
              : undefined
          }
          readonly={true}
          viewMode={vault.viewMode}
          sortField={sharedVaults.sortField}
          sortDirection={sharedVaults.sortDirection}
          trashFolder="__never_match__"
          currentFolder={sharedVaults.currentFolder}
          selectedIds={selectedIds}
          selectedFolders={selectedFolders}
          onOpenFolder={(f, explicitPath = null) => {
            if (explicitPath) {
              sharedVaults.goTo(explicitPath);
            } else {
              const base = sharedVaults.currentFolder.endsWith('/') ? sharedVaults.currentFolder : `${sharedVaults.currentFolder}/`;
              const parts = base.split('/').filter(Boolean);
              if (parts.length > 0 && parts[parts.length - 1] === f) {
                sharedVaults.goTo(base);
              } else {
                sharedVaults.goTo(`${base}${f}/`);
              }
            }
          }}
          onToggleSort={sharedVaults.toggleSort}
          onToggleViewMode={vault.toggleViewMode}
          onToggleSelect={toggleSelect}
          onApplyItemSelection={applyItemSelection}
          onToggleFolderSelect={(name, explicitPath) => {
            const folderPath = explicitPath || `${sharedVaults.currentFolder}${name}/`;
            applyItemSelection(
              `folder:${folderPath}`,
              { additive: true, range: false },
              [
                ...sharedVaults.folders.map((f) => `folder:${f.path || `${sharedVaults.currentFolder}${f.name}/`}`),
                ...sharedVaults.files.map((f) => `file:${f.messageId}`),
              ],
            );
          }}
          onOpenFile={handleOpenFile}
          onRenameFile={noop}
          onRenameFolder={noop}
          onMoveFile={noop}
          onMoveFolder={noop}
          onFolderTags={noop}
          onTrashFile={noop}
          onTrashFolder={noop}
          onRestoreFolder={noop}
          onDeleteForeverFolder={noop}
          onRestoreFile={noop}
          onDeleteForeverFile={noop}
          onDownload={sharedDownload}
          onDownloadFolder={sharedDownloadFolder}
          onSaveAs={noop}
          onPreview={(file) => setPreviewFile(file)}
          selectionCount={selectionCount}
          canDownloadSelection={canDownloadSelection}
          onClearSelection={clearSelection}
          onDownloadSelected={async () => {
            for (const messageId of selectedIds) {
              await sharedDownload({ messageId });
            }
            for (const folderPath of selectedFolders) {
              const folderName = folderPath.slice(sharedVaults.currentFolder.length, -1);
              if (folderName) await sharedDownloadFolder(folderName);
            }
            clearSelection();
          }}
          onSelectAll={() => {
            const allKeys = [
              ...sharedVaults.folders.map((f) => `folder:${sharedVaults.currentFolder}${f.name}/`),
              ...sharedVaults.files.map((f) => `file:${f.messageId}`),
            ];
            for (const key of allKeys) {
              applyItemSelection(key, { additive: true, range: false }, allKeys);
            }
          }}
          hideToolbar={true}
        />
      </div>
    );
  }

  const isTrash = isTrashPath(vault.currentFolder, vault.stats?.trashFolder || DEFAULT_TRASH_FOLDER);

  const activeTagCount = tagFilter?.activeTags?.length || (tagFilter?.activeTag ? 1 : 0);
  const isTagFiltered =
    section === 'vault' &&
    !isTrash &&
    vaultView !== 'duplicates' &&
    !isSearching &&
    activeTagCount > 0;
  const isVaultMainActive =
    section === 'vault' &&
    !isSearching &&
    vaultView !== 'duplicates';

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {/* 1. Main Vault BrowserScreen (Keep-Alive) */}
      <div
        className={
          isVaultMainActive
            ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
            : 'invisible absolute inset-0 pointer-events-none -z-10'
        }
      >
        {/* Breadcrumb Bar at the top of Vault content */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--gd-border)] bg-[var(--gd-bg)] min-h-[40px] shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden">
            <DriveBreadcrumb
              crumbs={isTrash ? navigation.trash_breadcrumbs : vault.breadcrumbs}
              onNavigate={vault.goTo}
              showSingle={true}
            />
            {!isTrash && folderSummary?.text && (
              <span
                className="text-xs text-[var(--gd-text-secondary)] whitespace-nowrap select-none opacity-75 hidden sm:inline shrink-0"
                title={folderSummary.tooltip}
              >
                • {folderSummary.text}
              </span>
            )}
          </div>
          {isTrash && ((vault.files?.length || 0) + (vault.folders?.length || 0) > 0) && (
            <div className="relative group shrink-0 ml-2">
              <button
                type="button"
                onClick={() => void actions.handleEmptyTrash?.()}
                disabled={actions.delete_forever_busy}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/60 border border-red-200 dark:border-red-900/50 rounded-lg transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label={t('emptyTrashButton')}
              >
                {actions.delete_forever_busy ? (
                  <span
                    className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
                    role="status"
                  />
                ) : (
                  <IconDeleteForever className="h-4 w-4" />
                )}
                <span>{t('emptyTrashButton')}</span>
              </button>
              {/* Modern Floating Dark Bubble Tooltip */}
              <div className="pointer-events-none absolute right-0 top-full mt-1.5 hidden group-hover:flex items-center z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="relative bg-zinc-900/95 dark:bg-zinc-800/95 backdrop-blur-xs text-white text-[11px] leading-tight font-normal px-2.5 py-1.5 rounded-md shadow-lg border border-white/10 whitespace-nowrap">
                  {t('emptyTrashTooltip')}
                  <div className="absolute -top-1 right-4 w-2 h-2 bg-zinc-900/95 dark:bg-zinc-800/95 border-t border-l border-white/10 rotate-45" />
                </div>
              </div>
            </div>
          )}
        </div>
        {isTagFiltered && (
          <div className="flex items-center justify-between px-4 pt-2.5 pb-2 text-xs text-[var(--gd-text-secondary)] border-b border-[var(--gd-border)] bg-[var(--gd-bg)]">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span>{t('tagsTitle')}:</span>
              <span className="font-semibold text-[var(--gd-text)]">
                {(tagFilter.activeTags || [tagFilter.activeTag]).join(', ')}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span>{t('tagFolderCount', { n: String(tagFilter.filteredFolders?.length || 0) })}</span>
              <button
                type="button"
                onClick={() => tagFilter.clearTags?.()}
                className="inline-flex items-center gap-1 rounded-full border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-2 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors cursor-pointer"
                title={t('clearFilter')}
              >
                <span>✕</span>
                <span>{t('clearFilter')}</span>
              </button>
            </div>
          </div>
        )}
        <BrowserScreen
          folders={isTagFiltered ? sortedTagFolders : vault.folders}
          files={isTagFiltered ? [] : vault.files}
          currentFolderCounts={isTagFiltered ? null : vault.currentFolderCounts}
          loading={isTagFiltered ? Boolean(tagFilter?.tagFilterLoading) : vault.loading}
          emptyText={
            isTagFiltered
              ? t('tagFoldersEmpty')
              : vault.browseScope === 'stories'
              ? t('scopeStoriesEmpty')
              : vault.browseScope === 'files'
              ? t('scopeFilesEmpty')
              : undefined
          }
          viewMode={vault.viewMode}
          sortField={vault.sortField}
          sortDirection={vault.sortDirection}
          trashFolder={vault.stats.trashFolder}
          currentFolder={vault.currentFolder}
          selectedIds={selectedIds}
          selectedFolders={selectedFolders}
          onOpenFolder={openFolder}
          onToggleSort={vault.toggleSort}
          onToggleViewMode={vault.toggleViewMode}
          onToggleSelect={toggleSelect}
          onApplyItemSelection={applyItemSelection}
          onToggleFolderSelect={(name, explicitPath) => {
            const folderPath = explicitPath || `${vault.currentFolder}${name}/`;
            const currentFolders = isTagFiltered ? sortedTagFolders : vault.folders;
            const currentFiles = isTagFiltered ? [] : vault.files;
            applyItemSelection(
              `folder:${folderPath}`,
              { additive: true, range: false },
              [
                ...currentFolders.map((folder) => `folder:${folder.path || `${vault.currentFolder}${folder.name}/`}`),
                ...currentFiles.map((file) => `file:${file.messageId}`),
              ],
            );
          }}
          onOpenFile={handleOpenFile}
          onRenameFile={handleRenameFile}
          onRenameFolder={handleRenameFolder}
          onMoveFile={handleMoveFile}
          onMoveFolder={handleMoveFolder}
          onMoveEntriesDirect={handleMoveEntriesDirect}
          onFolderTags={handleFolderTags}
          onTrashFile={handleTrashFile}
          onTrashFolder={handleTrashFolder}
          onRestoreFolder={handleRestoreFolder}
          onDeleteForeverFolder={handleDeleteForeverFolder}
          onRestoreFile={handleRestoreFile}
          onDeleteForeverFile={handleDeleteForeverFile}
          onDownload={handleDownload}
          onDownloadFolder={handleDownloadFolder}
          onSaveAs={handleSaveAs}
          onPreview={(file) => setPreviewFile(file)}
          onUploadFiles={handleUploadFiles}
          onUploadFolder={handleUploadFolder}
          onCreateFolder={handleCreateFolder}
          selectionCount={selectionCount}
          canDownloadSelection={canDownloadSelection}
          onClearSelection={clearSelection}
          onDownloadSelected={handleDownloadSelected}
          onMoveSelected={handleMoveSelected}
          onTrashSelected={handleTrashSelected}
          onRestoreSelected={handleRestoreSelected}
          onDeleteForeverSelected={handleDeleteForeverSelected}
          onSelectAll={() => {
            if (isTagFiltered) {
              const allKeys = sortedTagFolders.map((folder) => `folder:${folder.path || `${vault.currentFolder}${folder.name}/`}`);
              const newFolders = new Set(sortedTagFolders.map((folder) => folder.path || `${vault.currentFolder}${folder.name}/`));
              selection.setSelectedIds(new Set());
              selection.setSelectedFolders(newFolders);
              selection.setLastSelectedKey(allKeys.at(-1) ?? null);
            } else {
              selectAllInView(vault);
            }
          }}
          deleteForeverBusy={delete_forever_busy}
          deleteForeverTargetKeys={delete_forever_target_keys}
          onOpenDuplicates={() => setVaultView?.('duplicates')}
          hideToolbar={true}
        />
        {showCreateTagDialog && (
          <CreateTagDialog
            initialFolder={
              selectedFolders.size === 1
                ? [...selectedFolders][0]
                : vault.currentFolder !== '/'
                ? vault.currentFolder
                : ''
            }
            onCancel={() => setShowCreateTagDialog(false)}
            onSave={handleSaveNewTag}
          />
        )}
      </div>

      {/* 3. Search Results */}
      {section === 'vault' && isSearching && (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <SearchResultsBody
            files={searchResults}
            loading={searchLoading}
            selectedIds={selectedIds}
            onToggleSelect={toggleSelect}
            onOpenFile={handleOpenFile}
            onApplyItemSelection={applyItemSelection}
            onDownload={handleDownload}
            onRenameFile={handleRenameFile}
            onMoveFile={handleMoveFile}
            onTrashFile={handleTrashFile}
            onSaveAs={handleSaveAs}
            onPreview={(file) => setPreviewFile(file)}
            viewMode={vault.viewMode}
          />
        </div>
      )}

      {/* 4. Duplicates View */}
      {(section === 'duplicates' || (section === 'vault' && vaultView === 'duplicates')) && (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
          <DuplicatesScreen
            onBack={() => {
              if (section === 'duplicates') setSection('vault');
              setVaultView?.('files');
            }}
            currentFolder={vault.currentFolder}
          />
        </div>
      )}

      {/* 5. GDrive Sync */}
      {visitedSections.has('gdrive') && (
        <div
          className={
            section === 'gdrive'
              ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
              : 'invisible absolute inset-0 pointer-events-none -z-10'
          }
        >
          <GDriveSyncScreen />
        </div>
      )}

      {/* 6. Transfers */}
      {visitedSections.has('transfers') && (
        <div
          className={
            section === 'transfers'
              ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
              : 'invisible absolute inset-0 pointer-events-none -z-10'
          }
        >
          <TransferScreen />
        </div>
      )}

      {/* 7. Dashboard */}
      {visitedSections.has('dashboard') && (
        <div
          className={
            section === 'dashboard'
              ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
              : 'invisible absolute inset-0 pointer-events-none -z-10'
          }
        >
          <DashboardScreen
            onOpenFolder={handleDashboardOpenFolder}
            onOpenFile={handleDashboardOpenFile}
          />
        </div>
      )}

      {/* 8. Settings */}
      {visitedSections.has('settings') && (
        <div
          className={
            section === 'settings'
              ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
              : 'invisible absolute inset-0 pointer-events-none -z-10'
          }
        >
          <SettingsScreen account={activeAccount} onSignOut={onSignOut} onOpenUpdateModal={onOpenUpdateModal} />
        </div>
      )}

      {/* 9. Shared Vault */}
      {visitedSections.has('shared-vault') && (
        <div
          className={
            section === 'shared-vault'
              ? 'flex h-full min-h-0 flex-1 flex-col overflow-hidden'
              : 'invisible absolute inset-0 pointer-events-none -z-10'
          }
        >
          {renderSharedVault()}
        </div>
      )}
    </div>
  );
}
