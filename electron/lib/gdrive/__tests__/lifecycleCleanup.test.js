const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { GDriveSyncService } = require('../gdriveSyncService');

function createDeferred() {
  let pending_resolver;
  const pending_promise = new Promise((resolve) => {
    pending_resolver = resolve;
  });
  return { pending_promise, pending_resolver };
}

test('disconnect stops workers and clears all persisted sync state', () => {
  const called_actions = [];
  const first_controller = new AbortController();
  const retry_controller = new AbortController();
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._queueWorkerRunning = true;
  sync_service._activeWorkers = 2;
  sync_service._syncInProgress = true;
  sync_service._lifecycleGeneration = 4;
  sync_service._workerControllers = new Map([['worker-1', first_controller]]);
  sync_service._retryController = retry_controller;
  sync_service.pendingCount = 3;
  sync_service.lastError = new Error('old failure');
  sync_service.stopPolling = () => called_actions.push('stopPolling');
  sync_service.auth = { disconnect: () => called_actions.push('disconnectAuth') };
  sync_service.db = {
    gdriveSubscriptionsAll: () => [{ driveId: 'folder-1' }],
    gdriveSubscriptionRemove: (drive_id) => called_actions.push(`removeSub:${drive_id}`),
    gdriveManifestClear: () => called_actions.push('clearManifest'),
    gdriveSyncQueueClear: () => called_actions.push('clearQueue'),
    gdriveSyncErrorsClear: () => called_actions.push('clearErrors'),
    gdriveStateSet: (state_key, state_value) => called_actions.push(`state:${state_key}:${state_value}`),
  };
  sync_service.onChange = () => called_actions.push('change');

  sync_service.disconnect();

  assert.equal(first_controller.signal.aborted, true);
  assert.equal(retry_controller.signal.aborted, true);
  assert.equal(sync_service._queueWorkerRunning, false);
  assert.equal(sync_service._activeWorkers, 0);
  assert.equal(sync_service._syncInProgress, false);
  assert.equal(sync_service._lifecycleGeneration, 5);
  assert.equal(sync_service._workerControllers.size, 0);
  assert.equal(sync_service.pendingCount, 0);
  assert.equal(sync_service.status, 'disconnected');
  assert.equal(sync_service.lastError, null);
  assert.deepEqual(called_actions, [
    'stopPolling',
    'disconnectAuth',
    'clearQueue',
    'clearErrors',
    'state:changes_page_token:',
    'change',
  ]);
});

test('disconnect({ clearSubscriptions: true }) removes subscriptions and clears manifest', () => {
  const called_actions = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.stopPolling = () => called_actions.push('stopPolling');
  sync_service.auth = { disconnect: () => called_actions.push('disconnectAuth') };
  sync_service.db = {
    gdriveSubscriptionsAll: () => [{ driveId: 'folder-1' }],
    gdriveSubscriptionRemove: (drive_id) => called_actions.push(`removeSub:${drive_id}`),
    gdriveManifestClear: () => called_actions.push('clearManifest'),
    gdriveCacheNodesClear: () => called_actions.push('clearCacheNodes'),
    gdriveSyncQueueClear: () => called_actions.push('clearQueue'),
    gdriveSyncErrorsClear: () => called_actions.push('clearErrors'),
    gdriveStateSet: (state_key, state_value) => called_actions.push(`state:${state_key}:${state_value}`),
  };
  sync_service.onChange = () => called_actions.push('change');

  sync_service.disconnect({ clearSubscriptions: true });

  assert.deepEqual(called_actions, [
    'stopPolling',
    'disconnectAuth',
    'removeSub:folder-1',
    'clearManifest',
    'clearCacheNodes',
    'state:last_connected_email:',
    'clearQueue',
    'clearErrors',
    'state:changes_page_token:',
    'change',
  ]);
});

test('connect clears subscriptions when logging in with a different Google account', async () => {
  const called_actions = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.isPaused = false;
  sync_service.isAutoSyncEnabled = () => false;
  sync_service.auth = {
    saveCredentials: () => {},
    authorize: async () => ({ ok: true, email: 'newuser@example.com' }),
  };
  sync_service.api = {
    getChanges: async () => ({ newStartPageToken: 'token-abc' }),
  };
  sync_service.db = {
    gdriveStateGet: (k) => (k === 'last_connected_email' ? 'olduser@example.com' : null),
    gdriveStateSet: (k, v) => called_actions.push(`state:${k}:${v}`),
    gdriveSubscriptionsAll: () => [{ driveId: 'folder-1' }],
    gdriveSubscriptionRemove: (drive_id) => called_actions.push(`removeSub:${drive_id}`),
    gdriveManifestClear: () => called_actions.push('clearManifest'),
    gdriveCacheNodesClear: () => called_actions.push('clearCacheNodes'),
  };
  sync_service.onChange = () => called_actions.push('change');

  const res = await sync_service.connect('client-id', 'client-secret');

  assert.equal(res.ok, true);
  assert.deepEqual(called_actions, [
    'removeSub:folder-1',
    'clearManifest',
    'clearCacheNodes',
    'state:last_connected_email:newuser@example.com',
    'state:changes_page_token:token-abc',
    'change',
  ]);
});

test('connect preserves subscriptions when logging in with the same Google account', async () => {
  const called_actions = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.isPaused = false;
  sync_service.isAutoSyncEnabled = () => false;
  sync_service.auth = {
    saveCredentials: () => {},
    authorize: async () => ({ ok: true, email: 'sameuser@example.com' }),
  };
  sync_service.api = {
    getChanges: async () => ({ newStartPageToken: 'token-xyz' }),
  };
  sync_service.db = {
    gdriveStateGet: (k) => (k === 'last_connected_email' ? 'sameuser@example.com' : null),
    gdriveStateSet: (k, v) => called_actions.push(`state:${k}:${v}`),
    gdriveSubscriptionsAll: () => [{ driveId: 'folder-1' }],
    gdriveSubscriptionRemove: (drive_id) => called_actions.push(`removeSub:${drive_id}`),
    gdriveManifestClear: () => called_actions.push('clearManifest'),
  };
  sync_service.onChange = () => called_actions.push('change');

  const res = await sync_service.connect('client-id', 'client-secret');

  assert.equal(res.ok, true);
  // subscriptions NOT removed!
  assert.deepEqual(called_actions, [
    'state:last_connected_email:sameuser@example.com',
    'state:changes_page_token:token-xyz',
    'change',
  ]);
});

test('removeSubscription clears manifest, queue, and errors under its vault path', () => {
  const called_actions = [];
  const first_controller = new AbortController();
  const retry_controller = new AbortController();
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.auth = { isConnected: () => false };
  sync_service.isPaused = false;
  sync_service._queueWorkerRunning = true;
  sync_service._activeWorkers = 1;
  sync_service._lifecycleGeneration = 2;
  sync_service._workerControllers = new Map([['worker-1', first_controller]]);
  sync_service._retryController = retry_controller;
  sync_service.db = {
    gdriveSubscriptionsAll: () => [{
      driveId: 'folder-1',
      vaultPath: '/GDrive/Docs/',
    }],
    gdriveManifestRemoveByVaultPathPrefix: (vault_path) => called_actions.push(`manifest:${vault_path}`),
    gdriveSyncQueueRemoveByVaultPathPrefix: (vault_path) => called_actions.push(`queue:${vault_path}`),
    gdriveSyncErrorsRemoveByVaultPathPrefix: (vault_path) => called_actions.push(`errors:${vault_path}`),
    gdriveSubscriptionRemove: (drive_id) => called_actions.push(`subscription:${drive_id}`),
    gdriveSyncQueueCount: () => 4,
  };
  sync_service._folderIdCache = new Map([['folder-1', new Set(['folder-1'])]]);
  sync_service.onChange = () => called_actions.push('change');

  sync_service.removeSubscription('folder-1');

  assert.equal(sync_service.pendingCount, 4);
  assert.equal(first_controller.signal.aborted, true);
  assert.equal(retry_controller.signal.aborted, true);
  assert.equal(sync_service._queueWorkerRunning, false);
  assert.equal(sync_service._activeWorkers, 0);
  assert.equal(sync_service._lifecycleGeneration, 3);
  assert.equal(sync_service._folderIdCache.has('folder-1'), false);
  assert.deepEqual(called_actions, [
    'manifest:/GDrive/Docs/',
    'queue:/GDrive/Docs/',
    'errors:/GDrive/Docs/',
    'subscription:folder-1',
    'change',
  ]);
});

test('removeSubscription keeps sibling rows when removing a single-file subscription', () => {
  let manifest_rows = [
    { driveFileId: 'file-1', vaultPath: '/GDrive/report.pdf' },
    { driveFileId: 'file-2', vaultPath: '/GDrive/report.pdf.bak' },
  ];
  let queue_rows = [...manifest_rows];
  let error_rows = [...manifest_rows];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.auth = { isConnected: () => false };
  sync_service.isPaused = false;
  sync_service._queueWorkerRunning = false;
  sync_service._activeWorkers = 0;
  sync_service._lifecycleGeneration = 0;
  sync_service._workerControllers = new Map();
  sync_service._folderIdCache = new Map();
  sync_service.db = {
    gdriveSubscriptionsAll: () => [{
      driveId: 'file-1',
      vaultPath: '/GDrive/report.pdf',
      isFolder: false,
    }],
    gdriveManifestDelete: (drive_file_id) => {
      manifest_rows = manifest_rows.filter((manifest_row) => manifest_row.driveFileId !== drive_file_id);
    },
    gdriveSyncQueueRemove: (drive_file_id) => {
      queue_rows = queue_rows.filter((queue_row) => queue_row.driveFileId !== drive_file_id);
    },
    gdriveSyncErrorRemove: (drive_file_id) => {
      error_rows = error_rows.filter((error_row) => error_row.driveFileId !== drive_file_id);
    },
    gdriveManifestRemoveByVaultPathPrefix: (vault_path) => {
      manifest_rows = manifest_rows.filter((manifest_row) => !manifest_row.vaultPath.startsWith(vault_path));
    },
    gdriveSyncQueueRemoveByVaultPathPrefix: (vault_path) => {
      queue_rows = queue_rows.filter((queue_row) => !queue_row.vaultPath.startsWith(vault_path));
    },
    gdriveSyncErrorsRemoveByVaultPathPrefix: (vault_path) => {
      error_rows = error_rows.filter((error_row) => !error_row.vaultPath.startsWith(vault_path));
    },
    gdriveSubscriptionRemove: () => {},
    gdriveSyncQueueCount: () => queue_rows.length,
  };
  sync_service.onChange = () => {};

  sync_service.removeSubscription('file-1');

  assert.deepEqual(manifest_rows.map((manifest_row) => manifest_row.driveFileId), ['file-2']);
  assert.deepEqual(queue_rows.map((queue_row) => queue_row.driveFileId), ['file-2']);
  assert.deepEqual(error_rows.map((error_row) => error_row.driveFileId), ['file-2']);
});

test('aborting a worker during retry backoff promptly releases its owned claim', async () => {
  const backoff_started = createDeferred();
  const timer_callbacks = [];
  const released_claims = [];
  const original_set_timeout = global.setTimeout;
  const sync_item = {
    driveFileId: 'file-1',
    fileName: 'report.pdf',
    drivePath: 'Docs/report.pdf',
    vaultPath: '/GDrive/Docs/report.pdf',
    size: 42,
    modifiedTime: '2026-07-17T00:00:00.000Z',
  };
  let prompt_completion = false;
  let available_claim = true;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._queueWorkerRunning = true;
  sync_service._activeWorkers = 1;
  sync_service._workerIdSeq = 0;
  sync_service._workerControllers = new Map();
  sync_service.status = 'idle';
  sync_service._syncInProgress = false;
  sync_service.pendingCount = 1;
  sync_service.currentSyncProgress = 0;
  sync_service.auth = { isConnected: () => true };
  sync_service.throttleController = {
    getConcurrency: () => 1,
    reportError: () => {},
    shouldRetry: () => {
      backoff_started.pending_resolver();
      return { retry: true, delayMs: 60_000 };
    },
  };
  sync_service.db = {
    gdriveSyncQueueClaimNext: () => {
      if (!available_claim) return null;
      available_claim = false;
      return sync_item;
    },
    gdriveSyncQueueCount: () => 1,
    gdriveSyncQueueIncrementRetry: () => {},
    gdriveSyncQueueReleaseToQueuedIfOwner: (drive_file_id, worker_id) => {
      released_claims.push([drive_file_id, worker_id]);
    },
  };
  sync_service._syncFile = async () => {
    throw new Error('network unavailable');
  };
  sync_service._classifyError = () => 'network';
  sync_service.onChange = () => {};

  global.setTimeout = (timer_callback) => {
    timer_callbacks.push(timer_callback);
    return timer_callbacks.length;
  };

  const worker_promise = sync_service._runWorkerLoop();

  try {
    await backoff_started.pending_promise;
    const active_controller = [...sync_service._workerControllers.values()][0];
    active_controller.abort();
    for (let flush_count = 0; flush_count < 5; flush_count += 1) {
      await Promise.resolve();
    }
    prompt_completion = sync_service._workerControllers.size === 0;
  } finally {
    sync_service._queueWorkerRunning = false;
    for (const timer_callback of timer_callbacks) timer_callback();
    await worker_promise;
    global.setTimeout = original_set_timeout;
  }

  assert.equal(prompt_completion, true);
  assert.deepEqual(released_claims, [['file-1', 'gdrive-worker-1']]);
  assert.equal(sync_service._workerControllers.size, 0);
});

test('retryFile uses fresh Drive metadata without manifest md5 fallback', async () => {
  let synced_item = null;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._lifecycleGeneration = 0;
  sync_service.auth = { isConnected: () => true };
  sync_service.db = {
    gdriveSyncErrorsAll: () => [{
      driveFileId: 'file-1',
      fileName: 'report.pdf',
      drivePath: 'Docs/report.pdf',
      vaultPath: '/GDrive/Docs/report.pdf',
      size: 42,
      modifiedTime: '2026-07-16T00:00:00.000Z',
    }],
    gdriveManifestGet: () => ({ md5: 'manifest-md5' }),
  };
  sync_service.api = {
    getFile: async () => ({
      id: 'file-1',
      name: 'report-renamed.pdf',
      size: '84',
      modifiedTime: '2026-07-17T00:00:00.000Z',
      md5Checksum: 'fresh-md5',
      trashed: false,
    }),
  };
  sync_service._syncFile = async (sync_item) => { synced_item = sync_item; };
  sync_service.onChange = () => {};

  const retry_result = await sync_service.retryFile('file-1');

  assert.deepEqual(retry_result, { ok: true });
  assert.deepEqual(synced_item, {
    driveFileId: 'file-1',
    fileName: 'report-renamed.pdf',
    drivePath: 'Docs/report.pdf',
    vaultPath: '/GDrive/Docs/report.pdf',
    size: 84,
    modifiedTime: '2026-07-17T00:00:00.000Z',
    md5Checksum: 'fresh-md5',
  });
});

test('disconnect aborts retryFile during sync before upload side effects', async () => {
  const sync_started = createDeferred();
  let captured_signal = null;
  let upload_called = false;
  let connected_auth = true;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service._lifecycleGeneration = 0;
  sync_service._queueWorkerRunning = false;
  sync_service._activeWorkers = 0;
  sync_service._workerControllers = new Map();
  sync_service.pendingCount = 0;
  sync_service.auth = {
    isConnected: () => connected_auth,
    disconnect: () => { connected_auth = false; },
  };
  sync_service.api = {
    getFile: async () => ({
      id: 'file-1',
      name: 'report.pdf',
      size: '42',
      modifiedTime: '2026-07-17T00:00:00.000Z',
      md5Checksum: 'fresh-md5',
      trashed: false,
    }),
  };
  sync_service.db = {
    gdriveSyncErrorsAll: () => [{
      driveFileId: 'file-1',
      fileName: 'report.pdf',
      drivePath: 'Docs/report.pdf',
      vaultPath: '/GDrive/Docs/report.pdf',
    }],
    gdriveSubscriptionsAll: () => [],
    gdriveManifestClear: () => {},
    gdriveSyncQueueClear: () => {},
    gdriveSyncErrorsClear: () => {},
    gdriveStateSet: () => {},
  };
  sync_service._syncFile = async (sync_item, sync_signal) => {
    captured_signal = sync_signal;
    sync_started.pending_resolver();
    if (!sync_signal) throw new Error('Missing retry AbortSignal');
    await new Promise((unused_resolver, abort_rejector) => {
      sync_signal.addEventListener('abort', () => {
        const abort_error = new Error('The operation was aborted');
        abort_error.name = 'AbortError';
        abort_rejector(abort_error);
      }, { once: true });
    });
    upload_called = true;
  };
  sync_service.stopPolling = () => {};
  sync_service.onChange = () => {};

  const retry_promise = sync_service.retryFile('file-1');
  await sync_started.pending_promise;
  sync_service.disconnect();
  const retry_result = await retry_promise;

  assert.equal(captured_signal?.aborted, true);
  assert.equal(upload_called, false);
  assert.deepEqual(retry_result, { ok: false, error: 'cancelled' });
  assert.equal(sync_service.status, 'disconnected');
  assert.equal(sync_service.lastError, null);
});

test('disconnect prevents an in-flight retry from overwriting disconnected state', async () => {
  let captured_rejector;
  let connected_auth = true;
  const file_promise = new Promise((unused_resolver, delayed_rejector) => {
    captured_rejector = delayed_rejector;
  });
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service._lifecycleGeneration = 0;
  sync_service._queueWorkerRunning = false;
  sync_service._activeWorkers = 0;
  sync_service._workerControllers = new Map();
  sync_service.pendingCount = 0;
  sync_service.auth = {
    isConnected: () => connected_auth,
    disconnect: () => { connected_auth = false; },
  };
  sync_service.api = {
    getFile: async () => file_promise,
  };
  sync_service.db = {
    gdriveSyncErrorsAll: () => [{
      driveFileId: 'file-1',
      fileName: 'report.pdf',
      drivePath: 'Docs/report.pdf',
      vaultPath: '/GDrive/Docs/report.pdf',
    }],
    gdriveSubscriptionsAll: () => [],
    gdriveManifestClear: () => {},
    gdriveSyncQueueClear: () => {},
    gdriveSyncErrorsClear: () => {},
    gdriveStateSet: () => {},
  };
  sync_service.stopPolling = () => {};
  sync_service.onChange = () => {};

  const retry_promise = sync_service.retryFile('file-1');
  sync_service.disconnect();
  captured_rejector(new Error('late Drive failure'));
  const retry_result = await retry_promise;

  assert.deepEqual(retry_result, { ok: false, error: 'cancelled' });
  assert.equal(sync_service.status, 'disconnected');
  assert.equal(sync_service.lastError, null);
  assert.equal(sync_service._syncInProgress, false);
});

test('disconnect prevents an in-flight poll from restoring queue and token state', async () => {
  const changes_deferred = createDeferred();
  const state_writes = [];
  const queued_items = [];
  let connected_auth = true;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service._lifecycleGeneration = 0;
  sync_service._queueWorkerRunning = false;
  sync_service._activeWorkers = 0;
  sync_service._workerControllers = new Map();
  sync_service._folderIdCache = new Map();
  sync_service.totalCount = 0;
  sync_service.pendingCount = 0;
  sync_service.auth = {
    isConnected: () => connected_auth,
    disconnect: () => { connected_auth = false; },
  };
  sync_service.api = {
    getChanges: async () => changes_deferred.pending_promise,
  };
  sync_service.db = {
    gdriveStateGet: (state_key, default_value) => (
      state_key === 'changes_page_token' ? 'old-token' : default_value
    ),
    gdriveStateSet: (state_key, state_value) => state_writes.push([state_key, state_value]),
    gdriveSubscriptionsAll: () => [{
      driveId: 'folder-1',
      vaultPath: '/GDrive/Docs/',
      isFolder: true,
      enabled: true,
    }],
    gdriveSubscriptionRemove: () => {},
    gdriveManifestGet: () => null,
    gdriveManifestClear: () => {},
    gdriveSyncQueueAdd: (sync_item) => queued_items.push(sync_item),
    gdriveSyncQueueCount: () => queued_items.length,
    gdriveSyncQueueClear: () => { queued_items.length = 0; },
    gdriveSyncErrorsClear: () => {},
  };
  sync_service.stopPolling = () => {};
  sync_service._shouldSyncFile = () => true;
  sync_service.onChange = () => {};

  const poll_promise = sync_service._runPollSync();
  sync_service.disconnect();
  changes_deferred.pending_resolver({
    changes: [{
      fileId: 'file-1',
      file: {
        id: 'file-1',
        name: 'report.pdf',
        parents: ['folder-1'],
        size: '42',
        modifiedTime: '2026-07-17T00:00:00.000Z',
        md5Checksum: 'fresh-md5',
      },
    }],
    newStartPageToken: 'new-token',
  });
  await poll_promise;

  assert.deepEqual(queued_items, []);
  assert.deepEqual(state_writes, [['changes_page_token', '']]);
  assert.equal(sync_service.status, 'disconnected');
  assert.equal(sync_service._syncInProgress, false);
});

test('disconnect prevents an in-flight scan from enqueuing a file', async () => {
  const file_deferred = createDeferred();
  const queued_items = [];
  let connected_auth = true;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service._lifecycleGeneration = 0;
  sync_service._queueWorkerRunning = false;
  sync_service._activeWorkers = 0;
  sync_service._workerControllers = new Map();
  sync_service._folderIdCache = new Map();
  sync_service.isPaused = false;
  sync_service.auth = {
    isConnected: () => connected_auth,
    disconnect: () => { connected_auth = false; },
  };
  sync_service.api = {
    getFile: async () => file_deferred.pending_promise,
    getChanges: async () => ({ newStartPageToken: 'new-token' }),
  };
  sync_service.db = {
    gdriveSubscriptionsAll: () => [{
      driveId: 'file-1',
      drivePath: 'report.pdf',
      vaultPath: '/GDrive/report.pdf',
      isFolder: false,
      enabled: true,
    }],
    gdriveSubscriptionRemove: () => {},
    gdriveManifestGet: () => null,
    gdriveManifestClear: () => {},
    gdriveSyncQueueAdd: (sync_item) => queued_items.push(sync_item),
    gdriveSyncQueueCount: () => queued_items.length,
    gdriveSyncQueueClear: () => { queued_items.length = 0; },
    gdriveSyncErrorsClear: () => {},
    gdriveStateGet: () => '',
    gdriveStateSet: () => {},
  };
  sync_service.stopPolling = () => {};
  sync_service._shouldSyncFile = () => true;
  sync_service.onChange = () => {};

  const scan_promise = sync_service.scanNow();
  sync_service.disconnect();
  file_deferred.pending_resolver({
    id: 'file-1',
    name: 'report.pdf',
    size: '42',
    modifiedTime: '2026-07-17T00:00:00.000Z',
    md5Checksum: 'fresh-md5',
    trashed: false,
  });
  await scan_promise;

  assert.deepEqual(queued_items, []);
  assert.equal(sync_service.status, 'disconnected');
  assert.equal(sync_service._syncInProgress, false);
});

test('removeSubscription invalidates an in-flight scan before it can re-enqueue the removed file', async () => {
  const file_deferred = createDeferred();
  const queued_items = [];
  let current_subscriptions = [{
    driveId: 'file-1',
    drivePath: 'report.pdf',
    vaultPath: '/GDrive/report.pdf',
    isFolder: false,
    enabled: true,
  }];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service._syncInProgress = false;
  sync_service._lifecycleGeneration = 7;
  sync_service._queueWorkerRunning = false;
  sync_service._activeWorkers = 0;
  sync_service._workerControllers = new Map();
  sync_service._folderIdCache = new Map();
  sync_service.isPaused = false;
  sync_service.auth = { isConnected: () => true };
  sync_service.api = {
    getFile: async () => file_deferred.pending_promise,
    getChanges: async () => ({ newStartPageToken: 'new-token' }),
  };
  sync_service.db = {
    gdriveSubscriptionsAll: () => current_subscriptions,
    gdriveSubscriptionRemove: () => { current_subscriptions = []; },
    gdriveManifestGet: () => null,
    gdriveManifestDelete: () => {},
    gdriveManifestRemoveByVaultPathPrefix: () => {},
    gdriveSyncQueueAdd: (sync_item) => queued_items.push(sync_item),
    gdriveSyncQueueCount: () => queued_items.length,
    gdriveSyncQueueRemove: () => {},
    gdriveSyncQueueRemoveByVaultPathPrefix: () => { queued_items.length = 0; },
    gdriveSyncErrorRemove: () => {},
    gdriveSyncErrorsRemoveByVaultPathPrefix: () => {},
    gdriveStateGet: () => '',
    gdriveStateSet: () => {},
  };
  sync_service._startQueueWorker = () => {};
  sync_service._shouldSyncFile = () => true;
  sync_service.onChange = () => {};

  const scan_promise = sync_service.scanNow();
  sync_service.removeSubscription('file-1');
  file_deferred.pending_resolver({
    id: 'file-1',
    name: 'report.pdf',
    size: '42',
    modifiedTime: '2026-07-17T00:00:00.000Z',
    md5Checksum: 'fresh-md5',
    trashed: false,
  });
  await scan_promise;

  assert.equal(sync_service._lifecycleGeneration, 8);
  assert.equal(sync_service._syncInProgress, false);
  assert.deepEqual(queued_items, []);
});

test('_syncFile does not recreate manifest or errors after subscription removal', async () => {
  const upload_deferred = createDeferred();
  const upload_started = createDeferred();
  const temporary_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-lifecycle-'));
  const temporary_path = path.join(temporary_dir, 'report.pdf');
  const manifest_writes = [];
  const error_writes = [];
  let current_subscriptions = [{
    driveId: 'file-1',
    vaultPath: '/GDrive/report.pdf',
    isFolder: false,
  }];
  const sync_service = Object.create(GDriveSyncService.prototype);
  fs.writeFileSync(temporary_path, 'report');
  sync_service.currentSyncProgress = 0;
  sync_service._workerControllers = new Map();
  sync_service._folderIdCache = new Map();
  sync_service._queueWorkerRunning = false;
  sync_service._activeWorkers = 0;
  sync_service.isPaused = false;
  sync_service.auth = { isConnected: () => false };
  sync_service.onChange = () => {};
  sync_service._notifyProgress = () => {};
  sync_service._sha256OfAsync = async () => 'fresh-sha';
  sync_service.api = {
    downloadFile: async () => temporary_path,
  };
  sync_service.vault = {
    enqueueUpload: async () => {
      upload_started.pending_resolver();
      return {
        skipped: false,
        task: { id: 'upload-1', onProgress: () => () => {} },
        done: upload_deferred.pending_promise,
      };
    },
    queue: { cancel: () => {} },
  };
  sync_service.db = {
    gdriveSubscriptionsAll: () => current_subscriptions,
    gdriveSubscriptionRemove: () => { current_subscriptions = []; },
    gdriveManifestGet: () => null,
    gdriveManifestUpsert: (manifest_item) => manifest_writes.push(manifest_item),
    gdriveManifestDelete: () => {},
    gdriveManifestRemoveByVaultPathPrefix: () => {},
    gdriveSyncErrorAdd: (error_item) => error_writes.push(error_item),
    gdriveSyncErrorRemove: () => {},
    gdriveSyncErrorsRemoveByVaultPathPrefix: () => {},
    gdriveSyncQueueRemove: () => {},
    gdriveSyncQueueRemoveByVaultPathPrefix: () => {},
    gdriveSyncQueueReleaseAllRunning: () => {},
    gdriveSyncQueueCount: () => 0,
    gdriveStateGet: (state_key, default_value) => default_value,
    getAll: () => [],
  };

  try {
    const sync_promise = sync_service._syncFile({
      driveFileId: 'file-1',
      fileName: 'report.pdf',
      drivePath: 'report.pdf',
      vaultPath: '/GDrive/report.pdf',
      size: 6,
      modifiedTime: '2026-07-17T00:00:00.000Z',
      md5Checksum: 'fresh-md5',
    });
    await upload_started.pending_promise;
    sync_service.removeSubscription('file-1');
    upload_deferred.pending_resolver();

    await assert.rejects(sync_promise, { name: 'AbortError' });
    assert.deepEqual(manifest_writes, []);
    assert.deepEqual(error_writes, []);
  } finally {
    fs.rmSync(temporary_dir, { recursive: true, force: true });
  }
});

test('clearQueue clears database queue and resets pending count', () => {
  let cleared = false;
  let changed = false;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.pendingCount = 10;
  sync_service.db = {
    gdriveSyncQueueClear: () => {
      cleared = true;
    },
  };
  sync_service.onChange = () => {
    changed = true;
  };

  sync_service.clearQueue();

  assert.equal(cleared, true);
  assert.equal(sync_service.pendingCount, 0);
  assert.equal(changed, true);
});

test('removeQueueBatch deletes multiple items in one batch', () => {
  const removed_batches = [];
  let changed = false;
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.pendingCount = 10;
  sync_service.db = {
    gdriveSyncQueueRemoveBatch: (ids) => {
      removed_batches.push(ids);
    },
    gdriveSyncQueueCount: () => 7,
  };
  sync_service.onChange = () => {
    changed = true;
  };

  sync_service.removeQueueBatch(['id-1', 'id-2', 'id-3']);

  assert.deepEqual(removed_batches, [['id-1', 'id-2', 'id-3']]);
  assert.equal(sync_service.pendingCount, 7);
  assert.equal(changed, true);
});

