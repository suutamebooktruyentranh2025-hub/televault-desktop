const test = require('node:test');
const assert = require('node:assert/strict');
const { GDriveSyncService } = require('../gdriveSyncService');

test('rescanSyncTargetVault force-scans active vault channel and reports fileCount', async () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.onChange = () => {};
  sync_service.scanPhase = null;
  sync_service.scanInfo = null;
  let force_full = null;
  let progress_ticks = 0;
  sync_service.vault = {
    chatId: -1004310533766,
    channel: {
      scanHistory: async (_chatId, onProgress, opts) => {
        force_full = opts?.forceFull === true;
        onProgress?.(10);
        onProgress?.(25);
        return 25;
      },
    },
    db: {
      getAll: () => ([
        { path: '/GDrive/a.cbz', size: 1 },
        { path: '/GDrive/b.cbz', size: 2 },
        { path: '/Rác/GDrive/x.cbz', size: 3 },
        { path: '/GDrive/folder/', size: 0 },
      ]),
    },
  };
  sync_service._vaultEntries = function _vaultEntries() {
    return this.vault.db.getAll();
  };

  const result = await sync_service.rescanSyncTargetVault((n) => {
    progress_ticks += 1;
    assert.equal(typeof n, 'number');
  });

  assert.equal(force_full, true);
  assert.equal(result.scanned, 25);
  assert.equal(result.fileCount, 2);
  assert.equal(result.chatId, -1004310533766);
  assert.equal(sync_service.scanPhase, null);
  assert.ok(progress_ticks >= 1);
});

test('rescanSyncTargetVault rejects when vault channel missing', async () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.onChange = () => {};
  sync_service.vault = { chatId: 1 };
  await assert.rejects(
    () => sync_service.rescanSyncTargetVault(),
    /vault_unavailable/,
  );
});
