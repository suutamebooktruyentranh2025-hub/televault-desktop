const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');
const { GDriveSyncService } = require('../gdriveSyncService');

test('queue worker does not claim items while scanPhase is active', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-scan-sync-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);
    let workerClaimedCount = 0;

    // Add an item to queue
    db.gdriveSyncQueueAdd({
      driveFileId: 'f1',
      fileName: 'file1.txt',
      drivePath: '/file1.txt',
      vaultPath: '/Telegram/file1.txt',
      size: 100,
      modifiedTime: '2026-09-18T10:00:00Z',
    });

    const service = Object.create(GDriveSyncService.prototype);
    service.db = db;
    service.auth = { isConnected: () => true };
    service._queueWorkerRunning = true;
    service._activeWorkers = 1;
    service._workerIdSeq = 0;
    service._workerControllers = new Map();
    service.throttleController = {
      getConcurrency: () => 1,
      reportSuccess: () => {},
      reportError: () => {},
      shouldRetry: () => ({ retry: false }),
    };
    service._awaitTelegramFloodClear = async () => {};
    service.scanPhase = 'scanning'; // Active scan!
    service._syncFile = async () => {
      workerClaimedCount++;
    };

    // Run one iteration of worker loop
    const workerPromise = service._runWorkerLoop();

    // Give it 150ms to see if it claims the item
    await new Promise(r => setTimeout(r, 150));

    // The item should NOT have been claimed because scanPhase is active!
    assert.equal(workerClaimedCount, 0, 'Worker should not claim items while scan is active');

    const queuedItem = db.gdriveSyncQueueGetAll().find(i => i.driveFileId === 'f1');
    assert.equal(queuedItem.status, 'queued', 'Item status must remain queued');

    // Clean up worker
    service.scanPhase = null;
    service._queueWorkerRunning = false;
    for (const c of service._workerControllers.values()) c.abort();
    await Promise.race([workerPromise.catch(() => {}), new Promise(r => setTimeout(r, 600))]);

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('scanNow halts active workers and only starts worker after scan completes if auto_sync_after_scan is enabled', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-scan-now-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);
    let workersStarted = 0;
    let inFlightWorkerAborted = false;

    // Add subscription
    db.gdriveSubscriptionAdd({
      driveId: 'dir1',
      drivePath: '/Dir1/',
      vaultPath: '/Telegram/Dir1/',
      isFolder: 1,
    });

    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir1',
        parentId: 'root',
        name: 'Dir1',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Dir1/',
      },
      {
        id: 'f1',
        parentId: 'dir1',
        name: 'test.txt',
        mimeType: 'text/plain',
        isFolder: 0,
        size: 50,
        modifiedTime: '2026-09-18T10:00:00Z',
        drivePath: '/Dir1/test.txt',
      },
    ]);
    db.gdriveStateSet('cache_status', 'ready');

    const service = Object.create(GDriveSyncService.prototype);
    service.db = db;
    service.auth = { isConnected: () => true };
    service._syncInProgress = false;
    service.isPaused = false;
    service._lifecycleGeneration = 1;
    service._folderIdCache = new Map();
    service._vaultEntries = () => [];
    service._awaitTelegramFloodClear = async () => {};
    service._isLifecycleCurrent = () => true;
    service._shouldSyncFile = () => true;
    service._hasEnabledSubscription = () => true;
    service.api = {
      getChanges: async () => ({ newStartPageToken: 'token_end' }),
    };

    // Simulate an active worker before scan
    const activeController = new AbortController();
    activeController.signal.addEventListener('abort', () => {
      inFlightWorkerAborted = true;
    });
    service._workerControllers = new Map([['worker-old', activeController]]);

    service._startQueueWorker = () => {
      workersStarted++;
    };

    // Test 1: With auto_sync_after_scan = '1' (default)
    db.gdriveStateSet('auto_sync_after_scan', '1');
    await service.scanNow();

    assert.equal(inFlightWorkerAborted, true, 'Active worker controller should have been aborted at start of scan');
    assert.equal(workersStarted, 1, 'Queue worker should start after scan finishes when auto_sync_after_scan is 1');

    // Test 2: With auto_sync_after_scan = '0'
    db.gdriveStateSet('auto_sync_after_scan', '0');
    workersStarted = 0;
    service._workerControllers = new Map();
    await service.scanNow();

    assert.equal(workersStarted, 0, 'Queue worker should NOT start after scan when auto_sync_after_scan is 0');

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('downloadFile falls back to default temp directory if customTempDir cannot be created or accessed', async () => {
  const { GDriveApi } = require('../gdriveApi');
  const drive_api = new GDriveApi({
    auth: { getValidToken: async () => 'token' },
  });
  let downloadedDestPath = null;
  drive_api._downloadStream = async (_url, _token, destPath) => {
    downloadedDestPath = destPath;
    fs.writeFileSync(destPath, 'test-content');
  };

  const invalidCustomDir = '/sys/non_existent_or_permission_denied_dir/temp';
  const resultPath = await drive_api.downloadFile('file_abc', 'report.pdf', invalidCustomDir, null, {
    expectedSize: 12,
  });

  assert.ok(resultPath, 'downloadFile should return a valid path');
  assert.ok(!resultPath.startsWith(invalidCustomDir), 'should not use the inaccessible custom directory');
  assert.ok(resultPath.includes('report.pdf'), 'should include sanitized file name');
  if (fs.existsSync(resultPath)) fs.unlinkSync(resultPath);
});

test('checkConnection returns ok: true with email and latencyMs when Google API succeeds', async () => {
  const service = Object.create(GDriveSyncService.prototype);
  service.auth = {
    clientId: 'cid',
    clientSecret: 'csec',
    refreshToken: 'rtoken',
    email: 'test@gmail.com',
  };
  service.db = {
    gdriveTokenSet: () => {},
  };
  service.api = {
    getAbout: async () => ({
      user: { emailAddress: 'test@gmail.com', displayName: 'Test User' },
      storageQuota: { limit: '1000', usage: '500' },
    }),
  };

  const result = await service.checkConnection();
  assert.equal(result.ok, true);
  assert.equal(result.email, 'test@gmail.com');
  assert.ok(result.latencyMs >= 0);
});

test('checkConnection returns friendly error when token refresh or API fails', async () => {
  const service = Object.create(GDriveSyncService.prototype);
  service.auth = {
    clientId: 'cid',
    clientSecret: 'csec',
    refreshToken: 'rtoken',
    email: 'test@gmail.com',
  };
  service.db = {
    gdriveTokenSet: () => {},
  };
  service.api = {
    getAbout: async () => {
      throw new Error('Token refresh failed: Bad Request');
    },
  };

  const result = await service.checkConnection();
  assert.equal(result.ok, false);
  assert.ok(result.error.includes('Token refresh failed') || result.error.includes('hết hạn'));
});

test('scanNow stops scanning and throws friendly error if session token has expired', async () => {
  const service = Object.create(GDriveSyncService.prototype);
  service.auth = {
    isConnected: () => true,
    getValidToken: async () => {
      throw new Error('Token refresh failed: Bad Request');
    },
  };
  service.isPaused = false;
  service._syncInProgress = false;
  service._lifecycleGeneration = 1;
  service._isLifecycleCurrent = () => true;

  await assert.rejects(
    async () => {
      await service.scanNow();
    },
    (err) => {
      assert.ok(err.message.includes('hết hạn') || err.message.includes('Token refresh failed'));
      return true;
    }
  );

  assert.equal(service.status, 'error');
  assert.equal(service.scanPhase, null);
  assert.equal(service._syncInProgress, false);
  assert.ok(service.lastError.includes('hết hạn') || service.lastError.includes('Token refresh failed'));
});

test('scanNow proactively checks connection via api.getAbout and throws if failed', async () => {
  const service = Object.create(GDriveSyncService.prototype);
  let getAboutCalled = false;
  service.auth = {
    isConnected: () => true,
    getValidToken: async () => 'valid_access_token',
  };
  service.api = {
    getAbout: async () => {
      getAboutCalled = true;
      throw new Error('Token refresh failed: Bad Request');
    },
  };
  service.isPaused = false;
  service._syncInProgress = false;
  service._lifecycleGeneration = 1;
  service._isLifecycleCurrent = () => true;

  await assert.rejects(
    async () => {
      await service.scanNow();
    },
    (err) => {
      assert.ok(err.message.includes('hết hạn') || err.message.includes('Token refresh failed'));
      return true;
    }
  );

  assert.equal(getAboutCalled, true);
  assert.equal(service.status, 'error');
  assert.equal(service.scanPhase, null);
  assert.equal(service._syncInProgress, false);
});

test('scanNow throws error and updates status if not connected', async () => {
  const service = Object.create(GDriveSyncService.prototype);
  service.auth = {
    isConnected: () => false,
  };
  service.isPaused = false;
  service._syncInProgress = false;

  await assert.rejects(
    async () => {
      await service.scanNow();
    },
    (err) => {
      assert.ok(err.message.includes('kết nối'));
      return true;
    }
  );
  assert.equal(service.status, 'disconnected');
  assert.ok(service.lastError.includes('kết nối'));
});

test('scanNow halts, stops workers, sets status error and throws when error occurs during scan', async () => {
  const service = Object.create(GDriveSyncService.prototype);
  let stoppedWorkers = false;
  service.auth = {
    isConnected: () => true,
    getValidToken: async () => 'valid_token_string',
  };
  service.db = {
    gdriveSubscriptionsAll: () => [{ enabled: true, isFolder: false, driveId: 'f1', drivePath: '/file.txt', vaultPath: '/vault/file.txt' }],
    gdriveCacheNodesCount: () => 0,
    gdriveStateGet: () => null,
  };
  service.api = {
    getFile: async () => {
      throw new Error('Invalid Credentials');
    },
  };
  service._stopActiveWorkersAndClaims = () => { stoppedWorkers = true; };
  service._requeueOrphanManifests = () => 0;
  service._vaultEntries = () => [];
  service._isLifecycleCurrent = () => true;
  service._lifecycleGeneration = 1;
  service.isPaused = false;
  service._syncInProgress = false;

  await assert.rejects(
    async () => {
      await service.scanNow();
    },
    (err) => {
      assert.ok(err.message.includes('hết hạn') || err.message.includes('Invalid Credentials'));
      return true;
    }
  );

  assert.equal(service.status, 'error');
  assert.equal(service.scanPhase, null);
  assert.equal(service._syncInProgress, false);
  assert.equal(stoppedWorkers, true);
  assert.ok(service.lastError.includes('hết hạn') || service.lastError.includes('Invalid Credentials'));
});

test('classifyError correctly categorizes auth errors as auth', () => {
  const { classifyError } = require('../gdriveFloodController');
  assert.equal(classifyError(new Error('Token refresh failed: Bad Request')), 'auth');
  assert.equal(classifyError(new Error('invalid_grant')), 'auth');
  assert.equal(classifyError(new Error('Invalid Credentials')), 'auth');
  assert.equal(classifyError(new Error('UNAUTHENTICATED')), 'auth');
  assert.equal(classifyError(new Error('Download failed: 401 Unauthorized')), 'auth');
  assert.equal(classifyError(new Error('authError: Token has been expired or revoked')), 'auth');
});

test('checkConnection sets status = error and returns friendly error on auth failure', async () => {
  const service = Object.create(GDriveSyncService.prototype);
  service.auth = {
    clientId: 'cid',
    clientSecret: 'csec',
    refreshToken: 'rtoken',
  };
  service.api = {
    getAbout: async () => {
      throw new Error('Invalid Credentials');
    },
  };
  service.status = 'idle';

  const res = await service.checkConnection();
  assert.equal(res.ok, false);
  assert.equal(service.status, 'error');
  assert.ok(res.error.includes('hết hạn') || res.error.includes('Invalid Credentials'));
  assert.equal(service.lastError, res.error);
});


