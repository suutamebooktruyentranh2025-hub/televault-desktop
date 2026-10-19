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

test('vault:allTags returns tag index without triggering network resync', async () => {
  const handlers = {};
  const mockIpcMain = {
    handle: (name, fn) => {
      handlers[name] = fn;
    },
  };
  let channelCalled = false;
  const mockDb = {
    reconcileFolderTagsFromMarkers: () => {},
    foldersByTag: () => ({
      'Truyện xưa': ['/Others/Tiết Nhơn Quý Chinh Đông (CBZ)/'],
    }),
    allTags: () => ({
      'Truyện xưa': 5,
      'OrphanedTag': 1, // tag with no folders in foldersByTag
    }),
    allTagNames: () => ['OrphanedTag', 'Truyện xưa'],
  };
  const ctx = {
    isReady: () => true,
    getDb: () => mockDb,
    getChannel: () => ({
      resyncDirMarkers: async () => {
        channelCalled = true;
      },
    }),
  };

  registerBrowseHandlers(mockIpcMain, ctx);
  assert.ok(typeof handlers['vault:allTags'] === 'function');

  const res = await handlers['vault:allTags']({}, {});
  assert.equal(res.ok, true);
  assert.deepEqual(res.names, ['OrphanedTag', 'Truyện xưa']);
  assert.equal(res.tags['Truyện xưa'], 5);
  assert.equal(channelCalled, false, 'vault:allTags should never call channel network resync');
});
