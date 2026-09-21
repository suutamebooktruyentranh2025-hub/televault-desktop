import { useState, useEffect } from 'react';
import { appLog } from '../../utils/logger';
import { shouldOpenFilePreview } from '../../utils/filePreview';
import { folderLabelFromPath, parentFolderOfPath } from './useVaultNavigation';

const vaultApi = window.televault?.vault;

export function useVaultActions({
  t,
  confirm,
  prompt,
  showToast,
  vault,
  selectedIds,
  selectedFolders,
  clearSelection,
}) {
  const [previewFile, setPreviewFile] = useState(null);
  const [moveDialog, setMoveDialog] = useState(null);
  const [tagEditor, setTagEditor] = useState(null);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [folderProgress, setFolderProgress] = useState(null);
  const [moveProgress, setMoveProgress] = useState(null);
  const [moveCancelling, setMoveCancelling] = useState(false);
  const [delete_forever_busy, set_delete_forever_busy] = useState(false);
  const [delete_forever_target_keys, set_delete_forever_target_keys] = useState([]);

  useEffect(() => {
    const unsub = vaultApi?.onMoveProgress?.((payload) => {
      if (payload?.active) {
        setMoveProgress(payload);
      } else {
        setMoveProgress(null);
        setMoveCancelling(false);
        if (payload?.cancelled) {
          showToast(
            payload?.phase === 'resuming'
              ? t('journalResumeCancelled')
              : t('moveFolderCancelled', { current: payload.current || 0, total: payload.total || 0 })
          );
        } else if (payload?.completed && payload.total > 1) {
          showToast(
            payload?.phase === 'resuming'
              ? t('journalResumeDone', { total: payload.total })
              : t('moveFolderDone', { total: payload.total })
          );
        }
      }
    });
    return () => unsub?.();
  }, [t, showToast]);

  async function handleCancelMove() {
    setMoveCancelling(true);
    await vaultApi?.cancelMove?.();
  }

  async function uploadPaths(paths) {
    if (!paths?.length) return;
    appLog('info', t('uploadQueued', { n: paths.length }));
    const result = await vaultApi?.uploadPaths(paths, vault.currentFolder);
    if (result?.ok && result.skipped > 0) {
      showToast(t('uploadSkippedDuplicates', { n: result.skipped }));
    }
    if (result && !result.ok && result.error === 'free_trial_expired') {
      showToast(t('freeTrialExpiredTitle'), { variant: 'error' });
    }
  }

  async function handleUploadFiles() {
    const picked = await vaultApi?.pickUploadFiles();
    if (picked?.ok) await uploadPaths(picked.paths);
  }

  async function handleUploadFolder() {
    const picked = await vaultApi?.pickUploadFolder();
    if (picked?.ok) await uploadPaths(picked.paths);
  }

  async function handleCreateFolder() {
    const name = await prompt(t('folderName'));
    if (!name?.trim()) return;
    const result = await vaultApi?.createFolder(vault.currentFolder, name.trim());
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleTrashSelected() {
    const result = await vaultApi?.trash([...selectedIds], [...selectedFolders]);
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    clearSelection();
  }

  async function handleMoveSelected() {
    const sourceFolders = [...selectedFolders];
    const messageIds = [...selectedIds];
    const total = messageIds.length + sourceFolders.length;
    setMoveDialog({
      title: t('moveDialogItemsTitle', { n: total }),
      currentFolder: vault.currentFolder,
      currentLocationLabel: folderLabelFromPath(vault.currentFolder, t('myDrive')),
      sourceFolders,
      onConfirm: async (destination) => {
        clearSelection();
        const result = await vaultApi?.moveEntries?.(messageIds, sourceFolders, destination);
        if (result?.cancelled) return false;
        if (!result?.ok) {
          showToast(result?.error || t('errorGeneric'), { variant: 'error' });
          return false;
        }
        return true;
      },
    });
  }

  async function handleDownload(file) {
    const result = await vaultApi?.download(file.messageId);
    if (result?.cancelled) return;
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    showToast(t('downloadDone', { path: result.path }));
  }

  async function handleDownloadFolderByPath(folderPath) {
    setFolderProgress({ current: 0, total: 0, name: '' });
    const unsub = vaultApi?.onDownloadFolderProgress?.((payload) => {
      setFolderProgress(payload);
    });
    try {
      const result = await vaultApi?.downloadFolder(folderPath);
      if (result?.cancelled) return;
      if (!result?.ok) {
        showToast(result?.error || t('errorGeneric'), { variant: 'error' });
        return;
      }
      const msg =
        result.failed === 0
          ? t('saveFolderDone', { saved: result.saved, total: result.total, path: result.destRoot })
          : t('saveFolderPartial', {
              saved: result.saved,
              failed: result.failed,
              path: result.destRoot,
            });
      showToast(msg, { variant: result.failed === 0 ? 'default' : 'error' });
    } finally {
      unsub?.();
      setFolderProgress(null);
    }
  }

  async function handleDownloadFolder(folderName, explicitPath = null) {
    await handleDownloadFolderByPath(explicitPath || `${vault.currentFolder}${folderName}/`);
  }

  async function handleDownloadSelected() {
    for (const messageId of selectedIds) {
      const file = vault.files.find((f) => f.messageId === messageId);
      if (file) await handleDownload(file);
    }
    for (const folderPath of selectedFolders) {
      await handleDownloadFolderByPath(folderPath);
    }
  }

  async function handleRestoreSelected() {
    const result = await vaultApi?.restore([...selectedIds], [...selectedFolders]);
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    clearSelection();
  }

  async function run_delete_forever(message_ids, folder_paths) {
    if (delete_forever_busy) return false;
    const target_keys = [
      ...message_ids.map((message_id) => `file:${message_id}`),
      ...folder_paths.map((folder_path) => `folder:${folder_path}`),
    ];
    set_delete_forever_busy(true);
    set_delete_forever_target_keys(target_keys);
    try {
      const result = await vaultApi?.deletePermanent(message_ids, folder_paths);
      if (!result?.ok && (!result?.deletedCount || result.deletedCount === 0)) {
        showToast(result?.error || t('errorGeneric'), { variant: 'error' });
        return false;
      }
      if (result?.failedCount > 0) {
        showToast(
          `${t('deleted')} ${result.deletedCount}/${message_ids.length}. ${result.error || ''}`,
          { variant: 'warning' },
        );
      }
      return true;
    } catch (error_object) {
      showToast(String(error_object?.message || error_object || t('errorGeneric')), { variant: 'error' });
      return false;
    } finally {
      set_delete_forever_busy(false);
      set_delete_forever_target_keys([]);
    }
  }

  async function handleDeleteForeverSelected() {
    if (!(await confirm(t('deleteForever')))) return;
    const ok = await run_delete_forever([...selectedIds], [...selectedFolders]);
    if (ok) clearSelection();
  }

  async function handleOpenFile(file) {
    if (shouldOpenFilePreview(file.name)) setPreviewFile(file);
  }

  async function handleRenameFile(file) {
    const name = await prompt(t('newName'), file.name);
    if (!name?.trim()) return;
    const result = await vaultApi?.renameFile(file.messageId, name.trim());
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleRenameFolder(folderName, explicitPath = null) {
    const folderPath = explicitPath || `${vault.currentFolder}${folderName}/`;
    const name = await prompt(t('newName'), folderName);
    if (!name?.trim()) return;
    const result = await vaultApi?.renameFolder(folderPath, name.trim());
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleMoveFile(file) {
    const currentFolder = parentFolderOfPath(file.path);
    setMoveDialog({
      title: t('moveDialogItemTitle', { name: file.name }),
      currentFolder,
      currentLocationLabel: folderLabelFromPath(currentFolder, t('myDrive')),
      sourceFolders: [],
      onConfirm: async (destination) => {
        const result = await vaultApi?.moveFile(file.messageId, destination);
        if (result?.cancelled) return false;
        if (!result?.ok) {
          showToast(result?.error || t('errorGeneric'), { variant: 'error' });
          return false;
        }
        return true;
      },
    });
  }

  async function handleMoveFolder(folderName, explicitPath = null) {
    const folderPath = explicitPath || `${vault.currentFolder}${folderName}/`;
    const currentFolder = explicitPath ? parentFolderOfPath(explicitPath) : vault.currentFolder;
    setMoveDialog({
      title: t('moveDialogItemTitle', { name: folderName }),
      currentFolder,
      currentLocationLabel: folderLabelFromPath(currentFolder, t('myDrive')),
      sourceFolders: [folderPath],
      onConfirm: async (destination) => {
        const result = await vaultApi?.moveFolder(folderPath, destination);
        if (result?.cancelled) return false;
        if (!result?.ok) {
          showToast(result?.error || t('errorGeneric'), { variant: 'error' });
          return false;
        }
        return true;
      },
    });
  }

  async function handleMoveEntriesDirect(messageIds = [], folders = [], destination) {
    if (!messageIds.length && !folders.length) return false;
    try {
      const result = await vaultApi?.moveEntries?.(messageIds, folders, destination);
      if (result?.cancelled) return false;
      if (!result?.ok) {
        showToast(result?.error || t('errorGeneric'), { variant: 'error' });
        return false;
      }
      clearSelection();
      return true;
    } catch (e) {
      showToast(String(e?.message || e || t('errorGeneric')), { variant: 'error' });
      return false;
    }
  }

  async function handleSaveAs(file) {
    const result = await vaultApi?.saveAs(file.messageId);
    if (result?.cancelled) return;
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return;
    }
    showToast(t('downloadDone', { path: result.path }));
  }

  async function handleFolderTags(folderName, explicitPath = null) {
    const folderPath = explicitPath || `${vault.currentFolder}${folderName}/`;
    const [folderTagsResult, allTagsResult] = await Promise.all([
      vaultApi?.getFolderTags(folderPath),
      vaultApi?.allTags(),
    ]);
    setTagEditor({
      folderName,
      folderPath,
      initialTags: folderTagsResult?.ok ? folderTagsResult.tags : [],
      knownTags: allTagsResult?.ok ? allTagsResult.names || [] : [],
    });
  }

  async function handleSaveFolderTags(folderPath, tags) {
    const result = await vaultApi?.setFolderTags(folderPath, tags);
    if (!result?.ok) {
      showToast(result?.error || t('errorGeneric'), { variant: 'error' });
      return false;
    }
    return true;
  }

  async function handleTrashFile(file) {
    const result = await vaultApi?.trash([file.messageId], []);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleTrashFolder(name, explicitPath = null) {
    const folderPath = explicitPath || `${vault.currentFolder}${name}/`;
    const result = await vaultApi?.trash([], [folderPath]);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleRestoreFile(file) {
    const result = await vaultApi?.restore([file.messageId], []);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleRestoreFolder(name, explicitPath = null) {
    const folderPath = explicitPath || `${vault.currentFolder}${name}/`;
    const result = await vaultApi?.restore([], [folderPath]);
    if (!result?.ok) showToast(result?.error || t('errorGeneric'), { variant: 'error' });
  }

  async function handleDeleteForeverFile(file) {
    if (!(await confirm(t('deleteForever')))) return;
    await run_delete_forever([file.messageId], []);
  }

  async function handleDeleteForeverFolder(name, explicitPath = null) {
    if (!(await confirm(t('deleteForever')))) return;
    const folderPath = explicitPath || `${vault.currentFolder}${name}/`;
    await run_delete_forever([], [folderPath]);
  }

  return {
    previewFile,
    setPreviewFile,
    moveDialog,
    setMoveDialog,
    tagEditor,
    setTagEditor,
    showHelpDialog,
    setShowHelpDialog,
    folderProgress,
    moveProgress,
    moveCancelling,
    handleCancelMove,
    delete_forever_busy,
    delete_forever_target_keys,
    uploadPaths,
    handleUploadFiles,
    handleUploadFolder,
    handleCreateFolder,
    handleTrashSelected,
    handleMoveSelected,
    handleDownload,
    handleDownloadFolderByPath,
    handleDownloadFolder,
    handleDownloadSelected,
    handleRestoreSelected,
    handleDeleteForeverSelected,
    handleOpenFile,
    handleRenameFile,
    handleRenameFolder,
    handleMoveFile,
    handleMoveFolder,
    handleMoveEntriesDirect,
    handleSaveAs,
    handleFolderTags,
    handleSaveFolderTags,
    handleTrashFile,
    handleTrashFolder,
    handleRestoreFile,
    handleRestoreFolder,
    handleDeleteForeverFile,
    handleDeleteForeverFolder,
  };
}
