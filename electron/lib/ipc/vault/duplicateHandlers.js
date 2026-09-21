const {
  scanDuplicateGroups,
  validateDuplicateResolve,
} = require('@televault/core');
const { serializeEntry } = require('./vaultShared');

function registerDuplicateHandlers(ipcMain, ctx) {
  ipcMain.handle('vault:checkDuplicate', (_evt, { sha256 }) => {
    if (!ctx.isReady()) return { ok: false, duplicate: null };
    const dup = ctx.getVault()?.checkDuplicate(sha256);
    return { ok: true, duplicate: dup ? serializeEntry(ctx.getDb(), dup) : null };
  });

  ipcMain.handle('vault:scanDuplicates', () => {
    try {
      if (!ctx.isReady()) return { ok: false, error: 'Vault not ready' };
      const index_db = ctx.getDb();
      const duplicate_groups = scanDuplicateGroups(index_db.getAll());
      const file_count = duplicate_groups.reduce((n, g) => n + g.members.length, 0);
      return {
        ok: true,
        groups: duplicate_groups.map((g) => ({
          ...g,
          members: g.members.map((m) => ({
            ...m,
            mtime: m.mtime instanceof Date ? m.mtime.toISOString() : m.mtime,
          })),
        })),
        summary: { groupCount: duplicate_groups.length, fileCount: file_count },
      };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });

  ipcMain.handle('vault:resolveDuplicateGroup', async (_evt, { keepMessageId, trashMessageIds = [] } = {}) => {
    try {
      if (!ctx.isReady()) return { ok: false, error: 'Vault not ready' };
      const index_db = ctx.getDb();
      const vault_service = ctx.getVault();
      if (!vault_service) return { ok: false, error: 'Vault not ready' };
      const duplicate_groups = scanDuplicateGroups(index_db.getAll());
      const resolve_validation = validateDuplicateResolve(
        duplicate_groups,
        keepMessageId,
        trashMessageIds,
      );
      if (!resolve_validation.ok) return resolve_validation;
      await vault_service.trashEntries(trashMessageIds);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e) };
    }
  });
}

module.exports = { registerDuplicateHandlers };
