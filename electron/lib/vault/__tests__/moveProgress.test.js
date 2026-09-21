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

test('moveEntries reports progress for each moved file', async () => {
  const initialFiles = [
    { messageId: 1, path: '/Old/file1.txt', size: 100, sha256: 'h1', mtime: new Date() },
    { messageId: 2, path: '/Old/file2.txt', size: 200, sha256: 'h2', mtime: new Date() },
    { messageId: 3, path: '/Old/file3.txt', size: 300, sha256: 'h3', mtime: new Date() },
  ];

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
    editPacingMs: 0,
  });

  const progressEvents = [];
  const result = await vault.moveFolder(
    '/Old/',
    '/New/',
    (progress) => progressEvents.push({ ...progress }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.completed, 3);
  assert.equal(result.total, 3);
  assert.equal(progressEvents.length, 3);
  assert.equal(progressEvents[0].current, 1);
  assert.equal(progressEvents[0].total, 3);
  assert.equal(progressEvents[2].current, 3);
  assert.equal(progressEvents[2].total, 3);

  // Verify entries in DB are updated
  const updated = db.getAll();
  assert.equal(updated.find((e) => e.messageId === 1).path, '/New/Old/file1.txt');
  assert.equal(updated.find((e) => e.messageId === 2).path, '/New/Old/file2.txt');
  assert.equal(updated.find((e) => e.messageId === 3).path, '/New/Old/file3.txt');
  assert.equal(db.journalPending().length, 0);
});

test('moveEntries aborts cleanly when cancelled via AbortSignal', async () => {
  const initialFiles = [
    { messageId: 10, path: '/Src/f1.txt', size: 10, sha256: 'h10', mtime: new Date() },
    { messageId: 20, path: '/Src/f2.txt', size: 20, sha256: 'h20', mtime: new Date() },
    { messageId: 30, path: '/Src/f3.txt', size: 30, sha256: 'h30', mtime: new Date() },
    { messageId: 40, path: '/Src/f4.txt', size: 40, sha256: 'h40', mtime: new Date() },
  ];

  const db = createMockDb(initialFiles);
  const controller = new AbortController();

  let stepCount = 0;
  const client = {
    invoke: async () => {
      stepCount++;
      if (stepCount === 2) {
        // Abort after 2nd file is processed
        controller.abort();
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
    editPacingMs: 0,
  });

  const progressEvents = [];
  const result = await vault.moveFolder(
    '/Src/',
    '/Dst/',
    (progress) => progressEvents.push({ ...progress }),
    controller.signal,
  );

  assert.equal(result.ok, false);
  assert.equal(result.cancelled, true);
  assert.equal(result.completed, 2);
  assert.equal(result.total, 4);

  // Journal should be completely clean because aborted steps were pruned
  assert.equal(db.journalPending().length, 0);

  // First 2 files were moved, last 2 files stay in /Src/
  const updated = db.getAll();
  assert.equal(updated.find((e) => e.messageId === 10).path, '/Dst/Src/f1.txt');
  assert.equal(updated.find((e) => e.messageId === 20).path, '/Dst/Src/f2.txt');
  assert.equal(updated.find((e) => e.messageId === 30).path, '/Src/f3.txt');
  assert.equal(updated.find((e) => e.messageId === 40).path, '/Src/f4.txt');
});

test('moveFolder gracefully handles "Message not found" on deleted messages without failing the whole move', async () => {
  const initialFiles = [
    { messageId: 101, path: '/Books/b1.pdf', size: 100, sha256: 'h101', mtime: new Date() },
    { messageId: 102, path: '/Books/deleted.pdf', size: 200, sha256: 'h102', mtime: new Date() },
    { messageId: 103, path: '/Books/b3.pdf', size: 300, sha256: 'h103', mtime: new Date() },
  ];

  const db = createMockDb(initialFiles);
  const client = {
    invoke: async (req) => {
      if (req.message_id === 102) {
        const err = new Error('Message not found');
        err.code = 400;
        throw err;
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
    editPacingMs: 0,
  });

  const result = await vault.moveFolder('/Books/', '/Archived/');
  assert.equal(result.ok, true);
  assert.equal(result.completed, 3);
  assert.equal(result.total, 3);

  // b1 and b3 moved successfully
  const remaining = db.getAll();
  assert.equal(remaining.find((e) => e.messageId === 101).path, '/Archived/Books/b1.pdf');
  assert.equal(remaining.find((e) => e.messageId === 103).path, '/Archived/Books/b3.pdf');
  // Ghost message 102 should have been purged from local db
  assert.equal(remaining.find((e) => e.messageId === 102), undefined);
  // Journal should be clean
  assert.equal(db.journalPending().length, 0);
});

test('moveFolder handles local folder markers (messageId <= 0) without Telegram API calls', async () => {
  const initialEntries = [
    { messageId: 0, path: '/Docs/', tags: ['work'] },
    { messageId: 201, path: '/Docs/file.txt', size: 100, sha256: 'h201', mtime: new Date() },
  ];

  const db = createMockDb(initialEntries);
  const invokedIds = [];
  const client = {
    invoke: async (req) => {
      invokedIds.push(req.message_id);
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
    editPacingMs: 0,
  });

  const result = await vault.moveFolder('/Docs/', '/Work/');
  assert.equal(result.ok, true);

  // Telegram invoke was only called for the real message (201), NOT for messageId 0
  assert.deepEqual(invokedIds, [201]);

  // Both folder marker and file are updated in db
  const entries = db.getAll();
  assert.equal(entries.find((e) => e.messageId === 0).path, '/Work/Docs/');
  assert.equal(entries.find((e) => e.messageId === 201).path, '/Work/Docs/file.txt');
  assert.equal(db.journalPending().length, 0);
});
