const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { EventEmitter } = require('events');
const { PassThrough } = require('stream');
const { getResumeOffset } = require('../gdriveApi');
const { GDriveApi } = require('../gdriveApi');
const { GDriveSyncService } = require('../gdriveSyncService');

test('resume offset uses existing partial size', () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-resume-'));
  const temp_path = path.join(temp_dir, 'partial.bin');

  try {
    fs.writeFileSync(temp_path, Buffer.alloc(50));
    assert.equal(getResumeOffset(temp_path, 100), 50);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('resume offset is zero without a usable partial file', () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-resume-'));
  const temp_path = path.join(temp_dir, 'missing.bin');

  try {
    assert.equal(getResumeOffset(temp_path, 100), 0);
    fs.writeFileSync(temp_path, Buffer.alloc(50));
    assert.equal(getResumeOffset(temp_path, 0), 0);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('resume offset treats a complete partial file as complete', () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-resume-'));
  const temp_path = path.join(temp_dir, 'complete.bin');

  try {
    fs.writeFileSync(temp_path, Buffer.alloc(100));
    assert.equal(getResumeOffset(temp_path, 100), 100);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('download resumes a partial file with Range and forwards AbortSignal', async () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-resume-'));
  const temp_path = path.join(temp_dir, 'file1_file.bin');
  const abort_controller = new AbortController();
  const captured_calls = [];
  const drive_api = new GDriveApi({
    auth: { getValidToken: async () => 'token' },
  });
  drive_api._downloadStream = async (...call_args) => {
    captured_calls.push(call_args);
    // Simulate a successful Range append that completes the file
    fs.appendFileSync(temp_path, Buffer.alloc(50));
  };

  try {
    fs.writeFileSync(temp_path, Buffer.alloc(50));
    const result_path = await drive_api.downloadFile(
      'file1',
      'file.bin',
      temp_dir,
      null,
      { signal: abort_controller.signal, expectedSize: 100 },
    );

    assert.equal(result_path, temp_path);
    assert.equal(captured_calls.length, 1);
    assert.deepEqual(captured_calls[0][5].headers, {
      Authorization: 'Bearer token',
      Range: 'bytes=50-',
    });
    assert.equal(captured_calls[0][5].append, true);
    assert.equal(captured_calls[0][5].existingBytes, 50);
    assert.equal(captured_calls[0][5].expectedSize, 100);
    assert.equal(captured_calls[0][5].signal, abort_controller.signal);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('download rejects incomplete stream result and does not treat it as success', async () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-resume-'));
  const temp_path = path.join(temp_dir, 'file1_file.bin');
  const drive_api = new GDriveApi({
    auth: { getValidToken: async () => 'token' },
  });
  drive_api._downloadStream = async () => {
    fs.writeFileSync(temp_path, Buffer.alloc(50));
  };

  try {
    await assert.rejects(
      () => drive_api.downloadFile(
        'file1',
        'file.bin',
        temp_dir,
        null,
        { expectedSize: 100 },
      ),
      /size mismatch/i,
    );
    assert.equal(fs.existsSync(temp_path), true);
    assert.equal(fs.statSync(temp_path).size, 50);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('download returns an already complete partial file without requesting', async () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-resume-'));
  const temp_path = path.join(temp_dir, 'file1_file.bin');
  let request_called = false;
  const drive_api = new GDriveApi({
    auth: {
      getValidToken: async () => {
        request_called = true;
        return 'token';
      },
    },
  });

  try {
    fs.writeFileSync(temp_path, Buffer.alloc(100));
    const result_path = await drive_api.downloadFile(
      'file1',
      'file.bin',
      temp_dir,
      null,
      { expectedSize: 100 },
    );
    assert.equal(result_path, temp_path);
    assert.equal(request_called, false);
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('pausing aborts every active worker before releasing queue claims', () => {
  const event_order = [];
  const sync_service = Object.create(GDriveSyncService.prototype);
  sync_service.isPaused = false;
  sync_service.status = 'syncing';
  sync_service._queueWorkerRunning = true;
  sync_service._activeWorkers = 2;
  sync_service._workerControllers = new Map([
    ['worker-1', { abort: () => event_order.push('abort-1') }],
    ['worker-2', { abort: () => event_order.push('abort-2') }],
  ]);
  sync_service.db = {
    gdriveStateSet: () => {},
    gdriveSyncQueueReleaseAllRunning: () => event_order.push('release'),
  };
  sync_service.stopPolling = () => {};
  sync_service.onChange = () => {};

  sync_service.setPaused(true);

  assert.deepEqual(event_order, ['abort-1', 'abort-2', 'release']);
  assert.equal(sync_service._workerControllers.size, 0);
});

test('pausing cancels an active upload and prevents a successful manifest update', async () => {
  const temporary_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-upload-abort-'));
  const temporary_path = path.join(temporary_dir, 'upload.bin');
  const active_controller = new AbortController();
  const cancelled_tasks = [];
  const updated_manifests = [];
  let released_count = 0;
  const sync_service = Object.create(GDriveSyncService.prototype);

  fs.writeFileSync(temporary_path, 'upload-data');
  sync_service.isPaused = false;
  sync_service.status = 'syncing';
  sync_service._queueWorkerRunning = true;
  sync_service._activeWorkers = 1;
  sync_service._workerControllers = new Map([['worker-1', active_controller]]);
  sync_service.currentSyncProgress = 0;
  sync_service.api = {
    downloadFile: async () => temporary_path,
  };
  sync_service.db = {
    gdriveManifestGet: () => null,
    getAll: () => [],
    gdriveStateGet: () => '',
    gdriveStateSet: () => {},
    gdriveSyncQueueReleaseAllRunning: () => {
      released_count += 1;
    },
    gdriveManifestUpsert: (manifest) => updated_manifests.push(manifest),
    gdriveSyncErrorRemove: () => {},
    gdriveSyncErrorAdd: () => {},
  };
  sync_service.vault = {
    queue: {
      cancel: (cancelled_id) => cancelled_tasks.push(cancelled_id),
    },
    enqueueUpload: async () => ({
      skipped: false,
      task: {
        id: 'upload-1',
        onProgress: () => () => {},
      },
      done: new Promise((pending_resolve) => {
        setImmediate(() => {
          sync_service.setPaused(true);
          pending_resolve();
        });
      }),
    }),
  };
  sync_service._sha256OfAsync = async () => 'sha256';
  sync_service.stopPolling = () => {};
  sync_service.onChange = () => {};

  try {
    await assert.rejects(
      sync_service._syncFile({
        driveFileId: 'drive-1',
        fileName: 'upload.bin',
        drivePath: '/upload.bin',
        vaultPath: '/vault/upload.bin',
        size: 11,
        modifiedTime: '2026-07-16T00:00:00.000Z',
      }, active_controller.signal),
      { name: 'AbortError' },
    );
    assert.deepEqual(cancelled_tasks, ['upload-1']);
    assert.equal(updated_manifests.length, 0);
    assert.equal(released_count, 1);
  } finally {
    fs.rmSync(temporary_dir, { recursive: true, force: true });
  }
});

test('_sha256OfAsync hashes a file through the stream helper', async () => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-hash-'));
  const temp_path = path.join(temp_dir, 'hash.bin');
  const sync_service = Object.create(GDriveSyncService.prototype);

  try {
    fs.writeFileSync(temp_path, 'TeleVault');
    assert.equal(
      await sync_service._sha256OfAsync(temp_path),
      '21e7680191615939b237e98c520b7051655ac660f2d02dba1015c826f2969a66',
    );
  } finally {
    fs.rmSync(temp_dir, { recursive: true, force: true });
  }
});

test('_downloadStream appends 206 responses to the partial file', async (test_context) => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-stream-'));
  const temp_path = path.join(temp_dir, 'partial.bin');
  const original_request = https.request;
  test_context.after(() => {
    https.request = original_request;
    fs.rmSync(temp_dir, { recursive: true, force: true });
  });
  fs.writeFileSync(temp_path, 'first-');

  https.request = (_request_options, response_callback) => {
    const request_stream = new EventEmitter();
    request_stream.end = () => {
      const response_stream = new PassThrough();
      response_stream.statusCode = 206;
      response_stream.headers = { 'content-length': '6' };
      response_callback(response_stream);
      response_stream.end('second');
    };
    request_stream.destroy = () => {};
    return request_stream;
  };

  const drive_api = new GDriveApi({ auth: {} });
  await drive_api._downloadStream('https://example.com/file', 'token', temp_path, 0, null, {
    append: true,
    existingBytes: 6,
    expectedSize: 12,
  });

  assert.equal(fs.readFileSync(temp_path, 'utf8'), 'first-second');
});

test('_downloadStream truncates a partial file when Range is ignored', async (test_context) => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-stream-'));
  const temp_path = path.join(temp_dir, 'partial.bin');
  const original_request = https.request;
  test_context.after(() => {
    https.request = original_request;
    fs.rmSync(temp_dir, { recursive: true, force: true });
  });
  fs.writeFileSync(temp_path, 'stale-partial');

  https.request = (_request_options, response_callback) => {
    const request_stream = new EventEmitter();
    request_stream.end = () => {
      const response_stream = new PassThrough();
      response_stream.statusCode = 200;
      response_stream.headers = { 'content-length': '5' };
      response_callback(response_stream);
      response_stream.end('fresh');
    };
    request_stream.destroy = () => {};
    return request_stream;
  };

  const drive_api = new GDriveApi({ auth: {} });
  await drive_api._downloadStream('https://example.com/file', 'token', temp_path, 0, null, {
    append: true,
    existingBytes: 13,
    expectedSize: 5,
  });

  assert.equal(fs.readFileSync(temp_path, 'utf8'), 'fresh');
});

test('_downloadStream rejects AbortError and keeps downloaded partial bytes', async (test_context) => {
  const temp_dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-gdrive-stream-'));
  const temp_path = path.join(temp_dir, 'partial.bin');
  const original_request = https.request;
  const abort_controller = new AbortController();
  test_context.after(() => {
    https.request = original_request;
    fs.rmSync(temp_dir, { recursive: true, force: true });
  });

  https.request = (_request_options, response_callback) => {
    const request_stream = new EventEmitter();
    request_stream.end = () => {
      const response_stream = new PassThrough();
      response_stream.statusCode = 200;
      response_stream.headers = { 'content-length': '10' };
      response_callback(response_stream);
      response_stream.write('partial');
      setImmediate(() => abort_controller.abort());
    };
    request_stream.destroy = () => {};
    return request_stream;
  };

  const drive_api = new GDriveApi({ auth: {} });
  await assert.rejects(
    drive_api._downloadStream('https://example.com/file', 'token', temp_path, 0, null, {
      signal: abort_controller.signal,
      expectedSize: 10,
    }),
    { name: 'AbortError' },
  );
  assert.equal(fs.readFileSync(temp_path, 'utf8'), 'partial');
});
