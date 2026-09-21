const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  buildFolderListingMetadata,
  folderMtime,
  folderSize,
  folderCounts,
  listFolder,
  sortFolderListing,
} = require('../src/vaultTree');

function makeEntry(path, size = 1000, mtime = new Date('2026-01-01T00:00:00Z'), isDirectory = false) {
  return {
    messageId: Math.floor(Math.random() * 100000),
    path,
    size: isDirectory ? 0 : size,
    mtime,
    uploadedAt: mtime,
    fileId: 'mock_file_id',
    source: isDirectory ? 'dir' : 'file',
  };
}

describe('buildFolderListingMetadata', () => {
  it('matches folderMtime, folderSize, and folderCounts for root listing', () => {
    const data = [
      makeEntry('/docs/resume.pdf', 500, new Date('2026-03-01T12:00:00Z')),
      makeEntry('/docs/cover.pdf', 300, new Date('2026-03-02T15:00:00Z')),
      makeEntry('/docs/sub/notes.txt', 200, new Date('2026-03-05T09:00:00Z')),
      makeEntry('/photos/vacation.jpg', 1500, new Date('2026-02-10T10:00:00Z')),
      makeEntry('/photos/sub1/sub2/pic.png', 2500, new Date('2026-02-20T10:00:00Z')),
      makeEntry('/empty_folder/', 0, new Date('2026-01-01T00:00:00Z'), true),
      makeEntry('/root_file.zip', 4000, new Date('2026-03-10T00:00:00Z')),
      makeEntry('/Rác/deleted.txt', 999, new Date('2026-03-15T00:00:00Z')),
    ];

    const currentFolder = '/';
    const listing = listFolder(data, currentFolder);
    assert.deepEqual(listing.folders.sort(), ['docs', 'empty_folder', 'photos'].sort());

    const { folderMetadataMap, currentCounts } = buildFolderListingMetadata(data, currentFolder, listing.folders);

    // Verify currentCounts matches folderCounts(data, '/')
    const expectedCurrentCounts = folderCounts(data, currentFolder);
    assert.deepEqual(currentCounts, expectedCurrentCounts);

    // Verify each subfolder matches individual helpers
    for (const folderName of listing.folders) {
      const folderPath = `${currentFolder}${folderName}/`;
      const metadata = folderMetadataMap.get(folderName);
      assert.ok(metadata, `Missing metadata for ${folderName}`);

      const expectedMtime = folderMtime(data, folderPath);
      const expectedSize = folderSize(data, folderPath);
      const expectedCounts = folderCounts(data, folderPath);

      assert.equal(metadata.mtime.getTime(), expectedMtime.getTime(), `Mtime mismatch for ${folderName}`);
      assert.equal(metadata.size, expectedSize, `Size mismatch for ${folderName}`);
      assert.equal(metadata.fileCount, expectedCounts.fileCount, `fileCount mismatch for ${folderName}`);
      assert.equal(metadata.folderCount, expectedCounts.folderCount, `folderCount mismatch for ${folderName}`);
      assert.equal(metadata.totalFiles, expectedCounts.totalFiles, `totalFiles mismatch for ${folderName}`);
      assert.equal(metadata.totalFolders, expectedCounts.totalFolders, `totalFolders mismatch for ${folderName}`);
    }
  });

  it('matches for nested folder listing', () => {
    const data = [
      makeEntry('/projects/frontend/src/index.js', 1200, new Date('2026-05-01T10:00:00Z')),
      makeEntry('/projects/frontend/package.json', 350, new Date('2026-05-02T11:00:00Z')),
      makeEntry('/projects/backend/server.js', 2400, new Date('2026-05-03T12:00:00Z')),
      makeEntry('/projects/readme.md', 150, new Date('2026-05-04T13:00:00Z')),
    ];

    const currentFolder = '/projects/';
    const listing = listFolder(data, currentFolder);
    assert.deepEqual(listing.folders.sort(), ['backend', 'frontend'].sort());

    const { folderMetadataMap, currentCounts } = buildFolderListingMetadata(data, currentFolder, listing.folders);

    const expectedCurrentCounts = folderCounts(data, currentFolder);
    assert.deepEqual(currentCounts, expectedCurrentCounts);

    for (const folderName of listing.folders) {
      const folderPath = `${currentFolder}${folderName}/`;
      const metadata = folderMetadataMap.get(folderName);
      assert.ok(metadata);

      assert.equal(metadata.mtime.getTime(), folderMtime(data, folderPath).getTime());
      assert.equal(metadata.size, folderSize(data, folderPath));
      assert.deepEqual(
        {
          fileCount: metadata.fileCount,
          folderCount: metadata.folderCount,
          totalFiles: metadata.totalFiles,
          totalFolders: metadata.totalFolders,
        },
        folderCounts(data, folderPath)
      );
    }
  });

  it('handles sortFolderListing with folderMetadataMap in O(1)', () => {
    const data = [
      makeEntry('/a/big.bin', 10000, new Date('2026-01-01T00:00:00Z')),
      makeEntry('/b/small.bin', 100, new Date('2026-06-01T00:00:00Z')),
      makeEntry('/file1.txt', 50, new Date('2026-02-01T00:00:00Z')),
    ];

    const listing = listFolder(data, '/');
    const { folderMetadataMap } = buildFolderListingMetadata(data, '/', listing.folders);

    const sortedBySize = sortFolderListing(listing, data, '/', {
      field: 'size',
      direction: 'desc',
      folderMetadataMap,
    });
    assert.deepEqual(sortedBySize.folders, ['a', 'b']);

    const sortedByMtime = sortFolderListing(listing, data, '/', {
      field: 'mtime',
      direction: 'desc',
      folderMetadataMap,
    });
    assert.deepEqual(sortedByMtime.folders, ['b', 'a']);
  });
});
