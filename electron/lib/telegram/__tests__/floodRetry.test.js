const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseFloodWaitSeconds,
  invokeWithFloodRetry,
  wrapClientWithFloodRetry,
} = require('../floodRetry');

test('parseFloodWaitSeconds reads TDLib 429 retry-after', () => {
  const err = Object.assign(new Error('Too Many Requests: retry after 181'), { code: 429 });
  assert.equal(parseFloodWaitSeconds(err), 181);
});

test('parseFloodWaitSeconds returns null for non-flood errors', () => {
  const err = Object.assign(new Error('Not Found'), { code: 404 });
  assert.equal(parseFloodWaitSeconds(err), null);
});

test('invokeWithFloodRetry waits then retries after flood wait', async () => {
  let calls = 0;
  const sleeps = [];
  const waits = [];
  const invokeFn = async () => {
    calls += 1;
    if (calls === 1) {
      const err = Object.assign(new Error('Too Many Requests: retry after 2'), { code: 429 });
      throw err;
    }
    return { _: 'ok', calls };
  };

  const result = await invokeWithFloodRetry(invokeFn, { _: 'getChatHistory' }, {
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    onWait: (info) => waits.push(info),
  });

  assert.equal(calls, 2);
  assert.deepEqual(sleeps, [2000]);
  assert.equal(waits.length, 1);
  assert.equal(waits[0].waitSec, 2);
  assert.equal(result.calls, 2);
});

test('invokeWithFloodRetry throws after maxRetries flood waits', async () => {
  let calls = 0;
  const invokeFn = async () => {
    calls += 1;
    throw Object.assign(new Error('Too Many Requests: retry after 1'), { code: 429 });
  };

  await assert.rejects(
    () =>
      invokeWithFloodRetry(invokeFn, { _: 'getChatHistory' }, {
        maxRetries: 2,
        sleep: async () => {},
      }),
    /Too Many Requests/,
  );
  assert.equal(calls, 3);
});

test('wrapClientWithFloodRetry patches client.invoke', async () => {
  let calls = 0;
  const client = {
    invoke: async () => {
      calls += 1;
      if (calls === 1) {
        throw Object.assign(new Error('Too Many Requests: retry after 1'), { code: 429 });
      }
      return { ok: true };
    },
  };

  wrapClientWithFloodRetry(client, { sleep: async () => {} });
  const result = await client.invoke({ _: 'getMe' });
  assert.equal(calls, 2);
  assert.deepEqual(result, { ok: true });
});
