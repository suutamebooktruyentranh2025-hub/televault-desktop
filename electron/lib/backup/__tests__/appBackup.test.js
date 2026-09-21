const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { openIndexDb } = require('../../db/indexDb');
const {
  sanitizeDbCopyForSafeBackup,
  createAppBackupArchive,
  restoreAppBackupArchive,
} = require('../appBackup');

function makeAccountFixture(root_dir) {
  const account_dir = path.join(root_dir, 'accounts', 'acc1');
  fs.mkdirSync(account_dir, { recursive: true });
  const db_path = path.join(account_dir, 'index.db');
  const db = openIndexDb(db_path);
  db.upsert({
    messageId: 1,
    path: '/GDrive/photo.jpg',
    size: 10,
    sha256: 'abc',
    mtime: new Date(),
    localPath: null,
  });
  db.gdriveManifestUpsert({
    driveFileId: 'drive1',
    drivePath: 'photo.jpg',
    vaultPath: '/GDrive/photo.jpg',
    md5: 'md5a',
    sha256: 'abc',
    size: 10,
    driveModifiedTime: 't1',
  });
  db.gdriveTokenSet('refresh_token', 'secret-refresh');
  db.gdriveTokenSet('access_token', 'secret-access');
  db.close();

  const td_dir = path.join(account_dir, 'td');
  fs.mkdirSync(td_dir, { recursive: true });
  fs.writeFileSync(path.join(td_dir, 'session.bin'), 'td-session');

  const api_path = path.join(root_dir, 'televault-tg-api-acc1.json');
  fs.writeFileSync(api_path, JSON.stringify({ apiId: 1, apiHash: 'hash' }));

  return { account_dir, db_path, api_path, root_dir };
}

test('sanitizeDbCopyForSafeBackup clears gdrive tokens but keeps vault and manifest', () => {
  const temp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-bak-sanitize-'));
  try {
    const { db_path } = makeAccountFixture(temp_root);
    const safe_copy = path.join(temp_root, 'safe.db');
    fs.copyFileSync(db_path, safe_copy);
    sanitizeDbCopyForSafeBackup(safe_copy);

    const db = openIndexDb(safe_copy);
    try {
      assert.equal(db.gdriveTokenGet('refresh_token'), null);
      assert.equal(db.gdriveTokenGet('access_token'), null);
      assert.equal(db.gdriveManifestGet('drive1')?.sha256, 'abc');
      assert.equal(db.getAll().find((row) => row.path === '/GDrive/photo.jpg')?.sha256, 'abc');
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(temp_root, { recursive: true, force: true });
  }
});

test('safe backup restore keeps dedupe data and omits sessions/tokens', async () => {
  const temp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-bak-safe-'));
  try {
    const fixture = makeAccountFixture(temp_root);
    const zip_path = path.join(temp_root, 'safe.televault-backup.zip');

    await createAppBackupArchive({
      accountDir: fixture.account_dir,
      userDataPath: fixture.root_dir,
      accountId: 'acc1',
      zipPath: zip_path,
      includeSessions: false,
      appVersion: '0.1.0',
    });

    const restore_root = path.join(temp_root, 'restore');
    const restore_account = path.join(restore_root, 'accounts', 'acc1');
    fs.mkdirSync(restore_account, { recursive: true });

    const result = await restoreAppBackupArchive({
      zipPath: zip_path,
      accountDir: restore_account,
      userDataPath: restore_root,
      accountId: 'acc1',
    });

    assert.equal(result.includesSessions, false);
    assert.equal(fs.existsSync(path.join(restore_account, 'td', 'session.bin')), false);
    assert.equal(fs.existsSync(path.join(restore_root, 'televault-tg-api-acc1.json')), false);

    const db = openIndexDb(path.join(restore_account, 'index.db'));
    try {
      assert.equal(db.gdriveTokenGet('refresh_token'), null);
      assert.equal(db.gdriveManifestGet('drive1')?.md5, 'md5a');
      assert.equal(db.getAll()[0].sha256, 'abc');
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(temp_root, { recursive: true, force: true });
  }
});

test('session backup restore includes td, api creds, and gdrive tokens', async () => {
  const temp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-bak-sess-'));
  try {
    const fixture = makeAccountFixture(temp_root);
    const zip_path = path.join(temp_root, 'full.televault-backup.zip');

    await createAppBackupArchive({
      accountDir: fixture.account_dir,
      userDataPath: fixture.root_dir,
      accountId: 'acc1',
      zipPath: zip_path,
      includeSessions: true,
      appVersion: '0.1.0',
    });

    const restore_root = path.join(temp_root, 'restore');
    const restore_account = path.join(restore_root, 'accounts', 'acc1');
    fs.mkdirSync(restore_account, { recursive: true });

    const result = await restoreAppBackupArchive({
      zipPath: zip_path,
      accountDir: restore_account,
      userDataPath: restore_root,
      accountId: 'acc1',
    });

    assert.equal(result.includesSessions, true);
    assert.equal(
      fs.readFileSync(path.join(restore_account, 'td', 'session.bin'), 'utf8'),
      'td-session',
    );
    assert.equal(
      JSON.parse(fs.readFileSync(path.join(restore_root, 'televault-tg-api-acc1.json'), 'utf8')).apiHash,
      'hash',
    );

    const db = openIndexDb(path.join(restore_account, 'index.db'));
    try {
      assert.equal(db.gdriveTokenGet('refresh_token'), 'secret-refresh');
    } finally {
      db.close();
    }
  } finally {
    fs.rmSync(temp_root, { recursive: true, force: true });
  }
});
