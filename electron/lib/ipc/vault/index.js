const {
  safeSend,
  safeBroadcast,
  broadcastVaultChanged,
  broadcastTransfersChanged,
  broadcastSharedVaultsChanged,
  broadcastMoveProgress,
  broadcastTrashProgress,
  broadcastDeleteProgress,
} = require('./vaultShared');
const { registerBrowseHandlers } = require('./browseHandlers');
const { registerFileOpHandlers } = require('./fileOpHandlers');
const { registerDuplicateHandlers } = require('./duplicateHandlers');
const { registerTransferHandlers } = require('./transferHandlers');
const { registerSharedVaultHandlers } = require('./sharedVaultHandlers');

/**
 * @param {import('electron').IpcMain} ipcMain
 * @param {{ getDb: () => unknown, getVault: () => unknown, getQueue: () => unknown, getChannel?: () => unknown, isReady: () => boolean, guardUpload?: (destPath: string) => Promise<boolean> }} ctx
 */
function registerVaultHandlers(ipcMain, ctx) {
  const guardUpload = ctx.guardUpload || (async () => true);

  function requireVault() {
    if (!ctx.isReady()) throw new Error('not_ready');
    const vault = ctx.getVault();
    if (!vault) throw new Error('vault_unavailable');
    return vault;
  }

  registerBrowseHandlers(ipcMain, ctx);
  registerFileOpHandlers(ipcMain, ctx, requireVault);
  registerDuplicateHandlers(ipcMain, ctx);
  registerTransferHandlers(ipcMain, ctx, requireVault, guardUpload);
}

module.exports = {
  registerVaultHandlers,
  registerSharedVaultHandlers,
  safeSend,
  safeBroadcast,
  broadcastVaultChanged,
  broadcastTransfersChanged,
  broadcastSharedVaultsChanged,
  broadcastMoveProgress,
  broadcastTrashProgress,
  broadcastDeleteProgress,
};

