const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry, dirMarker } = require('../src/vaultEntry');
const { folderCounts } = require('../src/vaultTree');

describe('folderCounts', () => {
  it('returns zeroes for non-existent or empty folder', () => {
    const data = [
      createVaultEntry({ messageId: 1, path: '/other/file.txt', size: 10, sha256: 'a', mtime: new Date() }),
    ];
    const counts = folderCounts(data, '/docs/');
    assert.deepEqual(counts, {
      fileCount: 0,
      folderCount: 0,
      totalFiles: 0,
      totalFolders: 0,
    });
  });

  it('correctly counts direct and nested files and folders', () => {
    const data = [
      dirMarker({ messageId: 1, path: '/docs/', tags: [] }),
      createVaultEntry({ messageId: 2, path: '/docs/direct1.txt', size: 10, sha256: 'a', mtime: new Date() }),
      createVaultEntry({ messageId: 3, path: '/docs/direct2.pdf', size: 20, sha256: 'b', mtime: new Date() }),
      dirMarker({ messageId: 4, path: '/docs/sub1/', tags: [] }),
      createVaultEntry({ messageId: 5, path: '/docs/sub1/nested1.jpg', size: 30, sha256: 'c', mtime: new Date() }),
      createVaultEntry({ messageId: 6, path: '/docs/sub1/sub2/deep.zip', size: 40, sha256: 'd', mtime: new Date() }),
      dirMarker({ messageId: 7, path: '/docs/sub3/', tags: [] }),
      // Outside docs:
      createVaultEntry({ messageId: 8, path: '/photos/pic.png', size: 50, sha256: 'e', mtime: new Date() }),
    ];

    const counts = folderCounts(data, '/docs/');
    assert.equal(counts.fileCount, 2); // direct1.txt, direct2.pdf
    assert.equal(counts.folderCount, 2); // sub1, sub3
    assert.equal(counts.totalFiles, 4); // direct1.txt, direct2.pdf, nested1.jpg, deep.zip
    assert.equal(counts.totalFolders, 3); // sub1, sub1/sub2, sub3
  });

  it('excludes trash when counting at root /', () => {
    const data = [
      createVaultEntry({ messageId: 1, path: '/file_root.txt', size: 10, sha256: 'a', mtime: new Date() }),
      dirMarker({ messageId: 2, path: '/MyFolder/', tags: [] }),
      createVaultEntry({ messageId: 3, path: '/MyFolder/test.txt', size: 10, sha256: 'b', mtime: new Date() }),
      createVaultEntry({ messageId: 4, path: '/Rác/deleted.txt', size: 10, sha256: 'c', mtime: new Date() }),
    ];

    const counts = folderCounts(data, '/');
    assert.equal(counts.fileCount, 1);
    assert.equal(counts.folderCount, 1); // MyFolder only, Rác excluded
    assert.equal(counts.totalFiles, 2); // file_root.txt, /MyFolder/test.txt
  });
});
