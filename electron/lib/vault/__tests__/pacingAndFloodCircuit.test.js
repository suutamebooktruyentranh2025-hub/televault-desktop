const test = require('node:test');
const assert = require('node:assert/strict');
const { VaultService } = require('../vaultService');
const { invokeWithFloodRetry, FloodWaitError } = require('../../telegram/floodRetry');

test('invokeWithFloodRetry caps sleep at maxWaitSec and throws FloodWaitError', async () => {
  let attemptCount = 0;
  const invokeFn = async () => {
    attemptCount++;
    const err = new Error('FLOOD_WAIT_2954');
    err.code = 429;
    throw err;
  };

  const waitEvents = [];
  await assert.rejects(
    async () => {
      await invokeWithFloodRetry(invokeFn, {}, {
        maxWaitSec: 60,
        onWait: (info) => waitEvents.push(info),
      });
    },
    (err) => {
      assert.equal(err instanceof FloodWaitError, true);
      assert.equal(err.waitSec, 2954);
      assert.equal(err.code, 429);
      return true;
    },
  );

  assert.equal(attemptCount, 1);
  assert.equal(waitEvents.length, 1);
  assert.equal(waitEvents[0].waitSec, 2954);
});

test('invokeWithFloodRetry sleeps and retries when waitSec <= maxWaitSec', async () => {
  let attemptCount = 0;
  let sleptMs = 0;

  const invokeFn = async () => {
    attemptCount++;
    if (attemptCount === 1) {
      const err = new Error('FLOOD_WAIT_5');
      err.code = 429;
      throw err;
    }
    return { ok: true };
  };

  const result = await invokeWithFloodRetry(invokeFn, {}, {
    maxWaitSec: 60,
    sleep: async (ms) => { sleptMs += ms; },
  });

  assert.equal(result.ok, true);
  assert.equal(attemptCount, 2);
  assert.equal(sleptMs, 5000);
});

test('VaultService._paceEdit enforces minimum pacing interval between edit calls', async () => {
  const db = {
    getAll: () => [],
    upsert: () => {},
    delete: () => {},
    journalAdd: () => 1,
    journalRemove: () => {},
    journalPending: () => [],
    renameFolderTagsPath: () => {},
    folderTagsIndex: () => ({}),
  };

  const invokeTimes = [];
  const client = {
    invoke: async (req) => {
      invokeTimes.push(Date.now());
      return { _: 'ok' };
    },
  };

  const queue = { onStatusChange: null, tasks: [], restorePaused() {}, clearFinished() {} };
  const vault = new VaultService({
    client,
    db,
    channel: {},
    queue,
    chatId: -100123456,
    editPacingMs: 60, // 60ms pacing for fast test execution
  });

  await vault._editCaption(1, 'test1');
  await vault._editCaption(2, 'test2');
  await vault._editCaption(3, 'test3');

  assert.equal(invokeTimes.length, 3);
  const diff1 = invokeTimes[1] - invokeTimes[0];
  const diff2 = invokeTimes[2] - invokeTimes[1];

  assert.ok(diff1 >= 50, `Diff 1 should be >= 50ms, got ${diff1}ms`);
  assert.ok(diff2 >= 50, `Diff 2 should be >= 50ms, got ${diff2}ms`);
});
