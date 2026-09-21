const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');

test('gdrive_cache_nodes schema and DAO operations', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-cache-db-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);
    assert.equal(typeof db.gdriveCacheNodesUpsertBatch, 'function');
    assert.equal(typeof db.gdriveCacheNodesGet, 'function');
    assert.equal(typeof db.gdriveCacheNodesQuerySubtree, 'function');
    assert.equal(typeof db.gdriveCacheNodesCount, 'function');
    assert.equal(typeof db.gdriveCacheNodesClear, 'function');

    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'f1',
        parentId: 'root',
        name: 'Report.pdf',
        mimeType: 'application/pdf',
        isFolder: 0,
        size: 1024,
        modifiedTime: '2026-09-18T10:00:00Z',
        md5Checksum: 'abc123md5',
        trashed: 0,
        shortcutTargetId: null,
        drivePath: '/Report.pdf',
      },
      {
        id: 'd1',
        parentId: 'root',
        name: 'Books',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        size: 0,
        modifiedTime: '2026-09-18T09:00:00Z',
        md5Checksum: null,
        trashed: 0,
        shortcutTargetId: null,
        drivePath: '/Books/',
      },
      {
        id: 'f2',
        parentId: 'd1',
        name: 'comic.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 2048,
        modifiedTime: '2026-09-18T09:30:00Z',
        md5Checksum: 'xyz789md5',
        trashed: 0,
        shortcutTargetId: null,
        drivePath: '/Books/comic.cbz',
      },
    ]);

    assert.equal(db.gdriveCacheNodesCount(), 3);

    const node = db.gdriveCacheNodesGet('f1');
    assert.equal(node.name, 'Report.pdf');
    assert.equal(node.drivePath, '/Report.pdf');
    assert.equal(node.size, 1024);

    const subtreeAll = db.gdriveCacheNodesQuerySubtree('/');
    assert.equal(subtreeAll.length, 3);

    const subtreeBooks = db.gdriveCacheNodesQuerySubtree('/Books/');
    assert.equal(subtreeBooks.length, 2); // Books folder and comic.cbz

    const filesInBooks = db.gdriveCacheNodesQuerySubtree('/Books/', { filesOnly: true });
    assert.equal(filesInBooks.length, 1);
    assert.equal(filesInBooks[0].name, 'comic.cbz');

    db.gdriveCacheNodesSetTrashed('f1', 1);
    const nonTrashed = db.gdriveCacheNodesQuerySubtree('/', { nonTrashedOnly: true });
    assert.equal(nonTrashed.length, 2);

    // Test gdriveCacheNodesUpdatePrefix
    db.gdriveCacheNodesUpdatePrefix('/Books/', '/Comics/');
    assert.equal(db.gdriveCacheNodesGet('d1').drivePath, '/Comics/');
    assert.equal(db.gdriveCacheNodesGet('f2').drivePath, '/Comics/comic.cbz');

    db.gdriveCacheNodesDelete('f2');
    assert.equal(db.gdriveCacheNodesGet('f2'), null);

    db.gdriveCacheNodesClear();
    assert.equal(db.gdriveCacheNodesCount(), 0);

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
