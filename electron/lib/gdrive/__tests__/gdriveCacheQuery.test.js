const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');

test('gdriveCacheQueryFiles and gdriveCacheSummaryStats DAO methods', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-cache-query-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);

    // Assert functions exist
    assert.equal(typeof db.gdriveCacheQueryFiles, 'function');
    assert.equal(typeof db.gdriveCacheSummaryStats, 'function');

    // Seed cache nodes
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir_root',
        parentId: 'root',
        name: 'Comics',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        size: 0,
        drivePath: '/Comics/',
      },
      {
        id: 'file_synced',
        parentId: 'dir_root',
        name: 'Chapter01.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 1000,
        modifiedTime: '2026-09-18T10:00:00Z',
        drivePath: '/Comics/Chapter01.cbz',
      },
      {
        id: 'file_queued',
        parentId: 'dir_root',
        name: 'Chapter02.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 2000,
        modifiedTime: '2026-09-18T10:05:00Z',
        drivePath: '/Comics/Chapter02.cbz',
      },
      {
        id: 'file_error',
        parentId: 'dir_root',
        name: 'Chapter03.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 3000,
        modifiedTime: '2026-09-18T10:10:00Z',
        drivePath: '/Comics/Chapter03.cbz',
      },
      {
        id: 'file_skipped',
        parentId: 'dir_root',
        name: 'Notes',
        mimeType: 'application/vnd.google-apps.document',
        isFolder: 0,
        size: 0,
        modifiedTime: '2026-09-18T10:15:00Z',
        drivePath: '/Comics/Notes',
      },
      {
        id: 'file_pending',
        parentId: 'dir_root',
        name: 'Chapter04.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 4000,
        modifiedTime: '2026-09-18T10:20:00Z',
        drivePath: '/Comics/Chapter04.cbz',
      },
      {
        id: 'file_trashed',
        parentId: 'dir_root',
        name: 'OldChapter.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 500,
        trashed: 1,
        drivePath: '/Comics/OldChapter.cbz',
      },
    ]);

    // Seed manifest row for file_synced
    db.gdriveManifestUpsert({
      driveFileId: 'file_synced',
      drivePath: '/Comics/Chapter01.cbz',
      vaultPath: '/Vault/Comics/Chapter01.cbz',
      md5: 'md5_synced',
      sha256: 'sha256_synced',
      size: 1000,
      driveModifiedTime: '2026-09-18T10:00:00Z',
    });

    // Seed queue row for file_queued
    db.gdriveSyncQueueAdd({
      driveFileId: 'file_queued',
      fileName: 'Chapter02.cbz',
      drivePath: 'Chapter02.cbz',
      vaultPath: '/Vault/Comics/Chapter02.cbz',
      size: 2000,
      modifiedTime: '2026-09-18T10:05:00Z',
    });

    // Seed error row for file_error
    db.gdriveSyncErrorAdd({
      driveFileId: 'file_error',
      fileName: 'Chapter03.cbz',
      drivePath: 'Chapter03.cbz',
      vaultPath: '/Vault/Comics/Chapter03.cbz',
      size: 3000,
      errorMessage: 'File size exceeds 2GB limit',
      errorType: 'permanent',
    });

    // 1. Test Summary Stats
    const stats = db.gdriveCacheSummaryStats();
    assert.equal(stats.totalFiles, 6);
    assert.equal(stats.totalFolders, 1);
    assert.equal(stats.syncedCount, 1);
    assert.equal(stats.queuedCount, 1);
    assert.equal(stats.errorCount, 1);
    assert.equal(stats.skippedCount, 1);
    assert.equal(stats.pendingCount, 1);
    assert.equal(stats.trashedCount, 1);
    assert.equal(stats.totalSizeBytes, 10500);
    assert.equal(stats.syncedSizeBytes, 1000);

    // 2. Test Query All (default pagination)
    const all = db.gdriveCacheQueryFiles({ limit: 50, offset: 0 });
    assert.equal(all.total, 7);
    assert.equal(all.items.length, 7);

    // 3. Test Filter by Status: 'synced'
    const syncedOnly = db.gdriveCacheQueryFiles({ status: 'synced' });
    assert.equal(syncedOnly.total, 1);
    assert.equal(syncedOnly.items[0].id, 'file_synced');
    assert.equal(syncedOnly.items[0].status, 'synced');
    assert.equal(syncedOnly.items[0].vaultPath, '/Vault/Comics/Chapter01.cbz');

    // 4. Test Filter by Status: 'queued'
    const queuedOnly = db.gdriveCacheQueryFiles({ status: 'queued' });
    assert.equal(queuedOnly.total, 1);
    assert.equal(queuedOnly.items[0].id, 'file_queued');
    assert.equal(queuedOnly.items[0].status, 'queued');

    // 5. Test Filter by Status: 'error'
    const errorOnly = db.gdriveCacheQueryFiles({ status: 'error' });
    assert.equal(errorOnly.total, 1);
    assert.equal(errorOnly.items[0].id, 'file_error');
    assert.equal(errorOnly.items[0].status, 'error');
    assert.equal(errorOnly.items[0].errorMessage, 'File size exceeds 2GB limit');

    // 6. Test Filter by Status: 'skipped'
    const skippedOnly = db.gdriveCacheQueryFiles({ status: 'skipped' });
    assert.equal(skippedOnly.total, 1);
    assert.equal(skippedOnly.items[0].id, 'file_skipped');
    assert.equal(skippedOnly.items[0].status, 'skipped');

    // 7. Test Filter by Status: 'pending'
    const pendingOnly = db.gdriveCacheQueryFiles({ status: 'pending' });
    assert.equal(pendingOnly.total, 1);
    assert.equal(pendingOnly.items[0].id, 'file_pending');
    assert.equal(pendingOnly.items[0].status, 'pending');

    // 8. Test Search by name
    const searchRes = db.gdriveCacheQueryFiles({ search: 'Chapter04' });
    assert.equal(searchRes.total, 1);
    assert.equal(searchRes.items[0].id, 'file_pending');

    // 9. Test Filter by isFolder without subscription
    const foldersBeforeSub = db.gdriveCacheQueryFiles({ isFolder: 1 });
    assert.equal(foldersBeforeSub.total, 1);
    assert.equal(foldersBeforeSub.items[0].id, 'dir_root');
    assert.equal(foldersBeforeSub.items[0].vaultPath, null);
    assert.equal(foldersBeforeSub.items[0].isSynced, false);

    // Add subscription for dir_root
    db.gdriveSubscriptionAdd({
      driveId: 'dir_root',
      drivePath: '/Comics',
      vaultPath: '/Vault/Comics/',
      isFolder: 1,
    });

    // 10. Test folder resolution with subscription & manifest row
    const foldersAfterSub = db.gdriveCacheQueryFiles({ isFolder: 1 });
    assert.equal(foldersAfterSub.total, 1);
    assert.equal(foldersAfterSub.items[0].id, 'dir_root');
    assert.equal(foldersAfterSub.items[0].vaultPath, '/Vault/Comics/');
    assert.equal(foldersAfterSub.items[0].isSynced, true);

    const filesOnly = db.gdriveCacheQueryFiles({ isFolder: 0 });
    assert.equal(filesOnly.total, 6);

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
