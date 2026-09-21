const test = require('node:test');
const assert = require('node:assert/strict');
const { applyChangesToCache, isTokenExpiredError } = require('../gdriveCacheDelta');

test('isTokenExpiredError correctly identifies 410 Gone errors', () => {
  assert.equal(isTokenExpiredError({ status: 410 }), true);
  assert.equal(isTokenExpiredError(new Error('Page token is no longer valid (410)')), true);
  assert.equal(isTokenExpiredError(new Error('Rate limit exceeded 403')), false);
  assert.equal(isTokenExpiredError(null), false);
});

test('applyChangesToCache deletes removed files and marks trashed', () => {
  const store = new Map([
    ['f1', { id: 'f1', parentId: 'root', name: 'f1.txt', drivePath: '/f1.txt', trashed: 0 }],
    ['f2', { id: 'f2', parentId: 'root', name: 'f2.txt', drivePath: '/f2.txt', trashed: 0 }],
  ]);

  const mockDb = {
    gdriveCacheNodesGet(id) {
      return store.get(id) || null;
    },
    gdriveCacheNodesDelete(id) {
      store.delete(id);
    },
    gdriveCacheNodesSetTrashed(id, trashed) {
      const item = store.get(id);
      if (item) item.trashed = trashed ? 1 : 0;
    },
    gdriveCacheNodesUpsertBatch(nodes) {
      for (const n of nodes) store.set(n.id, n);
    },
    gdriveCacheNodesQuerySubtree() {
      return [];
    },
  };

  const changes = [
    { fileId: 'f1', removed: true },
    { fileId: 'f2', removed: false, file: { id: 'f2', trashed: true } },
    {
      fileId: 'f3',
      removed: false,
      file: {
        id: 'f3',
        name: 'new_file.pdf',
        parents: ['root'],
        mimeType: 'application/pdf',
        size: 512,
        modifiedTime: '2026-09-18T11:00:00Z',
        md5Checksum: 'md5f3',
      },
    },
  ];

  const stats = applyChangesToCache(changes, mockDb);
  assert.equal(stats.removedCount, 1);
  assert.equal(stats.trashedCount, 1);
  assert.equal(stats.updatedCount, 1);

  assert.equal(store.has('f1'), false);
  assert.equal(store.get('f2').trashed, 1);
  assert.equal(store.get('f3').name, 'new_file.pdf');
  assert.equal(store.get('f3').drivePath, '/new_file.pdf');
});

test('applyChangesToCache resolves nested paths for new files under existing folders', () => {
  const store = new Map([
    ['dir1', { id: 'dir1', parentId: 'root', name: 'Comics', drivePath: '/Comics/', isFolder: 1 }],
  ]);

  const mockDb = {
    gdriveCacheNodesGet(id) {
      return store.get(id) || null;
    },
    gdriveCacheNodesDelete(id) {
      store.delete(id);
    },
    gdriveCacheNodesSetTrashed(id, t) {
      const item = store.get(id);
      if (item) item.trashed = t ? 1 : 0;
    },
    gdriveCacheNodesUpsertBatch(nodes) {
      for (const n of nodes) store.set(n.id, n);
    },
    gdriveCacheNodesQuerySubtree() {
      return [];
    },
  };

  const changes = [
    {
      fileId: 'ch1',
      removed: false,
      file: {
        id: 'ch1',
        name: 'Ep1.cbz',
        parents: ['dir1'],
        mimeType: 'application/x-cbz',
        size: 1048576,
        modifiedTime: '2026-09-18T12:00:00Z',
      },
    },
  ];

  applyChangesToCache(changes, mockDb);
  assert.equal(store.get('ch1').drivePath, '/Comics/Ep1.cbz');
});

test('applyChangesToCache triggers gdriveCacheNodesUpdatePrefix when folder is renamed or moved', () => {
  const store = new Map([
    ['folder1', { id: 'folder1', parentId: 'root', name: 'OldName', drivePath: '/OldName/', isFolder: 1 }],
    ['file1', { id: 'file1', parentId: 'folder1', name: 'doc.pdf', drivePath: '/OldName/doc.pdf', isFolder: 0 }],
  ]);

  let prefixUpdated = null;
  const mockDb = {
    gdriveCacheNodesGet(id) {
      return store.get(id) || null;
    },
    gdriveCacheNodesDelete(id) {
      store.delete(id);
    },
    gdriveCacheNodesSetTrashed(id, t) {
      const item = store.get(id);
      if (item) item.trashed = t ? 1 : 0;
    },
    gdriveCacheNodesUpsertBatch(nodes) {
      for (const n of nodes) store.set(n.id, n);
    },
    gdriveCacheNodesUpdatePrefix(oldP, newP) {
      prefixUpdated = { oldP, newP };
      for (const item of store.values()) {
        if (item.drivePath.startsWith(oldP)) {
          item.drivePath = newP + item.drivePath.slice(oldP.length);
        }
      }
    },
  };

  const changes = [
    {
      fileId: 'folder1',
      removed: false,
      file: {
        id: 'folder1',
        name: 'NewName',
        parents: ['root'],
        mimeType: 'application/vnd.google-apps.folder',
      },
    },
  ];

  applyChangesToCache(changes, mockDb);

  assert.deepEqual(prefixUpdated, { oldP: '/OldName/', newP: '/NewName/' });
  assert.equal(store.get('folder1').drivePath, '/NewName/');
  assert.equal(store.get('file1').drivePath, '/NewName/doc.pdf');
});

test('applyChangesToCache sanitizes slashes in filenames and handles intradelta parent creation', () => {
  const store = new Map();
  const mockDb = {
    gdriveCacheNodesGet(id) {
      return store.get(id) || null;
    },
    gdriveCacheNodesDelete(id) {
      store.delete(id);
    },
    gdriveCacheNodesSetTrashed(id, t) {
      const item = store.get(id);
      if (item) item.trashed = t ? 1 : 0;
    },
    gdriveCacheNodesUpsertBatch(nodes) {
      for (const n of nodes) store.set(n.id, n);
    },
    gdriveCacheNodesUpdatePrefix() {},
  };

  const changes = [
    {
      fileId: 'f_parent',
      removed: false,
      file: {
        id: 'f_parent',
        name: 'Parent/Folder',
        parents: ['root'],
        mimeType: 'application/vnd.google-apps.folder',
      },
    },
    {
      fileId: 'f_child',
      removed: false,
      file: {
        id: 'f_child',
        name: 'sub\\file/test.txt',
        parents: ['f_parent'],
        mimeType: 'text/plain',
        size: 100,
      },
    },
  ];

  applyChangesToCache(changes, mockDb);

  assert.equal(store.get('f_parent').name, 'Parent_Folder');
  assert.equal(store.get('f_parent').drivePath, '/Parent_Folder/');
  assert.equal(store.get('f_child').name, 'sub_file_test.txt');
  assert.equal(store.get('f_child').drivePath, '/Parent_Folder/sub_file_test.txt');
});

