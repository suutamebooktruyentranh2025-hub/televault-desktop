const test = require('node:test');
const assert = require('node:assert/strict');
const { VaultService } = require('../vaultService');
const { encodeCaption } = require('@televault/core');

function createMockDb(initialEntries = []) {
  const entries = new Map(initialEntries.map((e) => [e.messageId, { ...e }]));
  const journal = [];
  let journalSeq = 1;

  return {
    getAll() {
      return [...entries.values()];
    },
    upsert(entry) {
      entries.set(entry.messageId, { ...entry });
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
    renameFolderTagsPath() {},
    folderTagsIndex() {
      return {};
    },
  };
}

test('resumePendingJournal reports progress with phase resuming and updates DB', async () => {
  const db = createMockDb();
  // Queue 3 editCaption journal entries
  db.journalAdd('editCaption', {
    messageId: 101,
    caption: encodeCaption({ messageId: 101, path: '/Dest/file1.txt', size: 10, sha256: 'h1', mtime: new Date() }),
  });
  db.journalAdd('editCaption', {
    messageId: 102,
    caption: encodeCaption({ messageId: 102, path: '/Dest/file2.txt', size: 20, sha256: 'h2', mtime: new Date() }),
  });
  db.journalAdd('editCaption', {
    messageId: 103,
    caption: encodeCaption({ messageId: 103, path: '/Dest/file3.txt', size: 30, sha256: 'h3', mtime: new Date() }),
  });

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
  const result = await vault.resumePendingJournal((progress) => {
    progressEvents.push({ ...progress });
  });

  assert.equal(result.ok, true);
  assert.equal(result.completed, 3);
  assert.equal(result.total, 3);
  assert.equal(progressEvents.length, 3);
  assert.equal(progressEvents[0].phase, 'resuming');
  assert.equal(progressEvents[0].current, 1);
  assert.equal(progressEvents[0].total, 3);
  assert.equal(progressEvents[2].current, 3);

  // Journal is now empty and files are in DB
  assert.equal(db.journalPending().length, 0);
  assert.equal(db.getAll().length, 3);
  assert.equal(db.getAll().find((e) => e.messageId === 101).path, '/Dest/file1.txt');
});

test('cancelJournalResume({ prune: true }) cancels execution and clears pending journal', async () => {
  const db = createMockDb();
  for (let i = 1; i <= 5; i++) {
    db.journalAdd('editCaption', {
      messageId: 200 + i,
      caption: encodeCaption({ messageId: 200 + i, path: `/Dest/file${i}.txt`, size: i * 10, sha256: `h${i}`, mtime: new Date() }),
    });
  }

  let stepCount = 0;
  let vaultRef = null;
  const client = {
    invoke: async () => {
      stepCount++;
      if (stepCount === 2) {
        // Cancel and prune during 2nd item
        vaultRef.cancelJournalResume({ prune: true });
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
  vaultRef = vault;

  const result = await vault.resumePendingJournal();

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.completed, 2);
  assert.equal(result.total, 5);

  // Remaining journal was pruned
  assert.equal(db.journalPending().length, 0);
});

test('cancelJournalResume({ prune: false }) cancels execution and preserves remaining journal', async () => {
  const db = createMockDb();
  for (let i = 1; i <= 5; i++) {
    db.journalAdd('editCaption', {
      messageId: 300 + i,
      caption: encodeCaption({ messageId: 300 + i, path: `/Dest/file${i}.txt`, size: i * 10, sha256: `h${i}`, mtime: new Date() }),
    });
  }

  let stepCount = 0;
  let vaultRef = null;
  const client = {
    invoke: async () => {
      stepCount++;
      if (stepCount === 2) {
        // Cancel without pruning (e.g. app shutdown)
        vaultRef.cancelJournalResume({ prune: false });
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
  vaultRef = vault;

  const result = await vault.resumePendingJournal();

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.completed, 2);

  // Remaining 3 journal entries are preserved for next boot
  assert.equal(db.journalPending().length, 3);
});
