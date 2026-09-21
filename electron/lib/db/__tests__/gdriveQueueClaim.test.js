const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openIndexDb } = require('../indexDb');

function openTempDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-q-'));
  return { db: openIndexDb(path.join(dir, 'index.db')), dir };
}

test('two claims return different rows', () => {
  const { db, dir } = openTempDb();
  db.gdriveSyncQueueAdd({
    driveFileId: 'a', fileName: 'a.bin', drivePath: 'a.bin', vaultPath: '/GDrive/a.bin',
    size: 1, modifiedTime: '2026-01-01T00:00:00.000Z',
  });
  db.gdriveSyncQueueAdd({
    driveFileId: 'b', fileName: 'b.bin', drivePath: 'b.bin', vaultPath: '/GDrive/b.bin',
    size: 1, modifiedTime: '2026-01-01T00:00:00.000Z',
  });
  const first = db.gdriveSyncQueueClaimNext('w1');
  const second = db.gdriveSyncQueueClaimNext('w2');
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.driveFileId, second.driveFileId);
  assert.equal(db.gdriveSyncQueueClaimNext('w3'), null);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('releaseAllRunning returns running rows to queued', () => {
  const { db, dir } = openTempDb();
  db.gdriveSyncQueueAdd({
    driveFileId: 'a', fileName: 'a.bin', drivePath: 'a.bin', vaultPath: '/GDrive/a.bin',
    size: 1, modifiedTime: '2026-01-01T00:00:00.000Z',
  });
  db.gdriveSyncQueueAdd({
    driveFileId: 'b', fileName: 'b.bin', drivePath: 'b.bin', vaultPath: '/GDrive/b.bin',
    size: 1, modifiedTime: '2026-01-01T00:00:00.000Z',
  });
  assert.ok(db.gdriveSyncQueueClaimNext('w1'));
  assert.ok(db.gdriveSyncQueueClaimNext('w2'));
  assert.equal(db.gdriveSyncQueueClaimNext('w3'), null);

  db.gdriveSyncQueueReleaseAllRunning();

  assert.ok(db.gdriveSyncQueueClaimNext('w3'));
  assert.ok(db.gdriveSyncQueueClaimNext('w4'));
  assert.equal(db.gdriveSyncQueueClaimNext('w5'), null);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('aborted old worker cannot release a row claimed by another worker', () => {
  const { db, dir } = openTempDb();
  db.gdriveSyncQueueAdd({
    driveFileId: 'a', fileName: 'a.bin', drivePath: 'a.bin', vaultPath: '/GDrive/a.bin',
    size: 1, modifiedTime: '2026-01-01T00:00:00.000Z',
  });
  assert.equal(db.gdriveSyncQueueClaimNext('old_worker').driveFileId, 'a');
  db.gdriveSyncQueueReleaseAllRunning();
  assert.equal(db.gdriveSyncQueueClaimNext('new_worker').driveFileId, 'a');

  db.gdriveSyncQueueReleaseToQueuedIfOwner('a', 'old_worker');

  assert.equal(db.gdriveSyncQueueClaimNext('third_worker'), null);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('vault path cleanup removes only matching GDrive rows', () => {
  const { db, dir } = openTempDb();
  const matching_item = {
    driveFileId: 'matching',
    fileName: 'matching.bin',
    drivePath: 'Docs/matching.bin',
    vaultPath: '/GDrive/Docs/matching.bin',
    size: 1,
    modifiedTime: '2026-01-01T00:00:00.000Z',
  };
  const retained_item = {
    driveFileId: 'retained',
    fileName: 'retained.bin',
    drivePath: 'Docs2/retained.bin',
    vaultPath: '/GDrive/Docs2/retained.bin',
    size: 1,
    modifiedTime: '2026-01-01T00:00:00.000Z',
  };

  for (const sync_item of [matching_item, retained_item]) {
    db.gdriveSyncQueueAdd(sync_item);
    db.gdriveSyncErrorAdd({ ...sync_item, errorMessage: 'failed' });
    db.gdriveManifestUpsert({
      driveFileId: sync_item.driveFileId,
      drivePath: sync_item.drivePath,
      vaultPath: sync_item.vaultPath,
      sha256: `sha-${sync_item.driveFileId}`,
      size: sync_item.size,
      driveModifiedTime: sync_item.modifiedTime,
    });
  }

  db.gdriveSyncQueueRemoveByVaultPathPrefix('/GDrive/Docs/');
  db.gdriveSyncErrorsRemoveByVaultPathPrefix('/GDrive/Docs/');
  db.gdriveManifestRemoveByVaultPathPrefix('/GDrive/Docs/');

  assert.deepEqual(db.gdriveSyncQueueGetAll().map((sync_item) => sync_item.driveFileId), ['retained']);
  assert.deepEqual(db.gdriveSyncErrorsAll().map((sync_error) => sync_error.driveFileId), ['retained']);
  assert.deepEqual(db.gdriveManifestAll().map((manifest_item) => manifest_item.driveFileId), ['retained']);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
