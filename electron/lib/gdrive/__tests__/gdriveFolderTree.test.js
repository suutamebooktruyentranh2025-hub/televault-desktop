const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');
const { registerGDriveHandlers } = require('../../ipc/gdriveHandlers');

test('gdrive folder tree and per-folder sync functionality', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-folder-tree-'));
  const dbPath = path.join(tmpDir, 'test.db');
  try {
    const db = openIndexDb(dbPath);

    // Mock ipcMain
    const handlers = new Map();
    const mockIpcMain = {
      handle(channel, handler) {
        handlers.set(channel, handler);
      },
    };

    // Populate mock tree structure:
    // root
    // ├── Photos (dir_photos)
    // │   ├── 2024 (dir_2024)
    // │   │   ├── photo1.jpg (f_p1, size 1000)
    // │   │   └── photo2.png (f_p2, size 2000)
    // │   └── cover.jpg (f_cov, size 500)
    // ├── Documents (dir_docs)
    // │   └── notes.txt (f_note, size 100)
    // └── root_file.zip (f_root, size 9999)
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir_photos',
        parentId: 'root',
        name: 'Photos',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Photos',
      },
      {
        id: 'dir_2024',
        parentId: 'dir_photos',
        name: '2024',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Photos/2024',
      },
      {
        id: 'f_p1',
        parentId: 'dir_2024',
        name: 'photo1.jpg',
        mimeType: 'image/jpeg',
        isFolder: 0,
        size: 1000,
        modifiedTime: '2026-09-18T10:00:00Z',
        drivePath: '/Photos/2024/photo1.jpg',
      },
      {
        id: 'f_p2',
        parentId: 'dir_2024',
        name: 'photo2.png',
        mimeType: 'image/png',
        isFolder: 0,
        size: 2000,
        modifiedTime: '2026-09-18T10:05:00Z',
        drivePath: '/Photos/2024/photo2.png',
      },
      {
        id: 'f_cov',
        parentId: 'dir_photos',
        name: 'cover.jpg',
        mimeType: 'image/jpeg',
        isFolder: 0,
        size: 500,
        modifiedTime: '2026-09-18T09:00:00Z',
        drivePath: '/Photos/cover.jpg',
      },
      {
        id: 'dir_docs',
        parentId: 'root',
        name: 'Documents',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Documents',
      },
      {
        id: 'f_note',
        parentId: 'dir_docs',
        name: 'notes.txt',
        mimeType: 'text/plain',
        isFolder: 0,
        size: 100,
        modifiedTime: '2026-09-18T08:00:00Z',
        drivePath: '/Documents/notes.txt',
      },
      {
        id: 'f_root',
        parentId: 'root',
        name: 'root_file.zip',
        mimeType: 'application/zip',
        isFolder: 0,
        size: 9999,
        modifiedTime: '2026-09-18T07:00:00Z',
        drivePath: '/root_file.zip',
      },
    ]);

    // Mark f_p1 as synced in manifest
    db.gdriveManifestUpsert({
      driveFileId: 'f_p1',
      drivePath: '/Photos/2024/photo1.jpg',
      vaultPath: '/GoogleDrive/Photos/2024/photo1.jpg',
      sha256: 'mocksha256',
      size: 1000,
      driveModifiedTime: '2026-09-18T10:00:00Z',
      syncedAt: '2026-09-19T10:00:00Z',
    });

    // Mark f_cov as error
    db.gdriveSyncErrorAdd({
      driveFileId: 'f_cov',
      fileName: 'cover.jpg',
      drivePath: '/Photos/cover.jpg',
      vaultPath: '/GoogleDrive/Photos/cover.jpg',
      errorMessage: 'Network timeout',
    });

    const mockCtx = {
      getDb: () => db,
      getGDriveSyncService: () => null,
      isReady: () => true,
    };

    registerGDriveHandlers(mockIpcMain, mockCtx);

    // 1. Verify IPC registrations
    assert.ok(handlers.has('gdrive:queryFolderTree'), 'gdrive:queryFolderTree registered');
    assert.ok(handlers.has('gdrive:queryFolderChildren'), 'gdrive:queryFolderChildren registered');
    assert.ok(handlers.has('gdrive:syncFolder'), 'gdrive:syncFolder registered');

    // 2. Test queryFolderTree for root
    const treeHandler = handlers.get('gdrive:queryFolderTree');
    const rootTreeRes = await treeHandler(null, { parentId: 'root' });
    assert.equal(rootTreeRes.ok, true);
    assert.equal(rootTreeRes.folders.length, 2); // Photos, Documents
    const photosFolder = rootTreeRes.folders.find((f) => f.name === 'Photos');
    const docsFolder = rootTreeRes.folders.find((f) => f.name === 'Documents');
    assert.ok(photosFolder);
    assert.ok(docsFolder);
    assert.equal(photosFolder.hasChildren, true); // has 2024
    assert.equal(photosFolder.totalFiles, 3); // photo1, photo2, cover
    assert.equal(photosFolder.syncedCount, 1); // photo1
    assert.equal(photosFolder.errorCount, 1); // cover
    assert.equal(photosFolder.pendingCount, 1); // photo2
    assert.equal(docsFolder.hasChildren, false);
    assert.equal(docsFolder.totalFiles, 1);
    assert.equal(docsFolder.syncedCount, 0);

    // 3. Test queryFolderTree for subfolder Photos
    const subTreeRes = await treeHandler(null, { parentId: 'dir_photos' });
    assert.equal(subTreeRes.ok, true);
    assert.equal(subTreeRes.folders.length, 1);
    assert.equal(subTreeRes.folders[0].name, '2024');
    assert.equal(subTreeRes.folders[0].totalFiles, 2);
    assert.equal(subTreeRes.folders[0].syncedCount, 1);

    // 4. Test queryFolderChildren
    const childrenHandler = handlers.get('gdrive:queryFolderChildren');
    const photosChildren = await childrenHandler(null, { parentId: 'dir_photos' });
    assert.equal(photosChildren.ok, true);
    assert.equal(photosChildren.total, 2); // 1 folder (2024) + 1 file (cover.jpg)
    assert.equal(photosChildren.items[0].isFolder, 1); // Folders first!
    assert.equal(photosChildren.items[0].name, '2024');
    assert.equal(photosChildren.items[1].isFolder, 0);
    assert.equal(photosChildren.items[1].name, 'cover.jpg');
    assert.equal(photosChildren.items[1].status, 'error');

    // 5. Test status filter in queryFolderChildren
    const filterRes = await childrenHandler(null, { parentId: 'dir_photos', status: 'error' });
    assert.equal(filterRes.ok, true);
    assert.equal(filterRes.items.length, 1);
    assert.equal(filterRes.items[0].name, 'cover.jpg');

    // 5b. Test status filter: pending (should return unsynced folder 2024 and cover.jpg)
    const pendingRes = await childrenHandler(null, { parentId: 'dir_photos', status: 'pending' });
    assert.equal(pendingRes.ok, true);
    assert.equal(pendingRes.items.length, 2); // 2024 (has pending photo2) and cover.jpg (pending sync)
    assert.equal(pendingRes.items[0].name, '2024');
    assert.equal(pendingRes.items[0].isFolder, 1);
    assert.equal(pendingRes.items[1].name, 'cover.jpg');

    // 5c. Test status filter: synced (currently neither 2024 nor cover.jpg is fully synced)
    const syncedResBefore = await childrenHandler(null, { parentId: 'dir_photos', status: 'synced' });
    assert.equal(syncedResBefore.ok, true);
    assert.equal(syncedResBefore.items.length, 0);

    // Now sync photo2.png in manifest so 2024 is fully synced
    db.gdriveManifestUpsert({
      driveFileId: 'f_p2',
      drivePath: '/Photos/2024/photo2.png',
      vaultPath: '/GoogleDrive/Photos/2024/photo2.png',
      sha256: 'mocksha256_2',
      size: 2000,
      driveModifiedTime: '2026-09-18T10:05:00Z',
      syncedAt: '2026-09-19T10:05:00Z',
    });

    // Now 2024 should appear in syncedRes
    const syncedResAfter = await childrenHandler(null, { parentId: 'dir_photos', status: 'synced' });
    assert.equal(syncedResAfter.ok, true);
    assert.equal(syncedResAfter.items.length, 1);
    assert.equal(syncedResAfter.items[0].name, '2024');
    assert.equal(syncedResAfter.items[0].isFolder, 1);
    assert.equal(syncedResAfter.items[0].isSynced, true);

    // And 2024 should NO LONGER appear in pendingRes
    const pendingResAfter = await childrenHandler(null, { parentId: 'dir_photos', status: 'pending' });
    assert.equal(pendingResAfter.ok, true);
    assert.equal(pendingResAfter.items.length, 1);
    assert.equal(pendingResAfter.items[0].name, 'cover.jpg');

    // Clean up f_p2 from manifest so subsequent sync tests have photo2 as pending
    db.gdriveManifestDelete('f_p2');

    // 6. Test syncFolder non-recursive on Photos
    const syncFolderHandler = handlers.get('gdrive:syncFolder');
    // In dir_photos, only cover.jpg is directly in dir_photos (and pending/error)
    const syncRes1 = await syncFolderHandler(null, { folderId: 'dir_photos', includeSubfolders: false });
    assert.equal(syncRes1.ok, true);
    assert.equal(syncRes1.enqueuedCount, 1); // only cover.jpg

    let queue = db.gdriveSyncQueueGetAll();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].fileName, 'cover.jpg');

    // Clear queue
    db.gdriveSyncQueueRemove('f_cov');

    // 7. Test syncFolder recursive on Photos
    // Should enqueue cover.jpg (in Photos) and photo2.png (in 2024), but NOT photo1.jpg (already synced)
    const syncRes2 = await syncFolderHandler(null, { folderId: 'dir_photos', includeSubfolders: true });
    assert.equal(syncRes2.ok, true);
    assert.equal(syncRes2.enqueuedCount, 2); // cover.jpg + photo2.png

    queue = db.gdriveSyncQueueGetAll();
    assert.equal(queue.length, 2);
    const queuedIds = queue.map((q) => q.driveFileId).sort();
    assert.deepEqual(queuedIds, ['f_cov', 'f_p2']);

    // 8. Test queryFolderChildren with includeSubfolders = true (recursive flat mode)
    // For dir_photos: has photo1.jpg (synced), photo2.png (pending), cover.jpg (error/pending)
    const recursiveAll = await childrenHandler(null, { parentId: 'dir_photos', includeSubfolders: true, status: 'all' });
    assert.equal(recursiveAll.ok, true);
    assert.equal(recursiveAll.total, 3);
    const recNames = recursiveAll.items.map((i) => i.name).sort();
    assert.deepEqual(recNames, ['cover.jpg', 'photo1.jpg', 'photo2.png']);

    // Filter pending with includeSubfolders = true:
    // Should return cover.jpg and photo2.png (both pending/error), excluding photo1.jpg (synced)
    const recursivePending = await childrenHandler(null, { parentId: 'dir_photos', includeSubfolders: true, status: 'pending' });
    assert.equal(recursivePending.ok, true);
    assert.equal(recursivePending.total, 2);
    const pendingNames = recursivePending.items.map((i) => i.name).sort();
    assert.deepEqual(pendingNames, ['cover.jpg', 'photo2.png']);

    // Filter synced with includeSubfolders = true:
    // Should return photo1.jpg
    const recursiveSynced = await childrenHandler(null, { parentId: 'dir_photos', includeSubfolders: true, status: 'synced' });
    assert.equal(recursiveSynced.ok, true);
    assert.equal(recursiveSynced.total, 1);
    assert.equal(recursiveSynced.items[0].name, 'photo1.jpg');

    db.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
