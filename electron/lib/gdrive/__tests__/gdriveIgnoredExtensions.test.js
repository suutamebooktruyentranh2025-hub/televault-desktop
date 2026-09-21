const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');
const { shouldSyncFileName } = require('../gdriveFileDownloader');
const { GDriveSyncService } = require('../gdriveSyncService');

test('shouldSyncFileName unit tests', () => {
  // Empty filters
  assert.equal(shouldSyncFileName('book.mobi'), true);
  assert.equal(shouldSyncFileName('file_without_ext'), true);

  // Ignored extensions
  assert.equal(shouldSyncFileName('book.mobi', { ignored: 'mobi, pdf' }), false);
  assert.equal(shouldSyncFileName('book.MOBI', { ignored: 'mobi, pdf' }), false);
  assert.equal(shouldSyncFileName('doc.PDF', { ignored: '.mobi, .pdf' }), false);
  assert.equal(shouldSyncFileName('doc.pdf', { ignored: 'mobi, pdf' }), false);
  assert.equal(shouldSyncFileName('comic.cbz', { ignored: 'mobi, pdf' }), true);
  assert.equal(shouldSyncFileName('novel.epub', { ignored: 'mobi, pdf' }), true);

  // Allowed extensions
  assert.equal(shouldSyncFileName('comic.cbz', { allowed: 'cbz, cbr' }), true);
  assert.equal(shouldSyncFileName('novel.epub', { allowed: 'cbz, cbr' }), false);
  assert.equal(shouldSyncFileName('book.mobi', { allowed: 'cbz, cbr' }), false);
  assert.equal(shouldSyncFileName('no_ext', { allowed: 'cbz, cbr' }), true);
});

test('gdriveCacheQueryFiles and gdriveCacheSummaryStats with ignored_extensions', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-ignored-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = openIndexDb(dbPath);

  try {
    // 1. Populate cache nodes
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'folder_root',
        parentId: null,
        name: 'My Drive',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        size: 0,
        modifiedTime: '2026-01-01T00:00:00Z',
        trashed: 0,
        drivePath: '/',
      },
      {
        id: 'file_mobi',
        parentId: 'folder_root',
        name: 'TheHobbit.mobi',
        mimeType: 'application/x-mobipocket-ebook',
        isFolder: 0,
        size: 5000,
        modifiedTime: '2026-01-01T00:00:00Z',
        trashed: 0,
        drivePath: '/TheHobbit.mobi',
      },
      {
        id: 'file_pdf',
        parentId: 'folder_root',
        name: 'Manual.PDF',
        mimeType: 'application/pdf',
        isFolder: 0,
        size: 8000,
        modifiedTime: '2026-01-01T00:00:00Z',
        trashed: 0,
        drivePath: '/Manual.PDF',
      },
      {
        id: 'file_cbz',
        parentId: 'folder_root',
        name: 'Comic.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 12000,
        modifiedTime: '2026-01-01T00:00:00Z',
        trashed: 0,
        drivePath: '/Comic.cbz',
      },
      {
        id: 'file_gdoc',
        parentId: 'folder_root',
        name: 'Notes',
        mimeType: 'application/vnd.google-apps.document',
        isFolder: 0,
        size: 0,
        modifiedTime: '2026-01-01T00:00:00Z',
        trashed: 0,
        drivePath: '/Notes',
      },
    ]);

    // Before setting ignored_extensions:
    // mobi, pdf, cbz are pending (3). gdoc is skipped (1).
    let stats = db.gdriveCacheSummaryStats();
    assert.equal(stats.totalFiles, 4);
    assert.equal(stats.totalFolders, 1);
    assert.equal(stats.pendingCount, 3);
    assert.equal(stats.skippedCount, 1);

    // 2. Set ignored_extensions = 'mobi, pdf'
    db.gdriveStateSet('ignored_extensions', 'mobi, pdf');

    stats = db.gdriveCacheSummaryStats();
    // Now: mobi, pdf, gdoc are skipped (3). Only cbz is pending (1).
    assert.equal(stats.pendingCount, 1);
    assert.equal(stats.skippedCount, 3);

    // 3. Query files with status filter
    const skippedFiles = db.gdriveCacheQueryFiles({ status: 'skipped' });
    assert.equal(skippedFiles.total, 3);
    const skippedNames = skippedFiles.items.map((i) => i.name).sort();
    assert.deepEqual(skippedNames, ['Manual.PDF', 'Notes', 'TheHobbit.mobi']);

    const pendingFiles = db.gdriveCacheQueryFiles({ status: 'pending' });
    assert.equal(pendingFiles.total, 1);
    assert.equal(pendingFiles.items[0].name, 'Comic.cbz');

    // 4. Test allowed_extensions overrides
    db.gdriveStateSet('ignored_extensions', '');
    db.gdriveStateSet('allowed_extensions', 'cbz');

    stats = db.gdriveCacheSummaryStats();
    // Only cbz is allowed! mobi, pdf, gdoc are skipped (3).
    assert.equal(stats.pendingCount, 1);
    assert.equal(stats.skippedCount, 3);

    const allowedPending = db.gdriveCacheQueryFiles({ status: 'pending' });
    assert.equal(allowedPending.total, 1);
    assert.equal(allowedPending.items[0].name, 'Comic.cbz');
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('purgeIgnoredQueueItems removes ignored items from sync queue', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-purge-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = openIndexDb(dbPath);

  try {
    db.gdriveStateSet('ignored_extensions', 'mobi, pdf');

    // Enqueue 3 items
    db.gdriveSyncQueueAdd({
      driveFileId: 'item-1',
      fileName: 'book.mobi',
      drivePath: '/book.mobi',
      vaultPath: '/GDrive/book.mobi',
      size: 1000,
      modifiedTime: '2026-01-01T00:00:00Z',
    });
    db.gdriveSyncQueueAdd({
      driveFileId: 'item-2',
      fileName: 'doc.pdf',
      drivePath: '/doc.pdf',
      vaultPath: '/GDrive/doc.pdf',
      size: 2000,
      modifiedTime: '2026-01-01T00:00:00Z',
    });
    db.gdriveSyncQueueAdd({
      driveFileId: 'item-3',
      fileName: 'comic.cbz',
      drivePath: '/comic.cbz',
      vaultPath: '/GDrive/comic.cbz',
      size: 3000,
      modifiedTime: '2026-01-01T00:00:00Z',
    });

    assert.equal(db.gdriveSyncQueueCount(), 3);

    const service = new GDriveSyncService({ db, vault: {} });
    const removedCount = service.purgeIgnoredQueueItems();

    assert.equal(removedCount, 2);
    assert.equal(db.gdriveSyncQueueCount(), 1);

    const remaining = db.gdriveSyncQueueGetAll();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].fileName, 'comic.cbz');
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('gdriveCacheFolderChildren and gdriveCacheFolderTree with hideIgnored', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-folder-ignored-test-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const db = openIndexDb(dbPath);

  try {
    db.gdriveStateSet('ignored_extensions', 'mobi, pdf');

    // Create a parent folder and child nodes
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir_books',
        parentId: 'root',
        name: 'Books',
        isFolder: 1,
        drivePath: '/Books',
      },
      {
        id: 'file_mobi',
        parentId: 'dir_books',
        name: 'Ebook.mobi',
        mimeType: 'application/x-mobipocket-ebook',
        isFolder: 0,
        size: 5000,
        drivePath: '/Books/Ebook.mobi',
      },
      {
        id: 'file_pdf',
        parentId: 'dir_books',
        name: 'Manual.pdf',
        mimeType: 'application/pdf',
        isFolder: 0,
        size: 8000,
        drivePath: '/Books/Manual.pdf',
      },
      {
        id: 'file_cbz',
        parentId: 'dir_books',
        name: 'Comic.cbz',
        mimeType: 'application/x-cbz',
        isFolder: 0,
        size: 12000,
        drivePath: '/Books/Comic.cbz',
      },
    ]);

    // Also insert a folder with ONLY ignored files and an empty folder
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir_ignored_only',
        parentId: 'root',
        name: 'IgnoredFolder',
        isFolder: 1,
        drivePath: '/IgnoredFolder',
      },
      {
        id: 'file_mobi_only',
        parentId: 'dir_ignored_only',
        name: 'Doc.mobi',
        mimeType: 'application/x-mobipocket-ebook',
        isFolder: 0,
        size: 3000,
        drivePath: '/IgnoredFolder/Doc.mobi',
      },
      {
        id: 'dir_empty',
        parentId: 'root',
        name: 'EmptyFolder',
        isFolder: 1,
        drivePath: '/EmptyFolder',
      },
      {
        id: 'dir_parent_empty_child',
        parentId: 'root',
        name: 'ParentFolder',
        isFolder: 1,
        drivePath: '/ParentFolder',
      },
      {
        id: 'dir_child_of_parent',
        parentId: 'dir_parent_empty_child',
        name: 'ChildIgnoredOnly',
        isFolder: 1,
        drivePath: '/ParentFolder/ChildIgnoredOnly',
      },
      {
        id: 'file_child_pdf',
        parentId: 'dir_child_of_parent',
        name: 'ChildDoc.pdf',
        mimeType: 'application/pdf',
        isFolder: 0,
        size: 2000,
        drivePath: '/ParentFolder/ChildIgnoredOnly/ChildDoc.pdf',
      },
    ]);

    // Invalidate cache to test clean query
    db.invalidateFolderRollupCache();

    // 1. With hideIgnored = true (default)
    const hiddenRes = db.gdriveCacheFolderChildren({ parentId: 'dir_books', hideIgnored: true });
    assert.equal(hiddenRes.total, 1);
    assert.equal(hiddenRes.items.length, 1);
    assert.equal(hiddenRes.items[0].name, 'Comic.cbz');

    // 2. With hideIgnored = false
    const shownRes = db.gdriveCacheFolderChildren({ parentId: 'dir_books', hideIgnored: false });
    assert.equal(shownRes.total, 3);
    assert.equal(shownRes.items.length, 3);
    const names = shownRes.items.map((i) => i.name).sort();
    assert.deepEqual(names, ['Comic.cbz', 'Ebook.mobi', 'Manual.pdf']);

    // 3. Check gdriveCacheFolderTree with hideIgnored = true
    // Should ONLY return Books (1 file). IgnoredFolder (0 non-ignored), EmptyFolder (0 files),
    // and ParentFolder (whose only descendant is ignored) must all be omitted!
    const treeHidden = db.gdriveCacheFolderTree('root', { hideIgnored: true });
    assert.equal(treeHidden.length, 1);
    assert.equal(treeHidden[0].name, 'Books');
    assert.equal(treeHidden[0].totalFiles, 1);

    // 4. Check gdriveCacheFolderTree with hideIgnored = false
    // Returns all 4 root folders: Books, EmptyFolder, IgnoredFolder, ParentFolder
    const treeShown = db.gdriveCacheFolderTree('root', { hideIgnored: false });
    assert.equal(treeShown.length, 4);
    const treeNames = treeShown.map((f) => f.name).sort();
    assert.deepEqual(treeNames, ['Books', 'EmptyFolder', 'IgnoredFolder', 'ParentFolder']);
    const parentFolder = treeShown.find((f) => f.name === 'ParentFolder');
    assert.equal(parentFolder.hasChildren, true);

    // 5. Check gdriveCacheFolderChildren at root level with hideIgnored = true
    // In root, child folders with 0 valid files (IgnoredFolder, EmptyFolder, ParentFolder) must NOT be listed!
    const rootChildrenHidden = db.gdriveCacheFolderChildren({ parentId: 'root', hideIgnored: true });
    assert.equal(rootChildrenHidden.items.length, 1);
    assert.equal(rootChildrenHidden.items[0].name, 'Books');

    // With hideIgnored = false, all 4 folders should appear in root
    const rootChildrenShown = db.gdriveCacheFolderChildren({ parentId: 'root', hideIgnored: false });
    assert.equal(rootChildrenShown.items.length, 4);

    // 6. Check gdriveCacheSearchFolders with hideIgnored = true vs false
    const searchHidden = db.gdriveCacheSearchFolders('Folder', 100, { hideIgnored: true });
    assert.equal(searchHidden.length, 0); // None of IgnoredFolder, EmptyFolder, ParentFolder have >0 non-ignored files
    const searchShown = db.gdriveCacheSearchFolders('Folder', 100, { hideIgnored: false });
    assert.equal(searchShown.length, 3); // IgnoredFolder, EmptyFolder, ParentFolder
  } finally {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

