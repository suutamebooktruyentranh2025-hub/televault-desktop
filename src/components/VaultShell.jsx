import { useEffect, useState } from 'react';
import { DriveSidebar } from './DriveSidebar';
import { DriveBreadcrumb } from './DriveBreadcrumb';
import { DriveTopBar } from './DriveTopBar';
import { MoveToDialog } from './MoveToDialog';
import { FolderTagEditorDialog } from './FolderTagEditorDialog';
import { recordRecentMoveFolder } from '../utils/moveTargets';
import { UploadActivityPanel } from './UploadActivityPanel';
import { PreviewScreen } from '../screens/PreviewScreen';
import { HelpDialog } from './HelpDialog';
import { useVault } from '../hooks/useVault';
import { useSharedVaults } from '../hooks/useSharedVaults';
import { useTransfers } from '../hooks/useTransfers';
import { useI18n } from '../context/I18nContext';
import { useDialog } from '../context/DialogContext';
import { useToast } from '../context/ToastContext';
import { StatusBar } from './StatusBar';
import { useVaultSelection } from '../hooks/vault/useVaultSelection';
import { useVaultNavigation } from '../hooks/vault/useVaultNavigation';
import { useVaultActions } from '../hooks/vault/useVaultActions';
import { useTagFilter } from '../hooks/vault/useTagFilter';
import { VaultContentArea } from './vault/VaultContentArea';
import { formatFolderSummary } from '../utils/folderSummary';
import { formatWaitTime } from '../utils/format';
import { DriveSelectionBar } from './DriveSelectionBar';
import { UpdateBadge } from './updater/UpdateBadge';
import { AppUpdateModal } from './updater/AppUpdateModal';
import {
  IconDashboard,
  IconDownload,
  IconDuplicate,
  IconGDriveLogo,
  IconGridView,
  IconHome,
  IconListView,
  IconMoveTo,
  IconRefresh,
  IconSettings,
  IconSharedDrive,
  IconTransfer,
  IconTrash,
} from './DriveIcons';
import { TagSelectDropdown } from './TagSelectDropdown';
import { BrowseScopeDropdown } from './BrowseScopeDropdown';

export function VaultShell({ accounts, activeAccountId, onSignOut, onSwitchAccount, onAddAccount, floodWaitSec = 0 }) {
  const { t, locale } = useI18n();
  const { prompt, confirm } = useDialog();
  const { showToast } = useToast();
  const vault = useVault({ rootLabel: t('navVault') });
  const sharedVaults = useSharedVaults();
  const transfers = useTransfers({ enabled: true });
  const hasUploadTasks = transfers?.tasks?.some((t) => t.status !== 'cancelled') ?? false;

  const selection = useVaultSelection();
  const navigation = useVaultNavigation({ t, vault, sharedVaults });
  const isSharedSection = navigation.section === 'shared-vault';
  const tagFilter = useTagFilter({
    chatId: isSharedSection ? sharedVaults.activeVaultId : null,
  });
  const actions = useVaultActions({
    t,
    confirm,
    prompt,
    showToast,
    vault,
    selectedIds: selection.selectedIds,
    selectedFolders: selection.selectedFolders,
    clearSelection: selection.clearSelection,
  });

  const [dragOver, setDragOver] = useState(false);
  const [pendingTarget, setPendingTarget] = useState(null);
  const [vaultRescanBusy, setVaultRescanBusy] = useState(false);
  const [rescanProgress, setRescanProgress] = useState(0);
  const activeAccount = accounts?.find((a) => a.id === activeAccountId) || { name: t('defaultUserName'), phone: '' };

  useEffect(() => {
    if (!window.televault?.vault?.onScanProgress) return undefined;
    const unsub = window.televault.vault.onScanProgress((payload) => {
      if (typeof payload?.scanned === 'number') {
        setRescanProgress(payload.scanned);
      }
    });
    return () => unsub?.();
  }, []);

  const [updateInfo, setUpdateInfo] = useState(null);
  const [showUpdateModal, setShowUpdateModal] = useState(false);
  const [updateDismissed, setUpdateDismissed] = useState(false);

  useEffect(() => {
    const autoCheck = localStorage.getItem('televault_auto_check_update') !== 'false';
    if (!autoCheck) return;
    const skipped = localStorage.getItem('televault_skipped_update_version');
    window.televault?.updater?.checkUpdate?.().then((res) => {
      if (res?.ok && res.update?.hasUpdate) {
        if (res.update.latestVersion !== skipped) {
          setUpdateInfo(res.update);
        }
      }
    }).catch(() => {});
  }, []);

  const handleRescanVault = async () => {
    if (vaultRescanBusy) return;
    const confirmed = await confirm(t('rescanVaultConfirm'));
    if (!confirmed) return;

    setVaultRescanBusy(true);
    setRescanProgress(0);
    try {
      const isShared = navigation.section === 'shared-vault';
      const targetChatId = isShared ? sharedVaults.activeVaultId : null;
      const res = await window.televault?.vault?.rescanHistory?.({ chatId: targetChatId });
      if (res?.ok) {
        showToast(t('rescanVaultDone', {
          files: res.fileCount ?? 0,
          messages: res.scanned ?? 0,
        }));
        if (isShared) {
          await sharedVaults.refresh?.();
        } else {
          await vault.refresh?.();
        }
      } else if (res?.aborted) {
        showToast(t('rescanVaultCancelled'), { variant: 'info' });
      } else {
        showToast(res?.error || t('rescanVaultError'), { variant: 'error' });
      }
    } catch (err) {
      if (err?.name === 'AbortError' || String(err?.message || err).toLowerCase().includes('abort')) {
        showToast(t('rescanVaultCancelled'), { variant: 'info' });
      } else {
        showToast(String(err?.message || err) || t('rescanVaultError'), { variant: 'error' });
      }
    } finally {
      setVaultRescanBusy(false);
      setRescanProgress(0);
    }
  };

  const handleCancelRescan = async () => {
    try {
      await window.televault?.vault?.cancelRescan?.();
    } catch {
      // Ignore cancel error
    }
  };

  useEffect(() => {
    function onGdNavigate(e) {
      let targetFolder = '/';
      let targetFilePath = null;
      if (typeof e.detail === 'string') {
        targetFolder = e.detail;
      } else if (e.detail && typeof e.detail === 'object') {
        targetFolder = e.detail.folder || '/';
        targetFilePath = e.detail.filePath || null;
      }

      selection.clearSelection();
      navigation.setSection('vault');
      navigation.setVaultView?.('files');
      navigation.setSearchQuery('');
      if (targetFilePath) {
        setPendingTarget({ folder: targetFolder, filePath: targetFilePath });
      } else {
        setPendingTarget(null);
      }
      vault.goTo(targetFolder);
    }
    window.addEventListener('gd-navigate', onGdNavigate);
    return () => window.removeEventListener('gd-navigate', onGdNavigate);
  }, [vault.goTo, selection.clearSelection, navigation.setSection, navigation.setVaultView, navigation.setSearchQuery]);

  useEffect(() => {
    if (!pendingTarget) return;
    if (vault.currentFolder !== pendingTarget.folder || vault.loading) return;

    const targetNorm = pendingTarget.filePath.trim().toLowerCase();
    const matched = vault.files.find((f) => {
      if (f.path && f.path.trim().toLowerCase() === targetNorm) return true;
      if (f.name && (targetNorm.endsWith('/' + f.name.toLowerCase()) || targetNorm === f.name.toLowerCase())) return true;
      return false;
    });

    if (matched) {
      selection.setSelectedIds(new Set([matched.messageId]));
      selection.setLastSelectedKey(`file:${matched.messageId}`);
      setTimeout(() => {
        const el = document.getElementById(`vault-file-${matched.messageId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    }
    setPendingTarget(null);
  }, [pendingTarget, vault.currentFolder, vault.files, vault.loading, selection]);

  const isVaultSection = navigation.section === 'vault';

  const folderSummary = formatFolderSummary({
    folders: isSharedSection ? sharedVaults.folders : vault.folders,
    files: isSharedSection ? sharedVaults.files : vault.files,
    counts: isSharedSection ? sharedVaults.currentFolderCounts : vault.currentFolderCounts,
    t,
  });

  const isDuplicatesMode = navigation.section === 'duplicates' || (isVaultSection && navigation.vaultView === 'duplicates');

  let topBarLeftContent = null;
  if (isDuplicatesMode) {
    topBarLeftContent = (
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={() => {
            if (navigation.section === 'duplicates') navigation.setSection('vault');
            navigation.setVaultView('files');
          }}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] px-2.5 text-xs font-medium text-[var(--gd-text)] transition-colors hover:bg-[var(--gd-surface-hover)] hover:border-[var(--gd-primary)] hover:text-[var(--gd-primary)]"
          title={t('back')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="19" y1="12" x2="5" y2="12" />
            <polyline points="12 19 5 12 12 5" />
          </svg>
          <span>{t('back')}</span>
        </button>
        <span className="text-sm font-semibold text-[var(--gd-text)] truncate">{t('duplicatesTitle')}</span>
      </div>
    );
  } else if (isVaultSection) {
    if (navigation.isTrash) {
      topBarLeftContent = (
        <div className="flex items-center gap-2.5 min-w-0">
          <IconTrash className="h-5 w-5 shrink-0 text-red-500" />
          <h1 className="text-sm font-semibold text-[var(--gd-text)] truncate">{t('navTrash')}</h1>
        </div>
      );
    } else {
      topBarLeftContent = (
        <div className="flex items-center gap-2.5 min-w-0">
          <IconHome className="h-5 w-5 shrink-0 text-[var(--gd-primary)]" />
          <h1 className="text-sm font-semibold text-[var(--gd-text)] truncate">{t('navVault')}</h1>
        </div>
      );
    }
  } else if (isSharedSection) {
    topBarLeftContent = (
      <div className="flex items-center gap-2.5 min-w-0">
        <IconSharedDrive className="h-5 w-5 shrink-0 text-[var(--gd-primary)]" />
        <h1 className="text-sm font-semibold text-[var(--gd-text)] truncate">
          {sharedVaults.activeVault?.title || t('navSharedWithMe')}
        </h1>
      </div>
    );
  } else if (navigation.section === 'gdrive') {
    topBarLeftContent = (
      <div className="flex items-center gap-2.5 min-w-0">
        <IconGDriveLogo className="h-5 w-5 shrink-0" />
        <h1 className="text-sm font-semibold text-[var(--gd-text)] truncate">{t('gdriveSection')}</h1>
      </div>
    );
  } else if (navigation.section === 'dashboard') {
    topBarLeftContent = (
      <div className="flex items-center gap-2.5 min-w-0">
        <IconDashboard className="h-5 w-5 shrink-0 text-[var(--gd-primary)]" />
        <h1 className="text-sm font-semibold text-[var(--gd-text)] truncate">{t('dashboardSection')}</h1>
      </div>
    );
  } else if (navigation.section === 'transfers') {
    topBarLeftContent = (
      <div className="flex items-center gap-2.5 min-w-0">
        <IconTransfer className="h-5 w-5 shrink-0 text-[var(--gd-primary)]" />
        <h1 className="text-sm font-semibold text-[var(--gd-text)] truncate">{t('taskSection')}</h1>
      </div>
    );
  } else if (navigation.section === 'settings') {
    topBarLeftContent = (
      <div className="flex items-center gap-2.5 min-w-0">
        <IconSettings className="h-5 w-5 shrink-0 text-[var(--gd-primary)]" />
        <h1 className="text-sm font-semibold text-[var(--gd-text)] truncate">{t('navSettings')}</h1>
      </div>
    );
  }

  let topBarRightContent = null;
  if (isVaultSection && navigation.vaultView !== 'duplicates') {
    topBarRightContent = (
      <div className="flex items-center gap-1.5">
        {!navigation.isTrash && (
          <>
            <BrowseScopeDropdown scope={vault.browseScope} onSelectScope={vault.setBrowseScope} />
            <TagSelectDropdown tagFilter={tagFilter} />
            <button
              type="button"
              onClick={() => navigation.setVaultView('duplicates')}
              title={t('navDuplicates')}
              className="flex items-center gap-1.5 rounded-full border border-[var(--gd-border)] px-3 py-1 text-xs font-medium text-[var(--gd-text-secondary)] transition-colors hover:border-[var(--gd-primary)] hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)] cursor-pointer"
            >
              <IconDuplicate className="h-4 w-4 shrink-0" />
              <span className="hidden md:inline">{t('navDuplicates')}</span>
            </button>
            {vaultRescanBusy ? (
              <div className="flex items-center gap-1.5 rounded-full bg-[var(--gd-primary)] text-white pl-2.5 pr-1 py-0.5 text-xs font-semibold shadow-xs">
                <IconRefresh className="h-3.5 w-3.5 shrink-0 animate-spin text-white" />
                <span className="text-white">
                  {rescanProgress > 0 ? t('rescanVaultProgress', { n: rescanProgress }) : t('rescanVaultBusy')}
                </span>
                <button
                  type="button"
                  onClick={handleCancelRescan}
                  title={t('rescanVaultCancel')}
                  className="flex items-center justify-center rounded-full p-1 text-white/80 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRescanVault}
                title={t('rescanVaultTooltip')}
                className="flex items-center gap-1.5 rounded-full bg-[var(--gd-primary)] hover:opacity-90 text-white px-3 py-1 text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
              >
                <IconRefresh className="h-3.5 w-3.5 shrink-0 text-white" />
                <span className="hidden md:inline">{t('rescanVaultButton')}</span>
              </button>
            )}
          </>
        )}
        <div className="mx-0.5 h-4 w-[1px] bg-[var(--gd-border)]" />
        <button
          type="button"
          title={t('viewList')}
          onClick={() => vault.viewMode !== 'list' && vault.toggleViewMode()}
          className={`rounded-full p-1.5 transition-colors ${
            vault.viewMode === 'list'
              ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)]'
              : 'text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)]'
          }`}
        >
          <IconListView className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('viewGrid')}
          onClick={() => vault.viewMode !== 'grid' && vault.toggleViewMode()}
          className={`rounded-full p-1.5 transition-colors ${
            vault.viewMode === 'grid'
              ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)]'
              : 'text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)]'
          }`}
        >
          <IconGridView className="h-4 w-4" />
        </button>
      </div>
    );
  } else if (isSharedSection) {
    topBarRightContent = (
      <div className="flex items-center gap-1.5">
        {sharedVaults.activeVaultId && (
          <>
            <BrowseScopeDropdown scope={sharedVaults.browseScope} onSelectScope={sharedVaults.setBrowseScope} />
            <TagSelectDropdown tagFilter={tagFilter} />
          </>
        )}
        {vaultRescanBusy ? (
          <div className="flex items-center gap-1.5 rounded-full bg-[var(--gd-primary)] text-white pl-2.5 pr-1 py-0.5 text-xs font-semibold shadow-xs">
            <IconRefresh className="h-3.5 w-3.5 shrink-0 animate-spin text-white" />
            <span className="text-white">
              {rescanProgress > 0 ? t('rescanVaultProgress', { n: rescanProgress }) : t('rescanVaultBusy')}
            </span>
            <button
              type="button"
              onClick={handleCancelRescan}
              title={t('rescanVaultCancel')}
              className="flex items-center justify-center rounded-full p-1 text-white/80 hover:bg-white/20 hover:text-white transition-colors cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleRescanVault}
            title={t('rescanVaultTooltip')}
            className="flex items-center gap-1.5 rounded-full bg-[var(--gd-primary)] hover:opacity-90 text-white px-3 py-1 text-xs font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
          >
            <IconRefresh className="h-3.5 w-3.5 shrink-0 text-white" />
            <span className="hidden md:inline">{t('rescanVaultButton')}</span>
          </button>
        )}
        <div className="mx-0.5 h-4 w-[1px] bg-[var(--gd-border)]" />
        <button
          type="button"
          title={t('viewList')}
          onClick={() => vault.viewMode !== 'list' && vault.toggleViewMode()}
          className={`rounded-full p-1.5 transition-colors ${
            vault.viewMode === 'list'
              ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)]'
              : 'text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)]'
          }`}
        >
          <IconListView className="h-4 w-4" />
        </button>
        <button
          type="button"
          title={t('viewGrid')}
          onClick={() => vault.viewMode !== 'grid' && vault.toggleViewMode()}
          className={`rounded-full p-1.5 transition-colors ${
            vault.viewMode === 'grid'
              ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)]'
              : 'text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)]'
          }`}
        >
          <IconGridView className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const isSelectionActive = (isVaultSection || isSharedSection) && selection.selectionCount > 0;
  const topBarSelectionBar = isSelectionActive ? (
    <DriveSelectionBar
      count={selection.selectionCount}
      isTrash={navigation.isTrash}
      canDownload={selection.canDownloadSelection}
      onClear={selection.clearSelection}
      onDownload={() => {
        if (isSharedSection) {
          for (const messageId of selection.selectedIds) {
            void window.televault?.sharedVault?.download(sharedVaults.activeVaultId, messageId);
          }
          for (const folderPath of selection.selectedFolders) {
            const folderName = folderPath.slice(sharedVaults.currentFolder.length, -1);
            if (folderName) void window.televault?.sharedVault?.downloadFolder(sharedVaults.activeVaultId, folderPath);
          }
          selection.clearSelection();
        } else {
          void actions.handleDownloadSelected();
        }
      }}
      onMove={isSharedSection || actions.delete_forever_busy || actions.trashBusy ? undefined : () => void actions.handleMoveSelected()}
      onTrash={isSharedSection || actions.delete_forever_busy || actions.trashBusy ? undefined : () => void actions.handleTrashSelected()}
      onRestore={isSharedSection || actions.delete_forever_busy || actions.trashBusy ? undefined : () => void actions.handleRestoreSelected()}
      onDeleteForever={isSharedSection || actions.delete_forever_busy || actions.trashBusy ? undefined : () => void actions.handleDeleteForeverSelected()}
      readonly={isSharedSection}
      deleteForeverBusy={actions.delete_forever_busy}
      deleteProgress={actions.deleteProgress}
      trashBusy={actions.trashBusy}
      trashProgress={actions.trashProgress}
    />
  ) : null;

  return (
    <div className="flex h-full max-h-screen flex-col overflow-hidden bg-[var(--gd-bg)]">
      <div
        className="flex min-h-0 flex-1"
        onDragOver={(e) => {
          if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('application/x-televault-move')) {
            return;
          }
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (e.dataTransfer?.types && Array.from(e.dataTransfer.types).includes('application/x-televault-move')) {
            return;
          }
          e.preventDefault();
          setDragOver(false);
          if (navigation.section !== 'vault' || navigation.isSearching || navigation.isTrash) return;
          const paths = [...e.dataTransfer.files].map((f) => f.path).filter(Boolean);
          void actions.uploadPaths(paths);
        }}
      >
        <DriveSidebar
          section={navigation.section}
          currentFolder={vault.currentFolder}
          trashFolder={vault.stats?.trashFolder}
          onNavigate={(folder) => {
            navigation.setSection('vault');
            navigation.setVaultView?.('files');
            navigation.setSearchQuery('');
            selection.clearSelection();
            vault.goTo(folder);
          }}
          onSectionChange={(next) => {
            navigation.setSection(next);
            navigation.setSearchQuery('');
            if (next === 'shared-vault' || navigation.section === 'shared-vault') {
              selection.clearSelection();
            }
          }}
          onNewFolder={actions.handleCreateFolder}
          onUploadFiles={actions.handleUploadFiles}
          onUploadFolder={actions.handleUploadFolder}
          sharedVaults={sharedVaults.vaults}
          activeSharedVaultId={sharedVaults.activeVaultId}
          onDiscoverSharedVaults={sharedVaults.discover}
          onSharedVaultSelect={(chatId) => {
            navigation.setSection('shared-vault');
            navigation.setSearchQuery('');
            selection.clearSelection();
            sharedVaults.openVault(chatId);
          }}
          accounts={accounts}
          activeAccountId={activeAccountId}
          onSwitchAccount={onSwitchAccount}
          onAddAccount={onAddAccount}
          onSignOut={onSignOut}
          floodWaitSec={floodWaitSec}
          syncStatus={navigation.syncStatus}
          onNavigateSection={(sec) => {
            navigation.setSection(sec);
            navigation.setSearchQuery('');
          }}
        />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <DriveTopBar
            searchQuery={navigation.searchQuery}
            onSearchChange={navigation.setSearchQuery}
            showSearch={navigation.showSearch}
            helpAction={() => actions.setShowHelpDialog(true)}
            leftContent={topBarLeftContent}
            rightContent={topBarRightContent}
            selectionBar={topBarSelectionBar}
            floodWaitSec={floodWaitSec}
            updateBadge={
              updateInfo?.hasUpdate && !updateDismissed ? (
                <UpdateBadge
                  updateInfo={updateInfo}
                  onOpenModal={() => setShowUpdateModal(true)}
                  onDismiss={() => setUpdateDismissed(true)}
                />
              ) : null
            }
          />

          {floodWaitSec > 0 && (
            <div className="flex items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-xs text-amber-800 dark:text-amber-300">
              <div className="flex items-center gap-2 min-w-0">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
                </span>
                <span className="truncate">
                  <strong className="font-semibold">{t('telegramRateLimit')}:</strong>{' '}
                  {t('telegramFloodWaitBanner', { n: formatWaitTime(floodWaitSec, locale !== 'en') })}
                </span>
              </div>
            </div>
          )}

          <div className="relative flex min-h-0 flex-1 flex-col bg-[var(--gd-surface)]">
            {dragOver && navigation.section === 'vault' && !navigation.isSearching && !navigation.isTrash && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-[var(--gd-primary)] bg-[var(--gd-primary-light)]/60 text-[var(--gd-primary)]">
                {t('uploadFile')}
              </div>
            )}
            <main className="flex min-h-0 flex-1 flex-col">
              <VaultContentArea
                section={navigation.section}
                navigation={navigation}
                vault={vault}
                sharedVaults={sharedVaults}
                selection={selection}
                actions={actions}
                tagFilter={tagFilter}
                folderSummary={folderSummary}
                activeAccount={activeAccount}
                onSignOut={onSignOut}
                onOpenUpdateModal={(info) => {
                  setUpdateInfo(info);
                  setShowUpdateModal(true);
                }}
                t={t}
                showToast={showToast}
              />
            </main>
          </div>
        </div>
      </div>

      <StatusBar floodWaitSec={floodWaitSec} />

      {actions.folderProgress && (
        <div
          className={`fixed ${hasUploadTasks ? 'bottom-24 md:bottom-[92px]' : 'bottom-6'} right-6 md:right-8 z-40 w-[320px] md:w-[380px] bg-white dark:bg-zinc-900 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-gray-200 dark:border-zinc-800 overflow-hidden flex flex-col transition-all duration-300`}
        >
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80 dark:bg-zinc-800/50 backdrop-blur-sm border-b border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-gray-100 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0 w-7 h-7 rounded-lg bg-blue-500/10 text-[var(--gd-primary)] flex items-center justify-center">
                <IconDownload className="h-4 w-4" />
              </div>
              <span className="truncate text-sm font-semibold tracking-wide">
                {t('saveFolderProgressTitle')}
              </span>
              {actions.folderProgress.total > 0 && (
                <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200/70 dark:bg-zinc-700/60 text-gray-700 dark:text-gray-300">
                  {actions.folderProgress.current}/{actions.folderProgress.total}
                </span>
              )}
            </div>
            {actions.folderProgress.total > 0 && (
              <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400 shrink-0">
                {Math.min(100, Math.round((actions.folderProgress.current / actions.folderProgress.total) * 100))}%
              </span>
            )}
          </div>
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="truncate text-[13px] font-medium text-gray-700 dark:text-gray-300" title={actions.folderProgress.name || '…'}>
              {actions.folderProgress.name || '…'}
            </div>
            {actions.folderProgress.total > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[var(--gd-primary)] transition-all duration-300"
                  style={{
                    width: `${Math.min(100, (actions.folderProgress.current / actions.folderProgress.total) * 100)}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {actions.moveProgress && (
        <div
          className={`fixed ${actions.folderProgress ? (hasUploadTasks ? 'bottom-52' : 'bottom-36') : hasUploadTasks ? 'bottom-24 md:bottom-[92px]' : 'bottom-6'} right-6 md:right-8 z-40 w-[320px] md:w-[380px] bg-white dark:bg-zinc-900 rounded-2xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.6)] border border-gray-200 dark:border-zinc-800 overflow-hidden flex flex-col transition-all duration-300`}
        >
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50/80 dark:bg-zinc-800/50 backdrop-blur-sm border-b border-gray-200 dark:border-zinc-800 text-gray-900 dark:text-gray-100 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0 w-7 h-7 rounded-lg bg-blue-500/10 text-[var(--gd-primary)] flex items-center justify-center">
                <IconMoveTo className="h-4 w-4" />
              </div>
              <span className="truncate text-sm font-semibold tracking-wide">
                {actions.moveProgress.phase === 'resuming'
                  ? t('journalResumeProgressTitle')
                  : t('moveFolderProgressTitle')}
              </span>
              {actions.moveProgress.total > 0 && (
                <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-200/70 dark:bg-zinc-700/60 text-gray-700 dark:text-gray-300">
                  {actions.moveProgress.current}/{actions.moveProgress.total}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {actions.moveProgress.total > 0 && (
                <span className="text-xs font-semibold text-gray-500 dark:text-zinc-400">
                  {Math.min(100, Math.round((actions.moveProgress.current / actions.moveProgress.total) * 100))}%
                </span>
              )}
              <button
                type="button"
                disabled={actions.moveCancelling}
                className="text-xs font-medium text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 px-2 py-1 rounded-md transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={actions.handleCancelMove}
              >
                {actions.moveCancelling ? t('moveCancelling') : t('cancel')}
              </button>
            </div>
          </div>
          <div className="px-4 py-3 flex flex-col gap-2">
            <div className="truncate text-[13px] font-medium text-gray-700 dark:text-gray-300" title={actions.moveProgress.name || '…'}>
              {actions.moveProgress.name || '…'}
            </div>
            {actions.moveProgress.total > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-[var(--gd-primary)] transition-all duration-300"
                  style={{
                    width: `${Math.min(100, Math.round((actions.moveProgress.current / actions.moveProgress.total) * 100))}%`,
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      <UploadActivityPanel
        tasks={transfers.tasks}
        onClearFinished={() => void transfers.clearFinished()}
        onCancel={(id) => void transfers.cancel(id)}
        onRetry={(id) => void transfers.retry(id)}
        onResume={(id) => void transfers.resume(id)}
      />

      {actions.moveDialog && (
        <MoveToDialog
          title={actions.moveDialog.title}
          currentFolder={actions.moveDialog.currentFolder}
          currentLocationLabel={actions.moveDialog.currentLocationLabel}
          sourceFolders={actions.moveDialog.sourceFolders}
          folders={vault.allFolders}
          onCancel={() => actions.setMoveDialog(null)}
          onConfirm={async (destination) => {
            const moveFn = actions.moveDialog.onConfirm;
            recordRecentMoveFolder(destination);
            actions.setMoveDialog(null);
            await moveFn(destination);
          }}
        />
      )}

      {actions.tagEditor && (
        <FolderTagEditorDialog
          folderName={actions.tagEditor.folderName}
          initialTags={actions.tagEditor.initialTags}
          knownTags={actions.tagEditor.knownTags}
          onCancel={() => actions.setTagEditor(null)}
          onSave={(tags) => actions.handleSaveFolderTags(actions.tagEditor.folderPath, tags)}
        />
      )}

      {actions.previewFile && (
        <PreviewScreen
          file={actions.previewFile}
          onClose={() => actions.setPreviewFile(null)}
        />
      )}

      {actions.showHelpDialog && (
        <HelpDialog
          section={navigation.vaultView === 'duplicates' ? 'duplicates' : navigation.section}
          onClose={() => actions.setShowHelpDialog(false)}
        />
      )}

      <AppUpdateModal
        isOpen={showUpdateModal}
        onClose={() => setShowUpdateModal(false)}
        updateInfo={updateInfo}
        onSkipVersion={(ver) => {
          localStorage.setItem('televault_skipped_update_version', ver);
          setUpdateInfo(null);
        }}
      />
    </div>
  );
}
