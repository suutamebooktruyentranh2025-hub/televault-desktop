const test = require('node:test');
const assert = require('node:assert/strict');
const { registerBrowseHandlers } = require('../../ipc/vault/browseHandlers');
const { createVaultEntry } = require('@televault/core');

test('vault:getListing returns accurate single-pass folder and file listing', async () => {
  const handlers = new Map();
  const mockIpcMain = {
    handle: (channel, fn) => handlers.set(channel, fn),
  };

  const entries = [
    createVaultEntry({
      messageId: 1,
      path: '/manga/chapter1.cbz',
      size: 5000,
      mtime: new Date('2026-04-01T10:00:00Z'),
    }),
    createVaultEntry({
      messageId: 2,
      path: '/manga/chapter2.cbz',
      size: 6000,
      mtime: new Date('2026-04-02T10:00:00Z'),
    }),
    createVaultEntry({
      messageId: 3,
      path: '/anime/ep1.mkv',
      size: 20000,
      mtime: new Date('2026-03-01T10:00:00Z'),
    }),
    createVaultEntry({
      messageId: 4,
      path: '/readme.txt',
      size: 100,
      mtime: new Date('2026-04-03T10:00:00Z'),
    }),
  ];

  const mockDb = {
    getAll: () => entries,
    folderTagsIndex: () => new Map(),
  };

  const mockCtx = {
    isReady: () => true,
    getDb: () => mockDb,
  };

  registerBrowseHandlers(mockIpcMain, mockCtx);

  const getListing = handlers.get('vault:getListing');
  assert.ok(getListing, 'vault:getListing handler must be registered');

  // Test root listing
  const rootResult = await getListing(null, { folder: '/', sortField: 'name', sortDirection: 'asc' });
  assert.equal(rootResult.ok, true);
  assert.equal(rootResult.folders.length, 2);
  assert.deepEqual(rootResult.folders.map(f => f.name), ['anime', 'manga']);
  assert.equal(rootResult.files.length, 1);
  assert.equal(rootResult.files[0].name, 'readme.txt');

  const mangaFolder = rootResult.folders.find(f => f.name === 'manga');
  assert.equal(mangaFolder.size, 11000);
  assert.equal(mangaFolder.fileCount, 2);
  assert.equal(mangaFolder.totalFiles, 2);

  // Test sorting by size desc
  const sortedResult = await getListing(null, { folder: '/', sortField: 'size', sortDirection: 'desc' });
  assert.deepEqual(sortedResult.folders.map(f => f.name), ['anime', 'manga']);
});
