const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry, dirMarker, listFolder, sortFolderListing, buildVisibleTreeRows } = require('../src');

function f(id, path) {
  return createVaultEntry({
    messageId: id,
    path,
    size: 1,
    sha256: 'h',
    mtime: new Date(Date.UTC(2026)),
  });
}

describe('vaultTree', () => {
  const entries = [
    f(1, '/a.txt'),
    f(2, '/Truyện/One Piece/tập-01.pdf'),
    f(3, '/Truyện/One Piece/tập-02.pdf'),
    f(4, '/Truyện/Naruto/tập-01.pdf'),
    dirMarker({ messageId: 5, path: '/Trống/' }),
  ];

  it('list root', () => {
    const r = listFolder(entries, '/');
    assert.deepEqual(r.folders, ['Truyện', 'Trống']);
    assert.deepEqual(
      r.files.map((e) => e.path.slice(e.path.lastIndexOf('/') + 1)),
      ['a.txt'],
    );
  });

  it('list nested folder', () => {
    const r = listFolder(entries, '/Truyện/');
    assert.deepEqual(r.folders, ['Naruto', 'One Piece']);
    assert.equal(r.files.length, 0);
  });

  it('hides Rác from root listing', () => {
    const withTrash = [
      ...entries,
      dirMarker({ messageId: 99, path: '/Rác/' }),
      f(100, '/Rác/deleted.txt'),
    ];
    const r = listFolder(withTrash, '/');
    assert.ok(!r.folders.includes('Rác'));
  });

  it('list trash shows direct folders and files only', () => {
    const trashEntries = [
      dirMarker({ messageId: 99, path: '/Rác/' }),
      f(10, '/Rác/docs/a.txt'),
      f(11, '/Rác/b.pdf'),
      dirMarker({ messageId: 12, path: '/Rác/docs/' }),
    ];
    const r = listFolder(trashEntries, '/Rác/');
    assert.deepEqual(r.folders, ['docs']);
    assert.deepEqual(r.files.map((e) => e.path), ['/Rác/b.pdf']);
  });

  it('list trashed folder shows nested content only when opened', () => {
    const trashEntries = [
      dirMarker({ messageId: 99, path: '/Rác/' }),
      dirMarker({ messageId: 12, path: '/Rác/docs/' }),
      f(10, '/Rác/docs/a.txt'),
      f(13, '/Rác/docs/sub/b.txt'),
    ];
    const root = listFolder(trashEntries, '/Rác/');
    assert.deepEqual(root.folders, ['docs']);
    assert.deepEqual(root.files, []);

    const nested = listFolder(trashEntries, '/Rác/docs/');
    assert.deepEqual(nested.folders, ['sub']);
    assert.deepEqual(nested.files.map((e) => e.path), ['/Rác/docs/a.txt']);
  });

  it('sort files by size descending', () => {
    const sized = [
      createVaultEntry({ messageId: 1, path: '/a.txt', size: 10, sha256: 'h', mtime: new Date(Date.UTC(2026, 0, 1)) }),
      createVaultEntry({ messageId: 2, path: '/b.txt', size: 100, sha256: 'h', mtime: new Date(Date.UTC(2026, 0, 2)) }),
      createVaultEntry({ messageId: 3, path: '/c.txt', size: 1, sha256: 'h', mtime: new Date(Date.UTC(2026, 0, 3)) }),
    ];
    const base = listFolder(sized, '/');
    const sorted = sortFolderListing(base, sized, '/', { field: 'size', direction: 'desc' });
    assert.deepEqual(
      sorted.files.map((e) => e.path.slice(e.path.lastIndexOf('/') + 1)),
      ['b.txt', 'a.txt', 'c.txt'],
    );
  });

  it('buildVisibleTreeRows respects expanded set', () => {
    const rows = buildVisibleTreeRows(entries, new Set(['/Truyện/']));
    const folderPaths = rows.filter((r) => r.kind === 'folder').map((r) => r.path);
    assert.ok(folderPaths.includes('/Truyện/'));
    assert.ok(folderPaths.includes('/Truyện/Naruto/'));
  });

  it('folderMtime uses latest nested file upload', () => {
    const { folderMtime, folderSize } = require('../src/vaultTree');
    const data = [
      dirMarker({ messageId: 1, path: '/docs/', tags: [] }),
      createVaultEntry({
        messageId: 2,
        path: '/docs/old.txt',
        size: 1,
        sha256: 'h',
        mtime: new Date(Date.UTC(2026, 2, 1)),
      }),
      createVaultEntry({
        messageId: 3,
        path: '/docs/sub/new.txt',
        size: 1,
        sha256: 'h',
        mtime: new Date(Date.UTC(2026, 6, 15)),
      }),
    ];
    assert.equal(folderMtime(data, '/docs/').toISOString(), new Date(Date.UTC(2026, 6, 15)).toISOString());
    assert.equal(folderSize(data, '/docs/'), 2);
  });

  it('merges NFD and NFC folder paths into a single folder', () => {
    const nfcFolder = 'Anh N\u00f4ng D\u00e2n C\u1ea7n Ki\u1ec7m';
    const nfdFolder = nfcFolder.normalize('NFD');
    const data = [
      createVaultEntry({
        messageId: 1,
        path: `/${nfdFolder}/T01.cbz`,
        size: 100,
        sha256: 'h1',
        mtime: new Date(),
      }),
      createVaultEntry({
        messageId: 2,
        path: `/${nfcFolder}/T02.cbz`,
        size: 200,
        sha256: 'h2',
        mtime: new Date(),
      }),
    ];
    const listing = listFolder(data, '/');
    assert.equal(listing.folders.length, 1);
    assert.equal(listing.folders[0], nfcFolder);

    const subListing = listFolder(data, `/${nfcFolder}/`);
    assert.equal(subListing.files.length, 2);
  });
});
