const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { GDriveSyncService } = require('../gdriveSyncService');
const { shouldEnqueueDriveFile } = require('../gdriveDiscovery');

test('shouldEnqueueDriveFile requeues when manifest exists but vault entry is missing', () => {
  assert.equal(
    shouldEnqueueDriveFile({
      manifest: { driveModifiedTime: 't1', vaultPath: '/GDrive/a.cbz' },
      driveModifiedTime: 't1',
      vaultEntry: null,
    }),
    true,
  );
});

test('shouldEnqueueDriveFile skips when manifest matches and vault entry exists', () => {
  assert.equal(
    shouldEnqueueDriveFile({
      manifest: { driveModifiedTime: 't1', vaultPath: '/GDrive/a.cbz' },
      driveModifiedTime: 't1',
      vaultEntry: { path: '/GDrive/a.cbz', sha256: 's1', size: 10 },
    }),
    false,
  );
});

test('shouldEnqueueDriveFile skips without manifest when vault size matches Drive', () => {
  assert.equal(
    shouldEnqueueDriveFile({
      manifest: null,
      driveModifiedTime: 't1',
      vaultEntry: { path: '/GDrive/a.cbz', sha256: 's1', size: 10 },
      driveSize: 10,
    }),
    false,
  );
});

test('shouldEnqueueDriveFile enqueues without manifest when vault is missing', () => {
  assert.equal(
    shouldEnqueueDriveFile({
      manifest: null,
      driveModifiedTime: 't1',
      vaultEntry: null,
      driveSize: 10,
    }),
    true,
  );
});

test('shouldEnqueueDriveFile enqueues without manifest when vault size differs', () => {
  assert.equal(
    shouldEnqueueDriveFile({
      manifest: null,
      driveModifiedTime: 't1',
      vaultEntry: { path: '/GDrive/a.cbz', sha256: 's1', size: 10 },
      driveSize: 99,
    }),
    true,
  );
});

test('shouldEnqueueDriveFile skips when any duplicate vault path matches Drive size', () => {
  // Real vaults can have two message rows at the same path (old + recompressed).
  // Matching ANY size must skip — .find() first entry alone is not enough.
  assert.equal(
    shouldEnqueueDriveFile({
      manifest: null,
      driveModifiedTime: 't1',
      vaultEntry: { path: '/GDrive/Boku Girl T01.cbz', sha256: 'old', size: 172419542 },
      vaultEntriesAtPath: [
        { path: '/GDrive/Boku Girl T01.cbz', sha256: 'old', size: 172419542 },
        { path: '/GDrive/Boku Girl T01.cbz', sha256: 'new', size: 105093743 },
      ],
      driveSize: 105093743,
    }),
    false,
  );
});

test('_syncFile keeps temp file when Telegram upload hits rate limit', async () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-keep-temp-'));
  const temp_path = path.join(temp_dir, 'a.cbz');
  fs.writeFileSync(temp_path, 'payload');
  let download_calls = 0;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncProgress = 0;
  sync_service.onChange = () => {};
  sync_service._notifyProgress = () => {};
  sync_service._noteHashProgress = () => {};
  sync_service._noteUploadProgress = () => {};
  sync_service._sha256OfAsync = async () => 'sha-upload';
  sync_service.api = {
    downloadFile: async () => {
      download_calls += 1;
      return temp_path;
    },
  };
  sync_service.db = {
    gdriveManifestGet: () => null,
    getAll: () => [],
    gdriveStateGet: () => '',
    gdriveManifestUpsert: () => {},
    gdriveSyncErrorAdd: () => {},
    gdriveSyncErrorRemove: () => {},
  };
  sync_service.vault = {
    enqueueUpload: async () => ({
      skipped: false,
      task: {
        id: 'upload-1',
        status: 'failed',
        error: Object.assign(new Error('Too Many Requests: retry after 16'), { code: 429 }),
        onProgress: () => () => {},
      },
      done: Promise.resolve(),
    }),
    queue: { cancel: () => {} },
  };

  try {
    await assert.rejects(
      () => sync_service._syncFile({
        driveFileId: 'file1',
        fileName: 'a.cbz',
        drivePath: 'a.cbz',
        vaultPath: '/GDrive/a.cbz',
        size: 7,
        modifiedTime: '2026-07-20T00:00:00Z',
        md5Checksum: 'md5',
      }),
      /Too Many Requests/,
    );
    assert.equal(fs.existsSync(temp_path), true, 'temp must remain for retry without Drive re-download');
    assert.equal(download_calls, 1);

    // Retry: downloadFile may be called, but real API would short-circuit on existing complete file.
    // Here we prove a second sync still sees the local temp (not deleted by first failure).
    sync_service.vault.enqueueUpload = async () => ({
      skipped: false,
      task: {
        id: 'upload-2',
        status: 'done',
        onProgress: () => () => {},
      },
      done: Promise.resolve(),
    });
    await sync_service._syncFile({
      driveFileId: 'file1',
      fileName: 'a.cbz',
      drivePath: 'a.cbz',
      vaultPath: '/GDrive/a.cbz',
      size: 7,
      modifiedTime: '2026-07-20T00:00:00Z',
      md5Checksum: 'md5',
    });
    assert.equal(fs.existsSync(temp_path), false, 'temp cleaned after successful upload');
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('_syncFile does not upsert manifest when upload done resolves as failed (legacy queue)', async () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-upload-fail-'));
  const temp_path = path.join(temp_dir, 'a.cbz');
  fs.writeFileSync(temp_path, 'payload');
  const updated_manifests = [];
  const recorded_errors = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncProgress = 0;
  sync_service.onChange = () => {};
  sync_service._notifyProgress = () => {};
  sync_service._sha256OfAsync = async () => 'sha-upload';
  sync_service.api = {
    downloadFile: async () => temp_path,
  };
  sync_service.db = {
    gdriveManifestGet: () => null,
    getAll: () => [],
    gdriveStateGet: () => '',
    gdriveManifestUpsert: (manifest) => updated_manifests.push(manifest),
    gdriveSyncErrorAdd: (sync_error) => recorded_errors.push(sync_error),
    gdriveSyncErrorRemove: () => {},
  };
  sync_service.vault = {
    enqueueUpload: async () => ({
      skipped: false,
      task: {
        id: 'upload-1',
        status: 'failed',
        error: Object.assign(new Error('Too Many Requests: retry after 16'), { code: 429 }),
        onProgress: () => () => {},
      },
      // Legacy TransferQueue always resolved — must still refuse to mark success.
      done: Promise.resolve(),
    }),
    queue: { cancel: () => {} },
  };

  try {
    await assert.rejects(
      () => sync_service._syncFile({
        driveFileId: 'file1',
        fileName: 'a.cbz',
        drivePath: 'a.cbz',
        vaultPath: '/GDrive/a.cbz',
        size: 7,
        modifiedTime: '2026-07-20T00:00:00Z',
        md5Checksum: 'md5',
      }),
      /Too Many Requests/,
    );
    assert.equal(updated_manifests.length, 0);
    assert.equal(recorded_errors.length, 1);
    assert.match(recorded_errors[0].errorMessage, /Too Many Requests/);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});
test('_requeueOrphanManifests deletes false success rows and enqueues them', () => {
  const queued = [];
  const deleted = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.db = {
    gdriveManifestAll: () => ([
      {
        driveFileId: 'orphan1',
        drivePath: 'folder/a.cbz',
        vaultPath: '/GDrive/folder/a.cbz',
        md5: 'abc',
        sha256: 'sha',
        size: 10,
        driveModifiedTime: 't1',
      },
      {
        driveFileId: 'ok1',
        drivePath: 'folder/b.cbz',
        vaultPath: '/GDrive/folder/b.cbz',
        md5: 'def',
        sha256: 'sha2',
        size: 20,
        driveModifiedTime: 't2',
      },
    ]),
    getAll: () => ([{ path: '/GDrive/folder/b.cbz', sha256: 'sha2', size: 20 }]),
    gdriveSyncQueueAdd: (item) => queued.push(item),
    gdriveManifestDelete: (id) => deleted.push(id),
    gdriveSyncQueueGetAll: () => [],
  };
  sync_service.vault = {
    db: { getAll: () => ([{ path: '/GDrive/folder/b.cbz', sha256: 'sha2', size: 20 }]) },
  };

  const count = sync_service._requeueOrphanManifests();
  assert.equal(count, 1);
  assert.deepEqual(deleted, ['orphan1']);
  assert.equal(queued.length, 1);
  assert.equal(queued[0].driveFileId, 'orphan1');
  assert.equal(queued[0].vaultPath, '/GDrive/folder/a.cbz');
});
