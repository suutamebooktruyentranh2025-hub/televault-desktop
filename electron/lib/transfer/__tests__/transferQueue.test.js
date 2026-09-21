const test = require('node:test');
const assert = require('node:assert/strict');
const { TransferQueue, TransferTask } = require('../transferQueue');

test('add() rejects when the transfer fails after retries', async () => {
  const queue = new TransferQueue({
    maxConcurrent: 1,
    maxAttempts: 2,
    baseBackoffMs: 1,
    sleep: async () => {},
  });
  const task = new TransferTask({
    id: 'up:1',
    kind: 'upload',
    label: 'fail.bin',
    run: async () => {
      throw Object.assign(new Error('Too Many Requests: retry after 16'), { code: 429 });
    },
  });

  await assert.rejects(
    () => queue.add(task),
    /Too Many Requests/,
  );
  assert.equal(task.status, 'failed');
});

test('add() resolves when the transfer succeeds', async () => {
  const queue = new TransferQueue({ maxConcurrent: 1, maxAttempts: 1, pacingMs: 0 });
  const task = new TransferTask({
    id: 'up:2',
    kind: 'upload',
    label: 'ok.bin',
    run: async (report) => {
      report(1);
    },
  });

  await queue.add(task);
  assert.equal(task.status, 'done');
});

test('retries wait for Telegram flood retry-after before the next attempt', async () => {
  const sleeps = [];
  const queue = new TransferQueue({
    maxConcurrent: 1,
    maxAttempts: 2,
    baseBackoffMs: 1,
    pacingMs: 0,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  let attempts = 0;
  const task = new TransferTask({
    id: 'up:3',
    kind: 'upload',
    label: 'flood.bin',
    run: async () => {
      attempts += 1;
      throw Object.assign(new Error('Too Many Requests: retry after 16'), { code: 429 });
    },
  });

  await assert.rejects(() => queue.add(task), /Too Many Requests/);
  assert.equal(attempts, 2);
  assert.equal(sleeps[0], 16_000);
});

test('pauses queue when Telegram flood wait exhausts retries and blocks next task', async () => {
  const queue = new TransferQueue({
    maxConcurrent: 1,
    maxAttempts: 2,
    baseBackoffMs: 1,
    pacingMs: 0,
    sleep: async () => {},
  });

  const task1 = new TransferTask({
    id: 'up:fail',
    kind: 'upload',
    label: 'fail.bin',
    run: async () => {
      throw Object.assign(new Error('Too Many Requests: retry after 16'), { code: 429 });
    },
  });

  let task2Started = false;
  const task2 = new TransferTask({
    id: 'up:blocked',
    kind: 'upload',
    label: 'blocked.bin',
    run: async () => {
      task2Started = true;
    },
  });

  const p1 = assert.rejects(() => queue.add(task1), /Too Many Requests/);
  const p2 = queue.add(task2);

  await p1;
  assert.equal(queue.isPaused, true);
  assert.equal(task2Started, false);
  assert.equal(task2.status, 'queued');

  // Resume should unpause and execute task2
  queue.resume();
  assert.equal(queue.isPaused, false);
  await p2;
  assert.equal(task2Started, true);
  assert.equal(task2.status, 'done');
});

test('applies pacing delay on successful upload', async () => {
  const sleeps = [];
  const queue = new TransferQueue({
    maxConcurrent: 1,
    maxAttempts: 1,
    pacingMs: 1500,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });

  const task = new TransferTask({
    id: 'up:paced',
    kind: 'upload',
    label: 'paced.bin',
    run: async () => {},
  });

  await queue.add(task);
  assert.equal(task.status, 'done');
  assert.deepEqual(sleeps, [1500]);
});
