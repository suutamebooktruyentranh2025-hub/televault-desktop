const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GDriveSyncService } = require('../gdriveSyncService');

test('_syncFile md5-skip uses vault.db entries, not account db', async () => {
  let download_called = false;
  let updated_manifest = null;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncProgress = 0;
  sync_service.onChange = () => {};
  sync_service.db = {
    // Account DB has no vault files (simulates GDrive tables on account B).
    getAll: () => [],
    gdriveManifestGet: () => ({
      driveFileId: 'file1',
      drivePath: 'file.txt',
      vaultPath: '/GDrive/file.txt',
      md5: 'abc',
      sha256: 's1',
      size: 10,
      driveModifiedTime: 'old',
    }),
    gdriveManifestUpsert: (manifest) => { updated_manifest = manifest; },
    gdriveSyncErrorRemove: () => {},
    gdriveSyncErrorAdd: () => {},
  };
  sync_service.vault = {
    db: {
      // Target vault A index has the file.
      getAll: () => [{ path: '/GDrive/file.txt', sha256: 's1', size: 10 }],
    },
  };
  sync_service.api = {
    downloadFile: async () => {
      download_called = true;
      throw new Error('download must not be called');
    },
  };

  await sync_service._syncFile({
    driveFileId: 'file1',
    fileName: 'file.txt',
    drivePath: 'file.txt',
    vaultPath: '/GDrive/file.txt',
    size: 10,
    modifiedTime: 'new',
    md5Checksum: 'abc',
  });

  assert.equal(download_called, false);
  assert.equal(updated_manifest.md5, 'abc');
});

test('setSyncTargetChatId persists and resolves vault via inject', async () => {
  const resolved = [];
  const personal = { chatId: 1, db: { getAll: () => [] }, label: 'personal' };
  const shared = { chatId: 99, db: { getAll: () => [] }, label: 'shared' };
  const state = new Map();
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.db = {
    gdriveStateGet: (key, fallback) => (state.has(key) ? state.get(key) : fallback),
    gdriveStateSet: (key, value) => { state.set(key, value); },
  };
  sync_service.vault = personal;
  sync_service.onChange = () => {};
  sync_service.isPaused = true;
  sync_service._queueWorkerRunning = false;
  sync_service.resolveVault = async (chatId) => {
    resolved.push(chatId);
    return chatId == null || chatId === '' ? personal : shared;
  };
  sync_service.getPersonalVault = () => personal;

  await sync_service.setSyncTargetChatId('99');
  assert.equal(state.get('sync_target_chat_id'), '99');
  assert.equal(sync_service.vault, shared);
  assert.deepEqual(resolved, ['99']);

  await sync_service.setSyncTargetChatId(null);
  assert.equal(state.get('sync_target_chat_id'), '');
  assert.equal(sync_service.vault, personal);
});

test('startPolling awaits saved sync target before requeueing orphans', async () => {
  const deleted = [];
  const queued = [];
  const personal = { db: { getAll: () => [] } };
  // Shared vault index has the manifest's file, so it is NOT an orphan.
  const shared = { db: { getAll: () => [{ path: '/GDrive/a.cbz', sha256: 's', size: 1 }] } };

  let resolveShared;
  const sharedReady = new Promise((resolve) => { resolveShared = resolve; });

  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.vault = personal;
  sync_service.isPaused = false;
  sync_service._pollTimer = null;
  sync_service._pollIntervalMs = 5 * 60 * 1000;
  sync_service.onChange = () => {};
  sync_service.auth = { isConnected: () => true };
  sync_service._runPollSync = async () => {};
  sync_service._startQueueWorker = () => {};
  sync_service.getPersonalVault = () => personal;
  sync_service.db = {
    gdriveStateGet: (_key, fallback) => '99',
    gdriveStateSet: () => {},
    gdriveManifestAll: () => ([{
      driveFileId: 'orphan1',
      drivePath: 'a.cbz',
      vaultPath: '/GDrive/a.cbz',
      md5: 'm',
      sha256: 's',
      size: 1,
      driveModifiedTime: 't',
    }]),
    gdriveManifestDelete: (id) => deleted.push(id),
    gdriveSyncQueueAdd: (item) => queued.push(item),
    gdriveSyncQueueGetAll: () => [],
    gdriveSyncQueueCount: () => queued.length,
  };
  // resolveVault does not resolve until we release it, simulating a slow rebind.
  sync_service.resolveVault = async () => { await sharedReady; return shared; };
  sync_service._syncTargetReady = sync_service._applySavedSyncTarget();

  const pollingDone = sync_service.startPolling();
  // Before the shared vault rebinds, orphan requeue must NOT have run.
  assert.deepEqual(deleted, []);

  resolveShared();
  await pollingDone;
  sync_service.stopPolling();

  // Shared vault has the file, so the manifest is preserved (not an orphan).
  assert.deepEqual(deleted, []);
  assert.deepEqual(queued, []);
  assert.equal(sync_service.vault, shared);
});

test('_applySavedSyncTarget failure keeps persisted sync_target_chat_id', async () => {
  const state = new Map([['sync_target_chat_id', '99']]);
  const personal = { db: { getAll: () => [] }, label: 'personal' };
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.vault = personal;
  sync_service.onChange = () => {};
  sync_service.db = {
    gdriveStateGet: (key, fallback) => (state.has(key) ? state.get(key) : fallback),
    gdriveStateSet: (key, value) => { state.set(key, value); },
  };
  sync_service.getPersonalVault = () => personal;
  sync_service.resolveVault = async () => { throw new Error('shared vault offline'); };

  await sync_service._applySavedSyncTarget();

  // Transient rebind failure must NOT wipe the saved target.
  assert.equal(state.get('sync_target_chat_id'), '99');
  assert.equal(sync_service.vault, personal);
  assert.match(String(sync_service.lastError), /shared vault offline/);
});

test('_requeueOrphanManifests checks target vault.db', () => {
  const queued = [];
  const deleted = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.db = {
    gdriveManifestAll: () => ([{
      driveFileId: 'orphan1',
      drivePath: 'a.cbz',
      vaultPath: '/GDrive/a.cbz',
      md5: 'm',
      sha256: 's',
      size: 1,
      driveModifiedTime: 't',
    }]),
    // Account DB wrongly has a file — must be ignored.
    getAll: () => [{ path: '/GDrive/a.cbz', sha256: 's', size: 1 }],
    gdriveSyncQueueAdd: (item) => queued.push(item),
    gdriveManifestDelete: (id) => deleted.push(id),
    gdriveSyncQueueGetAll: () => [],
  };
  sync_service.vault = {
    db: { getAll: () => [] },
  };

  const count = sync_service._requeueOrphanManifests();
  assert.equal(count, 1);
  assert.deepEqual(deleted, ['orphan1']);
  assert.equal(queued[0].driveFileId, 'orphan1');
});
