const test = require('node:test');
const assert = require('node:assert/strict');
const { GDriveSyncService } = require('../gdriveSyncService');
const { createSpeedTracker } = require('../../transfer/transferMetrics');

function makeService() {
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.currentSyncFile = 'big.bin';
  sync_service.currentSyncProgress = 0.2;
  sync_service._currentSpeedBps = 0;
  sync_service._syncPhase = 'download';
  sync_service._lastProgressNotifyAt = 0;
  sync_service._now = () => 1_000_000;
  sync_service.onChange = () => {
    throw new Error('onChange must not run from _notifyProgress');
  };
  sync_service.onProgress = () => {};
  return sync_service;
}

test('_notifyProgress emits light onProgress payload and does not call onChange', () => {
  const sync_service = makeService();
  const payloads = [];
  sync_service.onProgress = (payload) => payloads.push(payload);
  sync_service._currentSpeedBps = 2_500_000;
  sync_service._downloadFraction = 0.4;
  sync_service._uploadFraction = 0;

  sync_service._notifyProgress();

  assert.equal(payloads.length, 1);
  assert.deepEqual(payloads[0], {
    currentSyncFile: 'big.bin',
    currentSyncProgress: 0.2,
    speedBps: 2_500_000,
    syncPhase: 'download',
    downloadProgress: 0.4,
    uploadProgress: 0,
    activeTasks: [],
  });
});

test('_notifyProgress throttles to ~200ms', () => {
  const sync_service = makeService();
  const payloads = [];
  sync_service.onProgress = (payload) => payloads.push(payload);
  let now = 1_000_000;
  sync_service._now = () => now;

  sync_service._notifyProgress();
  now += 100;
  sync_service._notifyProgress();
  now += 150;
  sync_service._notifyProgress();

  assert.equal(payloads.length, 2);
});

test('getProgressSnapshot exposes download and upload fractions separately', () => {
  const sync_service = makeService();
  sync_service._currentSpeedBps = 1_024_000;
  sync_service._downloadFraction = 1;
  sync_service._uploadFraction = 0.25;
  sync_service._syncPhase = 'upload';
  sync_service.currentSyncProgress = 0.625;
  assert.deepEqual(sync_service.getProgressSnapshot(), {
    currentSyncFile: 'big.bin',
    currentSyncProgress: 0.625,
    speedBps: 1_024_000,
    syncPhase: 'upload',
    downloadProgress: 1,
    uploadProgress: 0.25,
    activeTasks: [],
  });
});

test('_noteDownloadProgress sets phase download and updates speed', () => {
  const sync_service = makeService();
  const payloads = [];
  sync_service.onProgress = (payload) => payloads.push(payload);
  let fake_now = 1_000_000;
  sync_service._downloadSpeedTracker = createSpeedTracker({ now: () => fake_now });
  sync_service._lastProgressNotifyAt = 0;
  sync_service._now = () => fake_now;
  sync_service._syncPhase = null;
  sync_service._downloadFraction = 0;
  sync_service._uploadFraction = 0;

  sync_service._noteDownloadProgress(0, 10_000_000);
  fake_now += 1000;
  sync_service._noteDownloadProgress(0.5, 10_000_000);

  assert.equal(sync_service._syncPhase, 'download');
  assert.equal(sync_service._downloadFraction, 0.5);
  assert.equal(sync_service._uploadFraction, 0);
  assert.equal(sync_service.currentSyncProgress, 0.25);
  assert.ok(sync_service._currentSpeedBps > 0);
  assert.ok(payloads.length >= 1);
  const last = payloads[payloads.length - 1];
  assert.ok(last.speedBps > 0);
  assert.equal(last.currentSyncProgress, 0.25);
  assert.equal(last.syncPhase, 'download');
  assert.equal(last.downloadProgress, 0.5);
  assert.equal(last.uploadProgress, 0);
});

test('_noteUploadProgress sets phase upload and uses Telegram speedBps', () => {
  const sync_service = makeService();
  const payloads = [];
  sync_service.onProgress = (payload) => payloads.push(payload);
  sync_service._lastProgressNotifyAt = 0;
  sync_service._syncPhase = 'download';
  sync_service._downloadFraction = 1;
  sync_service._uploadFraction = 0;

  sync_service._noteUploadProgress(0.4, 180_000);

  assert.equal(sync_service._syncPhase, 'upload');
  assert.equal(sync_service._downloadFraction, 1);
  assert.equal(sync_service._uploadFraction, 0.4);
  assert.equal(sync_service.currentSyncProgress, 0.7);
  assert.equal(sync_service._currentSpeedBps, 180_000);
  assert.equal(payloads[0].syncPhase, 'upload');
  assert.equal(payloads[0].speedBps, 180_000);
  assert.equal(payloads[0].downloadProgress, 1);
  assert.equal(payloads[0].uploadProgress, 0.4);
});

test('_noteHashProgress sets phase hash, download complete, upload pending', () => {
  const sync_service = makeService();
  const payloads = [];
  sync_service.onProgress = (payload) => payloads.push(payload);
  sync_service._lastProgressNotifyAt = 0;
  sync_service._currentSpeedBps = 5_000_000;
  sync_service.currentSyncProgress = 0.5;
  sync_service._downloadFraction = 0.9;
  sync_service._uploadFraction = 0;

  sync_service._noteHashProgress();

  assert.equal(sync_service._syncPhase, 'hash');
  assert.equal(sync_service._currentSpeedBps, 0);
  assert.equal(sync_service._downloadFraction, 1);
  assert.equal(sync_service._uploadFraction, 0);
  assert.equal(payloads[0].syncPhase, 'hash');
  assert.equal(payloads[0].speedBps, 0);
  assert.equal(payloads[0].downloadProgress, 1);
  assert.equal(payloads[0].uploadProgress, 0);
});

test('multi-worker progress tracks individual tasks without speed or progress collision', () => {
  const sync_service = makeService();
  sync_service._activeWorkersMap = new Map();
  sync_service._activeWorkersMap.set('w1', {
    workerId: 'w1',
    driveFileId: 'id-1',
    fileName: 'file1.cbz',
    size: 10_000_000,
    phase: 'download',
    progress: 0,
    speedBps: 0,
  });
  sync_service._activeWorkersMap.set('w2', {
    workerId: 'w2',
    driveFileId: 'id-2',
    fileName: 'file2.cbz',
    size: 20_000_000,
    phase: 'download',
    progress: 0,
    speedBps: 0,
  });

  let fake_now = 1_000_000;
  sync_service._now = () => fake_now;
  sync_service._lastProgressNotifyAt = 0;

  // Initial updates at t=0
  sync_service._noteDownloadProgress(0.1, 10_000_000, 'w1');
  sync_service._noteDownloadProgress(0.5, 20_000_000, 'w2');

  fake_now += 1000;
  // Progress updates at t=1s
  sync_service._noteDownloadProgress(0.2, 10_000_000, 'w1'); // 1MB downloaded in 1s = 1MB/s
  sync_service._noteDownloadProgress(0.6, 20_000_000, 'w2'); // 2MB downloaded in 1s = 2MB/s

  const t1 = sync_service._activeWorkersMap.get('w1');
  const t2 = sync_service._activeWorkersMap.get('w2');

  assert.equal(t1.phase, 'download');
  assert.equal(t1.progress, 0.2);
  assert.ok(t1.speedBps > 0, `t1 speed should be > 0, got ${t1.speedBps}`);

  assert.equal(t2.phase, 'download');
  assert.equal(t2.progress, 0.6);
  assert.ok(t2.speedBps > 0, `t2 speed should be > 0, got ${t2.speedBps}`);
});

