const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { shouldSkipDownload } = require('../gdriveDiscovery');
const { GDriveSyncService } = require('../gdriveSyncService');
const { openIndexDb } = require('../../db/indexDb');

test('skip when md5 and vault sha match', () => {
  assert.equal(
    shouldSkipDownload({
      manifest: { md5: 'abc', sha256: 's1', size: 10 },
      driveMd5: 'abc',
      vaultEntry: { sha256: 's1', size: 10 },
    }),
    true,
  );
});

test('do not skip when Drive md5 is missing', () => {
  assert.equal(
    shouldSkipDownload({
      manifest: { md5: 'abc', sha256: 's1', size: 10 },
      driveMd5: null,
      vaultEntry: { sha256: 's1', size: 10 },
    }),
    false,
  );
});

test('do not skip when vault size differs', () => {
  assert.equal(
    shouldSkipDownload({
      manifest: { md5: 'abc', sha256: 's1', size: 10 },
      driveMd5: 'abc',
      vaultEntry: { sha256: 's1', size: 11 },
    }),
    false,
  );
});

test('skip without manifest when vault size matches Drive listing', () => {
  assert.equal(
    shouldSkipDownload({
      manifest: null,
      driveMd5: 'abc',
      vaultEntry: { sha256: 's1', size: 10 },
      driveSize: 10,
    }),
    true,
  );
});

test('do not skip without manifest when vault is missing', () => {
  assert.equal(
    shouldSkipDownload({
      manifest: null,
      driveMd5: 'abc',
      vaultEntry: null,
      driveSize: 10,
    }),
    false,
  );
});

test('_syncFile skips download and refreshes matching manifest', async () => {
  let download_called = false;
  let updated_manifest = null;
  let removed_error = null;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncProgress = 0;
  sync_service.onChange = () => {};
  sync_service.db = {
    gdriveManifestGet: () => ({
      driveFileId: 'file1',
      drivePath: 'old.txt',
      vaultPath: '/GDrive/file.txt',
      md5: 'abc',
      sha256: 's1',
      size: 10,
      driveModifiedTime: 'old-time',
    }),
    getAll: () => [{ path: '/GDrive/file.txt', sha256: 's1', size: 10 }],
    gdriveManifestUpsert: (manifest) => { updated_manifest = manifest; },
    gdriveSyncErrorRemove: (drive_file_id) => { removed_error = drive_file_id; },
    gdriveStateGet: () => '',
    gdriveSyncErrorAdd: () => {},
  };
  sync_service.vault = {
    db: {
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
    modifiedTime: 'new-time',
    md5Checksum: 'abc',
  });

  assert.equal(download_called, false);
  assert.deepEqual(updated_manifest, {
    driveFileId: 'file1',
    drivePath: 'file.txt',
    vaultPath: '/GDrive/file.txt',
    md5: 'abc',
    sha256: 's1',
    size: 10,
    driveModifiedTime: 'new-time',
  });
  assert.equal(removed_error, 'file1');
});

test('_syncFile skips download without manifest when vault size matches', async () => {
  let download_called = false;
  let updated_manifest = null;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncProgress = 0;
  sync_service.onChange = () => {};
  sync_service.db = {
    gdriveManifestGet: () => null,
    getAll: () => [],
    gdriveManifestUpsert: (manifest) => { updated_manifest = manifest; },
    gdriveSyncErrorRemove: () => {},
    gdriveStateGet: () => '',
    gdriveSyncErrorAdd: () => {},
  };
  sync_service.vault = {
    db: {
      getAll: () => [{ path: '/GDrive/file.txt', sha256: 'vault-sha', size: 10 }],
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
    modifiedTime: 't-new',
    md5Checksum: 'drive-md5',
  });

  assert.equal(download_called, false);
  assert.deepEqual(updated_manifest, {
    driveFileId: 'file1',
    drivePath: 'file.txt',
    vaultPath: '/GDrive/file.txt',
    md5: 'drive-md5',
    sha256: 'vault-sha',
    size: 10,
    driveModifiedTime: 't-new',
  });
});

test('manifest and queue preserve Drive md5', () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-md5-'));
  const temp_db = openIndexDb(path.join(temp_dir, 'index.db'));

  try {
    temp_db.gdriveManifestUpsert({
      driveFileId: 'file1',
      drivePath: 'file.txt',
      vaultPath: '/GDrive/file.txt',
      md5: 'abc',
      sha256: 's1',
      size: 10,
      driveModifiedTime: 'new-time',
    });
    temp_db.gdriveSyncQueueAdd({
      driveFileId: 'file2',
      fileName: 'queued.txt',
      drivePath: 'queued.txt',
      vaultPath: '/GDrive/queued.txt',
      size: 20,
      modifiedTime: 'queue-time',
      md5Checksum: 'def',
    });

    assert.equal(temp_db.gdriveManifestGet('file1').md5, 'abc');
    assert.equal(temp_db.gdriveSyncQueueClaimNext('worker1').md5Checksum, 'def');
  } finally {
    temp_db.close();
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});
