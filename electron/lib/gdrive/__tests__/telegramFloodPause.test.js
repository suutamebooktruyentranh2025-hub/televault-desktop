const test = require('node:test');
const assert = require('node:assert/strict');
const { GDriveSyncService } = require('../gdriveSyncService');

test('_noteTelegramFlood sets pause-until from retry-after and extends later waits', () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._telegramFloodUntil = 0;
  sync_service.onChange = () => {};
  const now = 1_000_000;
  sync_service._now = () => now;

  const first = sync_service._noteTelegramFlood(
    Object.assign(new Error('Too Many Requests: retry after 16'), { code: 429 }),
  );
  assert.equal(first, 16);
  assert.equal(sync_service._telegramFloodUntil, now + 16_000);

  const shorter = sync_service._noteTelegramFlood(
    Object.assign(new Error('Too Many Requests: retry after 5'), { code: 429 }),
  );
  assert.equal(shorter, 5);
  assert.equal(sync_service._telegramFloodUntil, now + 16_000, 'shorter wait must not shrink active flood');

  const longer = sync_service._noteTelegramFlood(
    Object.assign(new Error('Too Many Requests: retry after 30'), { code: 429 }),
  );
  assert.equal(longer, 30);
  assert.equal(sync_service._telegramFloodUntil, now + 30_000);
});

test('_noteTelegramFlood ignores non-flood errors', () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._telegramFloodUntil = 0;
  sync_service.onChange = () => {};
  sync_service._now = () => 1_000_000;

  assert.equal(sync_service._noteTelegramFlood(new Error('network reset')), null);
  assert.equal(sync_service._telegramFloodUntil, 0);
});

test('_awaitTelegramFloodClear sleeps until flood window ends', async () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  const now_box = { value: 1_000_000 };
  sync_service._now = () => now_box.value;
  sync_service._telegramFloodUntil = 1_000_000 + 2500;
  const sleeps = [];
  const changes = [];
  sync_service.onChange = () => changes.push(now_box.value);
  sync_service._sleep = async (ms) => {
    sleeps.push(ms);
    now_box.value += ms;
  };

  const signal = { aborted: false, addEventListener() {}, removeEventListener() {} };
  await sync_service._awaitTelegramFloodClear(signal);

  assert.deepEqual(sleeps, [1000, 1000, 500]);
  assert.ok(now_box.value >= 1_000_000 + 2500);
  assert.equal(sync_service._telegramFloodUntil, 0);
  assert.ok(changes.length >= 3, 'should notify UI each wait tick and on clear');
});

test('_syncFile waits for telegram flood before downloading from Drive', async () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncProgress = 0;
  sync_service.onChange = () => {};
  sync_service._telegramFloodUntil = Date.now() + 60_000;
  let await_called = false;
  let download_called = false;
  sync_service._awaitTelegramFloodClear = async () => {
    await_called = true;
    sync_service._telegramFloodUntil = 0;
  };
  sync_service.db = {
    gdriveManifestGet: () => null,
    gdriveStateGet: () => '',
    gdriveManifestUpsert: () => {},
    gdriveSyncErrorRemove: () => {},
    gdriveSyncErrorAdd: () => {},
  };
  sync_service.vault = { db: { getAll: () => [] } };
  sync_service.api = {
    downloadFile: async () => {
      download_called = true;
      throw new Error('stop after download start');
    },
  };
  sync_service._sha256OfAsync = async () => 'sha';

  await assert.rejects(
    () => sync_service._syncFile({
      driveFileId: 'd1',
      fileName: 'a.cbz',
      drivePath: 'a.cbz',
      vaultPath: '/GDrive/a.cbz',
      size: 10,
      modifiedTime: 't1',
      md5Checksum: 'md5',
    }),
    /stop after download start/,
  );
  assert.equal(await_called, true);
  assert.equal(download_called, true);
});

test('getSnapshot exposes remaining telegramFloodWaitSec', () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.isPaused = false;
  sync_service.status = 'idle';
  sync_service.lastSyncAt = null;
  sync_service.pendingCount = 0;
  sync_service.totalCount = 0;
  sync_service.syncedCount = 0;
  sync_service.currentSyncFile = null;
  sync_service.currentSyncProgress = 0;
  sync_service.scanPhase = null;
  sync_service.scanInfo = null;
  sync_service.lastError = null;
  sync_service._pollIntervalMs = 0;
  sync_service._telegramFloodUntil = 1_000_000 + 12_400;
  sync_service._now = () => 1_000_000;
  sync_service.auth = { isConnected: () => true, email: null };
  sync_service.db = {
    gdriveSyncQueueGetAll: () => [],
    gdriveManifestRecent: () => [],
    gdriveSubscriptionsAll: () => [],
    gdriveSyncErrorsAll: () => [],
    gdriveStateGet: () => '',
  };
  sync_service.rateLimiter = { isThrottled: () => false, getStats: () => null };
  sync_service.throttleController = { getConcurrency: () => 1, getStats: () => ({}) };
  sync_service.getSyncTargetChatId = () => '';
  sync_service.vault = { chatId: null };

  const snap = sync_service.getSnapshot();
  assert.equal(snap.telegramFloodWaitSec, 13);
});

test('_runWorkerLoop auto-pauses when retryCount >= 3 on telegram flood throttle', async () => {
  const sync_service = Object.create(GDriveSyncService.prototype);
  let queueItems = [
    { driveFileId: 'f1', drivePath: 'book.cbz', retryCount: 3 },
  ];
  let pausedSet = false;
  sync_service._workerIdSeq = 0;
  sync_service._queueWorkerRunning = true;
  sync_service.isPaused = false;
  sync_service.status = 'syncing';
  sync_service._activeWorkers = 1;
  sync_service.auth = { isConnected: () => true };
  sync_service.scanPhase = null;
  sync_service._awaitTelegramFloodClear = async () => {};
  sync_service._sleep = async () => {};
  sync_service.setPaused = (v) => {
    pausedSet = v;
    sync_service.isPaused = v;
  };
  sync_service.onChange = () => {};
  sync_service._workerControllers = new Map();
  sync_service.db = {
    gdriveSyncQueueClaimNext: () => queueItems.shift() || null,
    gdriveSyncQueueCount: () => queueItems.length,
    gdriveSyncQueueReleaseToQueued: () => {},
    gdriveSyncQueueReleaseToQueuedIfOwner: () => {},
    gdriveSyncQueueReleaseRunningItem: () => {},
    gdriveSyncErrorAdd: () => {},
    gdriveSyncQueueIncrementRetry: () => {},
    gdriveStateSet: () => {},
  };
  sync_service.throttleController = {
    reportError: () => {},
    reportSuccess: () => {},
    shouldRetry: () => ({ retry: false, delayMs: 0 }),
    getConcurrency: () => 1,
  };
  sync_service._classifyError = () => 'throttle';
  sync_service._noteTelegramFlood = () => 16;
  sync_service._syncFile = async () => {
    throw Object.assign(new Error('Too Many Requests: retry after 16'), { code: 429 });
  };
  sync_service._adjustWorkers = () => {};

  await sync_service._runWorkerLoop();

  assert.equal(pausedSet, true, 'setPaused(true) should be called');
  assert.equal(sync_service.isPaused, true);
  assert.equal(sync_service.status, 'paused');
  assert.match(sync_service.lastError, /FLOOD_WAIT/);
});
