const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { verifyDownloadedFile } = require('../downloadIntegrity');
const { GDriveSyncService } = require('../gdriveSyncService');

function createTempFile(content) {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-integrity-'));
  const temp_path = path.join(temp_dir, 'file.bin');
  fs.writeFileSync(temp_path, content);
  return { tempDir: temp_dir, tempPath: temp_path };
}

test('verifyDownloadedFile accepts matching size and md5', async () => {
  const content = Buffer.from('complete-file-bytes');
  const { tempDir: temp_dir, tempPath: temp_path } = createTempFile(content);
  const expected_md5 = crypto.createHash('md5').update(content).digest('hex');

  try {
    const actual_size = await verifyDownloadedFile({
      filePath: temp_path,
      expectedSize: content.length,
      expectedMd5: expected_md5,
    });
    assert.equal(actual_size, content.length);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('verifyDownloadedFile rejects incomplete size but keeps partial for resume', async () => {
  const { tempDir: temp_dir, tempPath: temp_path } = createTempFile(Buffer.alloc(50));

  try {
    await assert.rejects(
      () => verifyDownloadedFile({
        filePath: temp_path,
        expectedSize: 100,
        expectedMd5: null,
      }),
      /size mismatch/i,
    );
    assert.equal(fs.existsSync(temp_path), true);
    assert.equal(fs.statSync(temp_path).size, 50);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('verifyDownloadedFile rejects md5 mismatch and deletes corrupt file', async () => {
  const { tempDir: temp_dir, tempPath: temp_path } = createTempFile(Buffer.from('wrong-bytes'));

  try {
    await assert.rejects(
      () => verifyDownloadedFile({
        filePath: temp_path,
        expectedSize: 11,
        expectedMd5: '0123456789abcdef0123456789abcdef',
      }),
      /md5 mismatch/i,
    );
    assert.equal(fs.existsSync(temp_path), false);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('verifyDownloadedFile skips md5 when Drive checksum is missing', async () => {
  const content = Buffer.from('no-md5-available');
  const { tempDir: temp_dir, tempPath: temp_path } = createTempFile(content);

  try {
    const actual_size = await verifyDownloadedFile({
      filePath: temp_path,
      expectedSize: content.length,
      expectedMd5: null,
    });
    assert.equal(actual_size, content.length);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('verifyDownloadedFile skips size check when expected size is unknown', async () => {
  const content = Buffer.from('unknown-size');
  const { tempDir: temp_dir, tempPath: temp_path } = createTempFile(content);

  try {
    const actual_size = await verifyDownloadedFile({
      filePath: temp_path,
      expectedSize: 0,
      expectedMd5: null,
    });
    assert.equal(actual_size, content.length);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('_syncFile does not upload when download integrity check fails', async () => {
  const uploaded_paths = [];
  const recorded_errors = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncProgress = 0;
  sync_service.onChange = () => {};
  sync_service._notifyProgress = () => {};
  sync_service.api = {
    downloadFile: async () => {
      throw new Error('Download size mismatch: expected 100 bytes, got 50');
    },
  };
  sync_service.vault = {
    enqueueUpload: async (_local_path, vault_path) => {
      uploaded_paths.push(vault_path);
      return { skipped: true, task: null, done: Promise.resolve() };
    },
  };
  sync_service.db = {
    gdriveManifestGet: () => null,
    getAll: () => [],
    gdriveStateGet: (_key, default_value) => default_value,
    gdriveManifestUpsert: () => {},
    gdriveSyncErrorAdd: (sync_error) => recorded_errors.push(sync_error),
    gdriveSyncErrorRemove: () => {},
  };

  await assert.rejects(
    () => sync_service._syncFile({
      driveFileId: 'file1',
      fileName: 'a.bin',
      drivePath: 'a.bin',
      vaultPath: '/GDrive/a.bin',
      size: 100,
      modifiedTime: '2026-07-18T00:00:00Z',
      md5Checksum: 'abc',
    }),
    /size mismatch/i,
  );

  assert.deepEqual(uploaded_paths, []);
  assert.equal(recorded_errors.length, 1);
  assert.match(recorded_errors[0].errorMessage, /size mismatch/i);
});
