const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');
const { GDriveSyncService } = require('../gdriveSyncService');

test('scanNow uses local cache nodes instead of remote listFolderRecursive', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-scan-cache-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);
    let remoteCallCount = 0;

    // Seed cache nodes directly in SQLite
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir_comics',
        parentId: 'root',
        name: 'Comics',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Comics/',
      },
      {
        id: 'file_ch1',
        parentId: 'dir_comics',
        name: 'OnePiece_01.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 5000000,
        modifiedTime: '2026-09-18T12:00:00Z',
        md5Checksum: 'md5ch1',
        drivePath: '/Comics/OnePiece_01.cbz',
      },
      {
        id: 'doc_gworkspace',
        parentId: 'dir_comics',
        name: 'Chapter Notes',
        mimeType: 'application/vnd.google-apps.document',
        isFolder: 0,
        size: 0,
        modifiedTime: '2026-09-18T12:00:00Z',
        md5Checksum: null,
        drivePath: '/Comics/Chapter Notes',
      },
    ]);
    db.gdriveStateSet('cache_status', 'ready');

    // Add subscription
    db.gdriveSubscriptionAdd({
      driveId: 'dir_comics',
      drivePath: '/Comics/',
      vaultPath: '/TelegramVault/Comics/',
      isFolder: 1,
    });

    const syncService = Object.create(GDriveSyncService.prototype);
    syncService.db = db;
    syncService.auth = { isConnected: () => true };
    syncService._syncInProgress = false;
    syncService.isPaused = false;
    syncService._lifecycleGeneration = 1;
    syncService._folderIdCache = new Map();
    syncService.api = {
      listFolderRecursive: async () => {
        remoteCallCount += 1;
        return [];
      },
      listAllFilesFlat: async () => {
        remoteCallCount += 1;
        return [];
      },
      getChanges: async () => ({ newStartPageToken: 'token1' }),
    };
    syncService.vault = {
      chatId: 123,
      channel: {},
    };
    syncService._vaultEntries = () => [];
    syncService._startQueueWorker = () => {};
    syncService._awaitTelegramFloodClear = async () => {};

    await syncService.scanNow();

    // Verify: remote API was NOT called because cache had nodes
    assert.equal(remoteCallCount, 0);

    // Verify: item was discovered from local cache and queued, while Google Workspace doc was ignored
    const queue = db.gdriveSyncQueueGetAll();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].driveFileId, 'file_ch1');
    assert.equal(queue[0].vaultPath, '/TelegramVault/Comics/OnePiece_01.cbz');
    assert.equal(queue.some(q => q.driveFileId === 'doc_gworkspace'), false);

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scanNow with forceIndex: true fetches remote index even when cache is ready and when paused', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-scan-force-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);
    let remoteCallCount = 0;

    // Seed cache nodes directly in SQLite
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir_comics',
        parentId: 'root',
        name: 'Comics',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Comics/',
      },
    ]);
    db.gdriveStateSet('cache_status', 'ready');

    const syncService = Object.create(GDriveSyncService.prototype);
    syncService.db = db;
    syncService.auth = { isConnected: () => true };
    syncService._syncInProgress = false;
    syncService.isPaused = true; // Sync queue paused!
    syncService._lifecycleGeneration = 1;
    syncService._folderIdCache = new Map();
    syncService.api = {
      listFolderRecursive: async () => [],
      listAllFilesFlat: async () => {
        remoteCallCount += 1;
        return [
          {
            id: 'file_new',
            name: 'NewFile.pdf',
            mimeType: 'application/pdf',
            parents: ['root'],
            size: 1024,
            modifiedTime: '2026-09-20T12:00:00Z',
          },
        ];
      },
      getChanges: async () => ({ newStartPageToken: 'token2' }),
    };
    syncService.vault = {
      chatId: 123,
      channel: {},
    };
    syncService._vaultEntries = () => [];
    syncService._startQueueWorker = () => {};
    syncService._awaitTelegramFloodClear = async () => {};

    // Call scanNow with forceIndex: true while paused
    await syncService.scanNow({ forceIndex: true });

    // Verify: remote API WAS called because forceIndex was true
    assert.equal(remoteCallCount, 1);
    // Verify: cache was updated with the newly scanned node
    assert.equal(db.gdriveCacheNodesCount(), 1);
    assert.equal(db.gdriveCacheNodesGet('file_new')?.name, 'NewFile.pdf');
    assert.equal(syncService.status, 'idle');

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('abortScan cancels active scan and resets status cleanly', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-scan-abort-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);

    const syncService = Object.create(GDriveSyncService.prototype);
    syncService.db = db;
    syncService.auth = { isConnected: () => true };
    syncService._syncInProgress = false;
    syncService.isPaused = false;
    syncService._lifecycleGeneration = 1;
    syncService._folderIdCache = new Map();
    syncService.api = {
      listFolderRecursive: async () => [],
      listAllFilesFlat: async (opts) => {
        // Wait and listen for abort
        return new Promise((resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            const err = new Error('Indexing aborted');
            err.name = 'AbortError';
            reject(err);
          });
        });
      },
      getChanges: async () => ({ newStartPageToken: 'token1' }),
    };
    syncService.vault = {
      chatId: 123,
      channel: {},
    };
    syncService._vaultEntries = () => [];
    syncService._startQueueWorker = () => {};
    syncService._awaitTelegramFloodClear = async () => {};

    const scanPromise = syncService.scanNow({ forceIndex: true });

    // Give it a tick to start
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(syncService._syncInProgress, true);

    // Now abort
    syncService.abortScan();

    await scanPromise;

    assert.equal(syncService._syncInProgress, false);
    assert.equal(syncService.status, 'idle');
    assert.equal(syncService.scanPhase, null);

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

