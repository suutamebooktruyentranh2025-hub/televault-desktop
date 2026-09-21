const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');
const { registerGDriveHandlers } = require('../../ipc/gdriveHandlers');

test('gdrive cache IPC handlers: query, summary, requeue', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-cache-ipc-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);

    // Mock ipcMain
    const handlers = new Map();
    const mockIpcMain = {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    };

    // Seed mock data
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir1',
        parentId: 'root',
        name: 'Comics',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Comics/',
      },
      {
        id: 'f1',
        parentId: 'dir1',
        name: 'Issue1.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 5000,
        modifiedTime: '2026-09-18T10:00:00Z',
        drivePath: '/Comics/Issue1.cbz',
      },
    ]);

    db.gdriveSubscriptionAdd({
      driveId: 'dir1',
      drivePath: '/Comics/',
      vaultPath: '/TelegramVault/Comics/',
      isFolder: 1,
    });

    const mockCtx = {
      getDb: () => db,
      getGDriveSyncService: () => null,
      isReady: () => true,
    };

    registerGDriveHandlers(mockIpcMain, mockCtx);

    // 1. Verify handlers were registered
    assert.ok(handlers.has('gdrive:queryCacheFiles'), 'gdrive:queryCacheFiles registered');
    assert.ok(handlers.has('gdrive:getCacheSummary'), 'gdrive:getCacheSummary registered');
    assert.ok(handlers.has('gdrive:requeueCacheFile'), 'gdrive:requeueCacheFile registered');

    // 2. Test gdrive:getCacheSummary
    const summaryHandler = handlers.get('gdrive:getCacheSummary');
    const summaryRes = await summaryHandler();
    assert.equal(summaryRes.ok, true);
    assert.equal(summaryRes.summary.totalFiles, 1);
    assert.equal(summaryRes.summary.totalFolders, 1);
    assert.equal(summaryRes.summary.pendingCount, 1);

    // 3. Test gdrive:queryCacheFiles
    const queryHandler = handlers.get('gdrive:queryCacheFiles');
    const queryRes = await queryHandler(null, { limit: 10, offset: 0 });
    assert.equal(queryRes.ok, true);
    assert.equal(queryRes.total, 2);
    assert.equal(queryRes.items.length, 2);

    // 4. Test gdrive:requeueCacheFile
    const requeueHandler = handlers.get('gdrive:requeueCacheFile');
    const requeueRes = await requeueHandler(null, { driveFileId: 'f1' });
    assert.equal(requeueRes.ok, true);

    let queueItems = db.gdriveSyncQueueGetAll();
    assert.equal(queueItems.length, 1);
    assert.equal(queueItems[0].driveFileId, 'f1');
    assert.equal(queueItems[0].vaultPath, '/TelegramVault/Comics/Issue1.cbz');

    // 5. Test gdrive:requeueAllPending with fallback when no subscriptions exist
    // Clear queue and subscriptions
    db.gdriveSyncQueueRemove('f1');
    db.gdriveSubscriptionRemove('dir1');

    // Add another file outside any subscription
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'f2',
        parentId: 'root',
        name: 'Unsubscribed.pdf',
        mimeType: 'application/pdf',
        isFolder: 0,
        size: 3000,
        modifiedTime: '2026-09-18T10:00:00Z',
        drivePath: '/Unsubscribed.pdf',
      },
    ]);

    const requeueAllHandler = handlers.get('gdrive:requeueAllPending');
    const allRes = await requeueAllHandler(null, {});
    assert.equal(allRes.ok, true);
    assert.equal(allRes.enqueuedCount, 2);

    queueItems = db.gdriveSyncQueueGetAll();
    assert.equal(queueItems.length, 2);
    const f2Queue = queueItems.find((q) => q.driveFileId === 'f2');
    assert.ok(f2Queue);
    assert.equal(f2Queue.vaultPath, '/GoogleDrive/Unsubscribed.pdf');

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
