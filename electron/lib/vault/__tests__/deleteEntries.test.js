const test = require('node:test');
const assert = require('node:assert/strict');
const { VaultService } = require('../vaultService');

function createMockDb(initialEntries = []) {
  const entries = new Map(initialEntries.map((e) => [e.messageId, { ...e }]));
  const journal = [];
  let journalSeq = 1;

  return {
    getAll() {
      return [...entries.values()];
    },
    delete(id) {
      entries.delete(id);
    },
    journalAdd(op, args) {
      const id = journalSeq++;
      journal.push({ id, op, args });
      return id;
    },
    journalRemove(id) {
      const idx = journal.findIndex((j) => j.id === id);
      if (idx >= 0) journal.splice(idx, 1);
    },
    journalPending() {
      return [...journal];
    },
  };
}

test('deleteEntries: reports progress and chunks requests <= 50 ids', async () => {
  const initialFiles = [];
  for (let i = 1; i <= 65; i++) {
    initialFiles.push({ messageId: i, path: `/file_${i}.txt`, size: 100 });
  }

  const db = createMockDb(initialFiles);
  const invokeCalls = [];

  const client = {
    invoke: async (req) => {
      invokeCalls.push(req);
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
  });

  const progressEvents = [];
  const result = await vault.deleteEntries(
    initialFiles.map((f) => f.messageId),
    (progress) => progressEvents.push({ ...progress }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.deletedCount, 65);
  assert.equal(result.failedCount, 0);
  assert.equal(db.getAll().length, 0);

  // 65 files chunked by max 50 => 2 TDLib calls (50 + 15)
  assert.equal(invokeCalls.length, 2);
  assert.equal(invokeCalls[0].message_ids.length, 50);
  assert.equal(invokeCalls[1].message_ids.length, 15);

  // Check progress events
  assert.ok(progressEvents.length >= 3);
  assert.equal(progressEvents[0].done, 0);
  assert.equal(progressEvents[progressEvents.length - 1].done, 65);
  assert.equal(progressEvents[progressEvents.length - 1].percent, 100);
});

test('deleteEntries: handles partial failure gracefully', async () => {
  const initialFiles = [];
  for (let i = 1; i <= 60; i++) {
    initialFiles.push({ messageId: i, path: `/file_${i}.txt`, size: 100 });
  }

  const db = createMockDb(initialFiles);

  let callCount = 0;
  const client = {
    invoke: async (req) => {
      callCount++;
      if (callCount === 2) {
        throw new Error('Telegram network glitch');
      }
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
  });

  const result = await vault.deleteEntries(
    initialFiles.map((f) => f.messageId),
  );

  assert.equal(result.ok, false);
  assert.equal(result.deletedCount, 50);
  assert.equal(result.failedCount, 10);
  assert.equal(result.failedIds.length, 10);
  assert.match(result.error, /Telegram network glitch/);

  // 50 deleted, 10 remaining in DB
  assert.equal(db.getAll().length, 10);
});
