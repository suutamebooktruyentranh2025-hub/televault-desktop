const { planFolderDelete } = require('@televault/core');
const { FolderMoveException } = require('../../vault/vaultService');
const { broadcastVaultChanged, broadcastTrashProgress, broadcastDeleteProgress, broadcastMoveProgress } = require('./vaultShared');

function registerFileOpHandlers(ipcMain, ctx, requireVault) {
  let activeMoveController = null;

  async function handleMoveEntries(messageIds, folders, destFolder) {
    try {
      const vault = requireVault();
      if (activeMoveController) {
        activeMoveController.abort();
      }
      activeMoveController = new AbortController();
      const { signal } = activeMoveController;

      const onProgress = (progress) => {
        broadcastMoveProgress({ ...progress, active: true });
      };

      const result = await vault.moveEntries(messageIds, folders, destFolder, onProgress, signal);
      broadcastVaultChanged();
      broadcastMoveProgress({
        active: false,
        completed: Boolean(result?.ok),
        cancelled: Boolean(result?.cancelled),
        current: result?.completed || 0,
        total: result?.total || 0,
      });
      return result;
    } catch (e) {
      broadcastMoveProgress({ active: false, error: String(e.message || e) });
      if (e instanceof FolderMoveException) return { ok: false, error: 'into_descendant' };
      return { ok: false, error: String(e.message || e) };
    } finally {
      activeMoveController = null;
    }
  }
  ipcMain.handle('vault:createFolder', async (_evt, { parentFolder, name }) => {
    try {
      const vault = requireVault();
      const folderName = String(name || '').trim().replace(/[/\\]/g, '');
      if (!folderName) return { ok: false, error: 'invalid_name' };
      const folderPath = `${parentFolder || '/'}${folderName}/`.replace('//', '/');
      await vault.createFolder(folderPath);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:renameFile', async (_evt, { messageId, newName }) => {
    try {
      const vault = requireVault();
      const db = ctx.getDb();
      const entry = db.getByMessageId(messageId);
      if (!entry) return { ok: false, error: 'not_found' };
      const parent = entry.path.slice(0, entry.path.lastIndexOf('/') + 1);
      const clean = String(newName || '').trim().replace(/[/\\]/g, '');
      await vault.renameFile(messageId, `${parent}${clean}`);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:renameFolder', async (_evt, { folderPath, newName }) => {
    try {
      const vault = requireVault();
      const clean = String(newName || '').trim().replace(/[/\\]/g, '');
      const parent = folderPath.slice(0, folderPath.lastIndexOf('/', folderPath.length - 2) + 1);
      await vault.renameFolder(folderPath, `${parent}${clean}/`);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:moveFile', async (_evt, { messageId, destFolder }) => {
    return await handleMoveEntries([messageId], [], destFolder);
  });

  ipcMain.handle('vault:moveFolder', async (_evt, { folderPath, destFolder }) => {
    return await handleMoveEntries([], [folderPath], destFolder);
  });

  ipcMain.handle('vault:moveEntries', async (_evt, { messageIds = [], folders = [], destination }) => {
    return await handleMoveEntries(messageIds, folders, destination);
  });

  ipcMain.handle('vault:cancelMove', () => {
    let cancelled = false;
    if (activeMoveController) {
      activeMoveController.abort();
      activeMoveController = null;
      cancelled = true;
    }
    try {
      const vault = requireVault();
      if (vault.cancelJournalResume({ prune: true })) {
        cancelled = true;
        ctx.onCancelJournal?.();
      }
    } catch {}
    if (cancelled) {
      broadcastMoveProgress({ active: false, cancelled: true });
      return { ok: true };
    }
    return { ok: false, error: 'no_active_move' };
  });

  ipcMain.handle('vault:trash', async (_evt, { messageIds = [], folders = [] }) => {
    try {
      const vault = requireVault();
      if (messageIds.length) {
        await vault.trashEntries(messageIds, (progress) => {
          broadcastTrashProgress(progress);
        });
      }
      for (const f of folders) await vault.trashFolder(f);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:restore', async (_evt, { messageIds = [], folders = [] }) => {
    try {
      const vault = requireVault();
      if (messageIds.length) await vault.restoreEntries(messageIds);
      for (const f of folders) await vault.restoreFolder(f);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:deletePermanent', async (_evt, { messageIds = [], folders = [] }) => {
    try {
      const vault = requireVault();
      let deleteResult = { ok: true, deletedCount: 0, failedCount: 0, deletedIds: [], failedIds: [], error: null };
      
      const allIds = new Set(messageIds);
      if (folders.length) {
        const allEntries = vault.db.getAll();
        for (const f of folders) {
          const folderSteps = planFolderDelete(allEntries, f);
          for (const s of folderSteps) {
            allIds.add(s.messageId);
          }
        }
      }

      const idList = Array.from(allIds);
      if (idList.length) {
        deleteResult = await vault.deleteEntries(idList, (progress) => {
          broadcastDeleteProgress(progress);
        });
      }
      broadcastVaultChanged();
      return deleteResult;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:emptyTrash', async () => {
    try {
      const vault = requireVault();
      const deleteResult = await vault.emptyTrash((progress) => {
        broadcastDeleteProgress(progress);
      });
      broadcastVaultChanged();
      return deleteResult;
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:setFolderTags', async (_evt, { folderPath, tags }) => {
    try {
      await requireVault().setFolderTags(folderPath, tags || []);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:renameTag', async (_evt, { from, to }) => {
    try {
      await requireVault().renameTag(from, to);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:deleteTag', async (_evt, { tag }) => {
    try {
      await requireVault().deleteTag(tag);
      broadcastVaultChanged();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
}

module.exports = { registerFileOpHandlers };
