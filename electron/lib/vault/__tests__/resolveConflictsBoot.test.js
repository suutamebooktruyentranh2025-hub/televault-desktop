const test = require('node:test');
const assert = require('node:assert/strict');
const { VaultService } = require('../vaultService');

function createVaultForConflicts({ entries }) {
  const files = new Map(entries.map((e) => [e.messageId, { ...e }]));
  let invokeCount = 0;
  const db = {
    getAll: () => [...files.values()],
    upsert: (entry) => {
      files.set(entry.messageId, entry);
    },
    delete: (id) => {
      files.delete(id);
    },
  };
  const client = {
    invoke: async () => {
      invokeCount += 1;
      return {};
    },
  };
  const vault = new VaultService({
    client,
    db,
    channel: {},
    queue: { onStatusChange: null, tasks: [], restorePaused() {}, clearFinished() {} },
    chatId: -100,
  });
  return { vault, files, getInvokeCount: () => invokeCount };
}

test('resolveConflictsNow syncRemote:false updates local paths without Telegram edits', async () => {
  const sharedPath = '/dup/file.cbz';
  const { vault, files, getInvokeCount } = createVaultForConflicts({
    entries: [
      {
        messageId: 1,
        path: sharedPath,
        size: 1,
        sha256: 'a'.repeat(64),
        mtime: new Date('2024-01-01'),
        tags: [],
      },
      {
        messageId: 2,
        path: sharedPath,
        size: 1,
        sha256: 'b'.repeat(64),
        mtime: new Date('2024-01-02'),
        tags: [],
      },
    ],
  });

  await vault.resolveConflictsNow({ syncRemote: false });

  assert.equal(getInvokeCount(), 0);
  const paths = [...files.values()].map((e) => e.path).sort();
  assert.equal(paths.filter((p) => p === sharedPath).length, 1);
  assert.equal(paths.some((p) => p.includes('(conflict')), true);
});

test('resolveConflictsNow syncRemote:true edits captions on Telegram', async () => {
  const sharedPath = '/dup/file.cbz';
  const { vault, getInvokeCount } = createVaultForConflicts({
    entries: [
      {
        messageId: 1,
        path: sharedPath,
        size: 1,
        sha256: 'a'.repeat(64),
        mtime: new Date('2024-01-01'),
        tags: [],
      },
      {
        messageId: 2,
        path: sharedPath,
        size: 1,
        sha256: 'b'.repeat(64),
        mtime: new Date('2024-01-02'),
        tags: [],
      },
    ],
  });

  await vault.resolveConflictsNow({ syncRemote: true });
  assert.equal(getInvokeCount(), 1);
});
