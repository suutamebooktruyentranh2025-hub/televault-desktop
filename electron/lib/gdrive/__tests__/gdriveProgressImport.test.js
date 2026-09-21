const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openIndexDb } = require('../../db/indexDb');
const {
  extractGdriveProgressSnapshot,
  applyGdriveProgressSnapshot,
  exportGdriveProgressZip,
  importGdriveProgressZip,
  PROGRESS_FORMAT,
  IMPORTABLE_STATE_KEYS,
} = require('../gdriveProgressImport');
const { shouldEnqueueDriveFile } = require('../gdriveDiscovery');

function makeSourceDb(dir) {
  const db = openIndexDb(path.join(dir, 'index.db'));
  db.setVaultChatId(-1004310533766);
  db.gdriveSubscriptionAdd({
    driveId: 'folder1', drivePath: '/Drive', vaultPath: '/GDrive/', isFolder: true,
  });
  db.gdriveManifestUpsert({
    driveFileId: 'd1', drivePath: 'a.jpg', vaultPath: '/GDrive/a.jpg',
    md5: 'm1', sha256: 's1', size: 10, driveModifiedTime: 't1',
  });
  db.gdriveStateSet('conflict_policy', 'keep_both');
  db.gdriveStateSet('poll_interval_ms', '900000');
  db.gdriveStateSet('ignored_extensions', '.tmp');
  db.gdriveTokenSet('refresh_token', 'SECRET');
  db.gdriveStateSet('changes_page_token', 'should-not-copy');
  db.upsert({
    messageId: 42, path: '/GDrive/a.jpg', size: 10, sha256: 's1',
    mtime: new Date('2024-01-01'), localPath: null, tags: ['photo'],
  });
  return db;
}

test('extract snapshot includes gdrive data and vault files, excludes tokens', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-src-'));
  const db = makeSourceDb(dir);
  const snap = extractGdriveProgressSnapshot(db);
  db.close();
  assert.equal(snap.vaultChatId, -1004310533766);
  assert.equal(snap.manifest.length, 1);
  assert.equal(snap.subscriptions.length, 1);
  assert.equal(snap.state.conflict_policy, 'keep_both');
  assert.equal(snap.state.changes_page_token, undefined);
  assert.ok(!('refresh_token' in (snap.state || {})));
  assert.equal(snap.vaultFiles.length, 1);
  assert.equal(snap.vaultFiles[0].path, '/GDrive/a.jpg');
  assert.deepEqual(snap.vaultFiles[0].tags, ['photo']);
  for (const key of IMPORTABLE_STATE_KEYS) {
    assert.ok(typeof key === 'string');
  }
});

test('apply replaces dest manifest/subs, clears queue, merges shared vault files, sets sync target', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-apply-'));
  const srcDir = path.join(root, 'A');
  fs.mkdirSync(srcDir);
  const srcDb = makeSourceDb(srcDir);
  const snap = extractGdriveProgressSnapshot(srcDb);
  srcDb.close();

  const destDir = path.join(root, 'B');
  fs.mkdirSync(destDir);
  const destDb = openIndexDb(path.join(destDir, 'index.db'));
  destDb.gdriveManifestUpsert({
    driveFileId: 'old', drivePath: 'x', vaultPath: '/GDrive/x',
    md5: null, sha256: 'x', size: 1, driveModifiedTime: 't0',
  });
  destDb.gdriveSubscriptionAdd({
    driveId: 'oldsub', drivePath: '/Old', vaultPath: '/Old/', isFolder: true,
  });
  destDb.gdriveSyncQueueAdd({
    driveFileId: 'q1', fileName: 'q.jpg', drivePath: 'q.jpg',
    vaultPath: '/GDrive/q.jpg', size: 1, modifiedTime: 't',
  });
  destDb.gdriveStateSet('conflict_policy', 'skip');

  const result = applyGdriveProgressSnapshot({
    destDb, destAccountDir: destDir, snapshot: snap,
  });

  assert.equal(result.vaultChatId, -1004310533766);
  assert.equal(result.manifestCount, 1);
  assert.equal(destDb.gdriveManifestAll().length, 1);
  assert.equal(destDb.gdriveManifestGet('d1').sha256, 's1');
  assert.equal(destDb.gdriveManifestGet('old'), null);
  assert.equal(destDb.gdriveSubscriptionsAll().length, 1);
  assert.equal(destDb.gdriveSyncQueueCount(), 0);
  assert.equal(destDb.gdriveStateGet('conflict_policy'), 'keep_both');
  assert.equal(destDb.gdriveStateGet('sync_target_chat_id'), '-1004310533766');
  assert.equal(destDb.gdriveStateGet('changes_page_token', null), null);

  const sharedPath = path.join(destDir, 'shared-vaults', '-1004310533766', 'index.db');
  assert.ok(fs.existsSync(sharedPath));
  const sharedDb = openIndexDb(sharedPath);
  const entry = sharedDb.getAll().find((e) => e.path === '/GDrive/a.jpg');
  assert.ok(entry);
  assert.equal(entry.sha256, 's1');
  assert.deepEqual(entry.tags, ['photo']);
  sharedDb.close();
  destDb.close();
});

test('after import, unchanged Drive file with vault entry should not enqueue', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-dedup-'));
  const srcDir = path.join(root, 'A');
  fs.mkdirSync(srcDir);
  const srcDb = makeSourceDb(srcDir);
  const snap = extractGdriveProgressSnapshot(srcDb);
  srcDb.close();

  const destDir = path.join(root, 'B');
  fs.mkdirSync(destDir);
  const destDb = openIndexDb(path.join(destDir, 'index.db'));
  applyGdriveProgressSnapshot({ destDb, destAccountDir: destDir, snapshot: snap });

  const manifest = destDb.gdriveManifestGet('d1');
  const sharedDb = openIndexDb(path.join(destDir, 'shared-vaults', '-1004310533766', 'index.db'));
  const vaultEntry = sharedDb.getAll().find((e) => e.path === '/GDrive/a.jpg');
  assert.equal(
    shouldEnqueueDriveFile({
      manifest,
      driveModifiedTime: 't1',
      vaultEntry,
    }),
    false,
  );
  sharedDb.close();
  destDb.close();
});

test('extract throws when source has no vault_chat_id', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-novault-'));
  const db = openIndexDb(path.join(dir, 'index.db'));
  assert.throws(() => extractGdriveProgressSnapshot(db), /vault_chat_id/);
  db.close();
});

test('extract merges vault files from shared-vaults/<vaultChatId> into vaultFiles', () => {
  const srcDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-shared-merge-'));
  const srcDb = makeSourceDb(srcDir);
  // Personal index has a.jpg (from makeSourceDb). Shared vault index has an extra file
  // that Telegram scan discovered — export must include it in vault-files.json.
  const sharedDir = path.join(srcDir, 'shared-vaults', '-1004310533766');
  fs.mkdirSync(sharedDir, { recursive: true });
  const sharedDb = openIndexDb(path.join(sharedDir, 'index.db'));
  sharedDb.upsert({
    messageId: 99,
    path: '/GDrive/only-in-shared.cbz',
    size: 42,
    sha256: 'shared-sha',
    mtime: new Date('2024-06-01'),
    localPath: null,
    tags: [],
  });
  sharedDb.close();

  const snap = extractGdriveProgressSnapshot(srcDb, srcDir);
  srcDb.close();

  assert.ok(snap.vaultFiles.some((f) => f.path === '/GDrive/a.jpg'));
  assert.ok(
    snap.vaultFiles.some((f) => f.path === '/GDrive/only-in-shared.cbz' && f.sha256 === 'shared-sha'),
    'vault-files must include Telegram-scanned shared vault index rows',
  );
});

test('ZIP export/import round-trips progress without tokens', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-zip-'));
  const srcDir = path.join(root, 'A');
  fs.mkdirSync(srcDir);
  const srcDb = makeSourceDb(srcDir);
  srcDb.close();

  const zipPath = path.join(root, 'progress.televault-gdrive-progress.zip');
  const exported = await exportGdriveProgressZip({
    sourceAccountDir: srcDir,
    zipPath,
    accountId: 'acc-a',
    appVersion: '0.1.0',
  });
  assert.equal(exported.ok, true);
  assert.ok(fs.existsSync(zipPath));

  const destDir = path.join(root, 'B');
  fs.mkdirSync(destDir);
  const destDb = openIndexDb(path.join(destDir, 'index.db'));
  const imported = await importGdriveProgressZip({
    zipPath, destAccountDir: destDir, destDb,
  });
  assert.equal(imported.vaultChatId, -1004310533766);
  assert.equal(destDb.gdriveManifestGet('d1').sha256, 's1');
  assert.equal(destDb.gdriveStateGet('sync_target_chat_id'), '-1004310533766');
  const sharedDb = openIndexDb(path.join(destDir, 'shared-vaults', '-1004310533766', 'index.db'));
  assert.ok(sharedDb.getAll().some((e) => e.path === '/GDrive/a.jpg'));
  sharedDb.close();
  destDb.close();
});

test('ZIP import rejects wrong format', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-prog-badzip-'));
  const stage = path.join(root, 'stage');
  fs.mkdirSync(stage);
  fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({
    format: 'not-this', vaultChatId: 1,
  }));
  const zipPath = path.join(root, 'bad.zip');
  const { createZipFromDirectory } = require('../../backup/zipStore');
  createZipFromDirectory(stage, zipPath);
  const destDir = path.join(root, 'B');
  fs.mkdirSync(destDir);
  const destDb = openIndexDb(path.join(destDir, 'index.db'));
  await assert.rejects(
    () => importGdriveProgressZip({ zipPath, destAccountDir: destDir, destDb }),
    /format/,
  );
  destDb.close();
});
