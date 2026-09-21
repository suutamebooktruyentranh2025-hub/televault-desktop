const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { openIndexDb } = require('../../db/indexDb');
const { GDriveSyncService } = require('../gdriveSyncService');

function setupTestEnv() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-auto-sync-test-'));
  const db = openIndexDb(path.join(tmpDir, 'test.db'));
  const vault = {
    chatId: -100123456789,
    getEntries: () => [],
    trashEntries: async () => {},
  };
  const cleanup = () => {
    try {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  };
  return { db, vault, cleanup };
}

test('GDriveSyncService does not auto-start queue worker on boot when auto_sync is disabled', async () => {
  const { db, vault, cleanup } = setupTestEnv();
  try {
    // Simulate connected Google Drive account and 1 pending item in queue
    db.gdriveTokenSet('access_token', 'test-access-token');
    db.gdriveTokenSet('refresh_token', 'test-refresh-token');
    db.gdriveStateSet('auto_sync_after_scan', '0'); // User disabled auto-sync
    db.gdriveSyncQueueAdd({
      driveFileId: 'f1',
      fileName: 'test.pdf',
      drivePath: 'test.pdf',
      vaultPath: 'test.pdf',
      size: 100,
    });

    let workerStarted = false;
    // Monkey-patch prototype before instantiation
    const origStart = GDriveSyncService.prototype._startQueueWorker;
    GDriveSyncService.prototype._startQueueWorker = function () {
      workerStarted = true;
    };

    try {
      const svc = new GDriveSyncService({ db, vault });
      assert.equal(svc.pendingCount, 1, 'Queue count should be loaded');
      assert.equal(workerStarted, false, 'Queue worker MUST NOT be started on startup when auto-sync is disabled');
      assert.equal(svc.status, 'idle', 'Status should be idle');
    } finally {
      GDriveSyncService.prototype._startQueueWorker = origStart;
    }
  } finally {
    cleanup();
  }
});

test('startPolling does not auto-start queue worker when auto-sync is disabled', async () => {
  const { db, vault, cleanup } = setupTestEnv();
  try {
    db.gdriveTokenSet('access_token', 'test-access-token');
    db.gdriveTokenSet('refresh_token', 'test-refresh-token');
    db.gdriveStateSet('auto_sync_after_scan', '0');

    let workerStarted = false;
    const origStart = GDriveSyncService.prototype._startQueueWorker;
    GDriveSyncService.prototype._startQueueWorker = function () {
      workerStarted = true;
    };

    try {
      const svc = new GDriveSyncService({ db, vault });
      svc._syncTargetReady = Promise.resolve();
      svc._runPollSync = async () => {}; // Stub poll
      // Add an orphan manifest so _requeueOrphanManifests finds something
      db.gdriveManifestUpsert({
        driveFileId: 'orphan1',
        drivePath: 'orphan.txt',
        vaultPath: 'orphan.txt',
        sha256: 'sha-dummy',
        size: 50,
        driveModifiedTime: new Date().toISOString(),
      });

      await svc.startPolling();
      assert.equal(workerStarted, false, 'startPolling MUST NOT start queue worker when auto-sync is disabled');
      svc.stopPolling();
    } finally {
      GDriveSyncService.prototype._startQueueWorker = origStart;
    }
  } finally {
    cleanup();
  }
});

test('setAutoSyncAfterScan(false) stops active workers, and setAutoSyncAfterScan(true) starts worker if items pending', async () => {
  const { db, vault, cleanup } = setupTestEnv();
  try {
    db.gdriveTokenSet('access_token', 'test-access-token');
    db.gdriveTokenSet('refresh_token', 'test-refresh-token');
    db.gdriveStateSet('auto_sync_after_scan', '0');
    db.gdriveSyncQueueAdd({
      driveFileId: 'f1',
      fileName: 'doc.pdf',
      drivePath: 'doc.pdf',
      vaultPath: 'doc.pdf',
      size: 100,
    });

    const svc = new GDriveSyncService({ db, vault });
    svc._queueWorkerRunning = true;
    let workersStopped = false;
    let workersStarted = 0;

    svc._stopActiveWorkersAndClaims = () => {
      workersStopped = true;
      svc._queueWorkerRunning = false;
    };
    svc._startQueueWorker = () => {
      workersStarted++;
      svc._queueWorkerRunning = true;
    };

    // 1. Disable auto sync
    svc.setAutoSyncAfterScan(false);
    assert.equal(db.gdriveStateGet('auto_sync_after_scan'), '0');
    assert.equal(workersStopped, true, 'Active workers should be stopped when auto-sync is disabled');
    assert.equal(svc.status, 'idle', 'Status should become idle when auto-sync is disabled');

    // 2. Enable auto sync
    svc.setAutoSyncAfterScan(true);
    assert.equal(db.gdriveStateGet('auto_sync_after_scan'), '1');
    assert.equal(workersStarted, 1, 'Workers should start when auto-sync is re-enabled with pending items');
    assert.equal(svc.status, 'syncing', 'Status should become syncing when auto-sync is re-enabled with pending items');
  } finally {
    cleanup();
  }
});

test('Manual startSync() starts worker even when auto-sync is disabled', async () => {
  const { db, vault, cleanup } = setupTestEnv();
  try {
    db.gdriveTokenSet('access_token', 'test-access-token');
    db.gdriveTokenSet('refresh_token', 'test-refresh-token');
    db.gdriveStateSet('auto_sync_after_scan', '0');
    db.gdriveSyncQueueAdd({
      driveFileId: 'f1',
      fileName: 'doc.pdf',
      drivePath: 'doc.pdf',
      vaultPath: 'doc.pdf',
      size: 100,
    });

    const svc = new GDriveSyncService({ db, vault });
    let workerStarted = false;
    svc._startQueueWorker = () => {
      workerStarted = true;
    };

    const res = svc.startSync();
    assert.equal(res.ok, true);
    assert.equal(workerStarted, true, 'Manual startSync should start queue worker');
    assert.equal(svc.status, 'syncing');
    svc._queueWorkerRunning = false;
  } finally {
    cleanup();
  }
});
