const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const { dirMarker, createVaultEntry } = require('@televault/core');
const { registerBrowseHandlers } = require('../browseHandlers');

test('vault:getFoldersDetails returns metadata for requested folder paths', async () => {
  const all = [
    dirMarker({ messageId: 10, path: '/Others/A-BOUT! Phần 2 (CBZ)/', tags: ['Học đường'] }),
    createVaultEntry({
      messageId: 101,
      path: '/Others/A-BOUT! Phần 2 (CBZ)/Chap 01.cbz',
      size: 5000,
      sha256: 'a'.repeat(64),
      mtime: new Date('2024-05-01T10:00:00.000Z'),
      tags: [],
    }),
    createVaultEntry({
      messageId: 102,
      path: '/Others/A-BOUT! Phần 2 (CBZ)/Chap 02.cbz',
      size: 7000,
      sha256: 'b'.repeat(64),
      mtime: new Date('2024-05-02T10:00:00.000Z'),
      tags: [],
    }),
  ];

  const handlers = {};
  const mockIpcMain = {
    handle: (name, fn) => {
      handlers[name] = fn;
    },
  };
  const ctx = {
    isReady: () => true,
    getDb: () => ({
      getAll: () => all,
    }),
  };

  registerBrowseHandlers(mockIpcMain, ctx);

    assert.ok(typeof handlers['vault:getFoldersDetails'] === 'function');

    const res = await handlers['vault:getFoldersDetails']({}, {
      paths: ['/Others/A-BOUT! Phần 2 (CBZ)/', '/Nonexistent/'],
    });

    assert.equal(res.ok, true);
    assert.equal(res.folders.length, 2);

    const aboutFolder = res.folders[0];
    assert.equal(aboutFolder.path, '/Others/A-BOUT! Phần 2 (CBZ)/');
    assert.equal(aboutFolder.name, 'A-BOUT! Phần 2 (CBZ)');
    assert.equal(aboutFolder.size, 12000);
    assert.equal(aboutFolder.fileCount, 2);
    assert.equal(aboutFolder.totalFiles, 2);
    assert.equal(aboutFolder.mtime, new Date('2024-05-02T10:00:00.000Z').toISOString());

    const emptyFolder = res.folders[1];
    assert.equal(emptyFolder.path, '/Nonexistent/');
    assert.equal(emptyFolder.name, 'Nonexistent');
    assert.equal(emptyFolder.size, 0);
    assert.equal(emptyFolder.fileCount, 0);
});
