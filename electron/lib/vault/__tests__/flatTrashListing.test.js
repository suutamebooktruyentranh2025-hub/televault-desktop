const test = require('node:test');
const assert = require('node:assert/strict');
const { isInTrash, isDir, isTrashFolder, pathFromTrash } = require('@televault/core');
const { serializeEntry } = require('../../ipc/vault/vaultShared');

test('serializeEntry: includes originalPath for trashed entries and null for normal entries', () => {
  const mockDb = {
    folderTagsIndex() {
      return {};
    },
  };

  const normalEntry = {
    messageId: 101,
    path: '/GDrive/Books/Ushio.cbz',
    size: 50000000,
    sha256: 'abc123sha',
    mtime: new Date('2026-01-01T00:00:00Z'),
  };

  const trashedEntry = {
    messageId: 102,
    path: '/Rác/GDrive/Books/Ushio.cbz',
    size: 50000000,
    sha256: 'abc123sha',
    mtime: new Date('2026-01-01T00:00:00Z'),
  };

  const serializedNormal = serializeEntry(mockDb, normalEntry);
  assert.equal(serializedNormal.name, 'Ushio.cbz');
  assert.equal(serializedNormal.originalPath, null);

  const serializedTrashed = serializeEntry(mockDb, trashedEntry);
  assert.equal(serializedTrashed.name, 'Ushio.cbz');
  assert.equal(serializedTrashed.originalPath, '/GDrive/Books/Ushio.cbz');
});

test('flat trash listing logic: extracts all files in trash regardless of nesting depth', () => {
  const allEntries = [
    { messageId: 1, path: '/GDrive/Doc.pdf', size: 10 },
    { messageId: 2, path: '/Rác/GDrive/Manga/Volume 1.cbz', size: 20 },
    { messageId: 3, path: '/Rác/Deep/Nested/Folder/Sub/item.zip', size: 30 },
    { messageId: 4, path: '/Rác/root_deleted.txt', size: 40 },
    { messageId: 5, path: '/Rác/EmptyFolder/', size: 0 }, // dir marker
  ];

  const base = '/Rác/';
  assert.ok(isTrashFolder(base));

  const flatTrashFiles = allEntries.filter((e) => isInTrash(e.path) && !isDir(e));
  assert.equal(flatTrashFiles.length, 3);
  assert.deepEqual(
    flatTrashFiles.map((e) => e.path),
    [
      '/Rác/GDrive/Manga/Volume 1.cbz',
      '/Rác/Deep/Nested/Folder/Sub/item.zip',
      '/Rác/root_deleted.txt',
    ]
  );

  const restoredPaths = flatTrashFiles.map((e) => pathFromTrash(e.path));
  assert.deepEqual(restoredPaths, [
    '/GDrive/Manga/Volume 1.cbz',
    '/Deep/Nested/Folder/Sub/item.zip',
    '/root_deleted.txt',
  ]);
});
