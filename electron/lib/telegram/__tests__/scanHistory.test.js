const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeCaption } = require('@televault/core');
const { ChannelService } = require('../channelService');

function vaultTextMessage(id, vaultPath) {
  const caption = encodeCaption({
    messageId: id,
    path: vaultPath,
    size: 1,
    sha256: 'a'.repeat(64),
    mtime: new Date('2024-01-01T00:00:00.000Z'),
    tags: [],
  });
  return {
    id,
    content: {
      _: 'messageText',
      text: { _: 'formattedText', text: caption },
    },
  };
}

function createMockDb({ lastMessageId = 0, entryCount = 0, existingIds = [] } = {}) {
  const files = new Map(existingIds.map((id) => [id, { messageId: id }]));
  let lastId = lastMessageId;
  let reconcileCalls = 0;
  return {
    files,
    get reconcileCalls() {
      return reconcileCalls;
    },
    getLastMessageId: () => lastId,
    setLastMessageId: (id) => {
      lastId = id;
    },
    countEntries: () => (entryCount > 0 ? entryCount : files.size),
    upsert: (entry) => {
      files.set(entry.messageId, entry);
    },
    reconcileToMessageIds: (validIds) => {
      reconcileCalls += 1;
      for (const id of [...files.keys()]) {
        if (!validIds.has(id)) files.delete(id);
      }
    },
  };
}

function createMockClient(pages) {
  let callIndex = 0;
  const calls = [];
  return {
    calls,
    invoke: async (request) => {
      calls.push(request);
      if (request._ !== 'getChatHistory') throw new Error(`unexpected ${request._}`);
      const page = pages[callIndex] || { messages: [] };
      callIndex += 1;
      return page;
    },
    on() {},
    off() {},
  };
}

test('scanHistory full scan when no last_message_id', async () => {
  const db = createMockDb();
  const client = createMockClient([
    { messages: [vaultTextMessage(20, '/a.txt'), vaultTextMessage(10, '/b.txt')] },
    { messages: [] },
  ]);
  const channel = new ChannelService(client, db);

  const scanned = await channel.scanHistory(1, () => {});
  assert.equal(scanned, 2);
  assert.equal(db.getLastMessageId(), 20);
  assert.equal(db.files.size, 2);
  assert.equal(db.reconcileCalls, 1);
  assert.ok(client.calls.every((c) => c.only_local === false));
});

test('scanHistory incremental stops at last_message_id and skips reconcile', async () => {
  const db = createMockDb({
    lastMessageId: 100,
    entryCount: 1,
    existingIds: [100],
  });

  const client = createMockClient([
    {
      messages: [
        vaultTextMessage(120, '/new2.txt'),
        vaultTextMessage(110, '/new1.txt'),
        vaultTextMessage(100, '/old.txt'),
        vaultTextMessage(90, '/older.txt'),
      ],
    },
  ]);
  const channel = new ChannelService(client, db);

  const scanned = await channel.scanHistory(1, () => {});
  assert.equal(scanned, 2);
  assert.equal(db.getLastMessageId(), 120);
  assert.equal(db.files.size, 3);
  assert.ok(db.files.has(110));
  assert.ok(db.files.has(120));
  assert.ok(db.files.has(100));
  assert.equal(db.reconcileCalls, 0);
  assert.equal(client.calls.length, 1);
});

test('scanHistory incremental with no new messages makes a single page call', async () => {
  const db = createMockDb({
    lastMessageId: 50,
    entryCount: 1,
    existingIds: [50],
  });

  const client = createMockClient([
    { messages: [vaultTextMessage(50, '/x.txt'), vaultTextMessage(40, '/y.txt')] },
  ]);
  const channel = new ChannelService(client, db);

  const scanned = await channel.scanHistory(1, () => {});
  assert.equal(scanned, 0);
  assert.equal(db.getLastMessageId(), 50);
  assert.equal(db.files.size, 1);
  assert.equal(db.reconcileCalls, 0);
  assert.equal(client.calls.length, 1);
});

test('scanHistory forceFull walks entire history even when local index exists', async () => {
  const db = createMockDb({
    lastMessageId: 100,
    entryCount: 1,
    existingIds: [100],
  });
  const client = createMockClient([
    {
      messages: [
        vaultTextMessage(120, '/new.txt'),
        vaultTextMessage(100, '/old.txt'),
        vaultTextMessage(80, '/missed.txt'),
      ],
    },
    { messages: [] },
  ]);
  const channel = new ChannelService(client, db);

  const scanned = await channel.scanHistory(1, () => {}, { forceFull: true });
  assert.equal(scanned, 3);
  assert.equal(db.getLastMessageId(), 120);
  assert.ok(db.files.has(80), 'force full must index messages older than last_message_id');
  assert.equal(db.reconcileCalls, 1);
  assert.ok(client.calls.length >= 1);
});
