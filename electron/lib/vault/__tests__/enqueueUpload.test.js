const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { VaultService } = require('../vaultService');
const { openIndexDb } = require('../../db/indexDb');

describe('VaultService.enqueueUpload', () => {
  let tmpDir;
  let db;
  let vault;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'enqueue-upload-test-'));
    db = openIndexDb(path.join(tmpDir, 'test.db'));
    vault = new VaultService({
      client: { invoke: async () => ({}), on: () => {}, off: () => {} },
      db,
      chatId: 100,
      queue: { add: () => Promise.resolve(), onStatusChange: null },
    });
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('skips upload when matching entry with same size and sha256 already exists', async () => {
    const filePath = path.join(tmpDir, 'sample.cbz');
    const content = 'test file content for duplicate check';
    fs.writeFileSync(filePath, content);
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    const size = Buffer.byteLength(content);

    // Seed existing entry into db
    db.upsert({
      messageId: 1,
      name: 'sample.cbz',
      path: '/manga/sample.cbz',
      size,
      sha256,
      mtime: new Date(),
    });

    // Attempt to enqueue upload with knownSha in metadata and options
    const res = await vault.enqueueUpload(filePath, '/manga/sample.cbz', {
      sha256,
      metadata: { source: 'gdrive', sha256 },
    });

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'duplicate');
  });

  test('skips upload when matching entry exists and knownSha is not provided (computes sha)', async () => {
    const filePath = path.join(tmpDir, 'sample2.cbz');
    const content = 'another test content';
    fs.writeFileSync(filePath, content);
    const sha256 = crypto.createHash('sha256').update(content).digest('hex');
    const size = Buffer.byteLength(content);

    // Seed existing entry into db
    db.upsert({
      messageId: 2,
      name: 'sample2.cbz',
      path: '/manga/sample2.cbz',
      size,
      sha256,
      mtime: new Date(),
    });

    // Attempt to enqueue upload without knownSha
    const res = await vault.enqueueUpload(filePath, '/manga/sample2.cbz');

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'duplicate');
  });

  test('skips upload when matching destPath is already active in queue', async () => {
    const filePath = path.join(tmpDir, 'sample3.cbz');
    fs.writeFileSync(filePath, 'sample 3 content');

    // Simulate an active task in queue
    vault.queue.tasks = [
      {
        kind: 'upload',
        destPath: '/manga/sample3.cbz',
        status: 'running',
        _donePromise: Promise.resolve(),
      },
    ];

    const res = await vault.enqueueUpload(filePath, '/manga/sample3.cbz');

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'already_queued');
  });

  test('skips upload when matching destPath is paused in queue', async () => {
    const filePath = path.join(tmpDir, 'sample3_paused.cbz');
    fs.writeFileSync(filePath, 'sample 3 paused content');

    vault.queue.tasks = [
      {
        kind: 'upload',
        destPath: '/manga/sample3_paused.cbz',
        status: 'paused',
        _donePromise: null,
      },
    ];

    const res = await vault.enqueueUpload(filePath, '/manga/sample3_paused.cbz');

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'already_queued');
    await assert.doesNotReject(res.done);
  });

  test('returns rejecting done promise when active task in queue fails, without unhandled rejection', async () => {
    const filePath = path.join(tmpDir, 'sample3_fail.cbz');
    fs.writeFileSync(filePath, 'sample 3 fail content');

    const failedPromise = Promise.reject(new Error('Simulated network error'));
    failedPromise.catch(() => {});

    vault.queue.tasks = [
      {
        kind: 'upload',
        destPath: '/manga/sample3_fail.cbz',
        status: 'running',
        _donePromise: failedPromise,
      },
    ];

    const res = await vault.enqueueUpload(filePath, '/manga/sample3_fail.cbz');

    assert.equal(res.skipped, true);
    assert.equal(res.reason, 'already_queued');
    await assert.rejects(res.done, /Simulated network error/);
  });

  test('_awaitUploadComplete resolves immediately when updateMessageSendSucceeded arrives without updateFile', async () => {
    let updateHandler = null;
    vault.client = {
      invoke: async () => ({}),
      on: (event, handler) => {
        if (event === 'update') updateHandler = handler;
      },
      off: (event, handler) => {
        if (event === 'update' && updateHandler === handler) updateHandler = null;
      },
    };

    const promise = vault._awaitUploadComplete(100, () => {}, null);

    assert.equal(typeof updateHandler, 'function');

    // TDLib emits updateMessageSendSucceeded directly (without separate updateFile completed)
    updateHandler({
      _: 'updateMessageSendSucceeded',
      old_message_id: 100,
      message: { id: 999 },
    });

    const realId = await promise;
    assert.equal(realId, 999);
  });
});

