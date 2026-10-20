const {
  checkForUpdate,
  downloadUpdate,
  installUpdate,
} = require('../updater/githubUpdater');
const { safeBroadcast } = require('./vault/vaultShared');

/**
 * Đăng ký các IPC handlers cho tính năng tự động cập nhật từ GitHub Releases.
 * @param {import('electron').IpcMain} ipcMain
 */
function registerUpdateHandlers(ipcMain) {
  ipcMain.handle('update:getVersion', () => {
    return require('electron').app?.getVersion ? require('electron').app.getVersion() : require('../../../package.json').version;
  });

  ipcMain.handle('update:check', async (_evt, opts) => {
    try {
      const result = await checkForUpdate(opts);
      return { ok: true, update: result };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('update:download', async (_evt, { url, filename, destDir } = {}) => {
    try {
      const onProgress = (progress) => {
        safeBroadcast('update:download-progress', progress);
      };
      const result = await downloadUpdate({ url, filename, destDir, onProgress });
      return { ok: true, filePath: result.filePath };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('update:install', async (_evt, { filePath } = {}) => {
    try {
      const result = await installUpdate(filePath);
      return { ok: true, ...result };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
}

module.exports = { registerUpdateHandlers };
