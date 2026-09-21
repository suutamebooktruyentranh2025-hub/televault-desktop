const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { openIndexDb } = require('../../db/indexDb');
const { registerGDriveHandlers } = require('../../ipc/gdriveHandlers');

test('gdriveCacheSearchFolders and gdriveCacheFolderAncestors functionality', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-folder-search-'));
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
    // ├── Photos (dir_photos, /Photos/)
    // │   └── 2024 (dir_2024, /Photos/2024/)
    // │       └── Vacation (dir_vacation, /Photos/2024/Vacation/)
    // │           └── pic.jpg (f_pic, 1000B)
    // └── Documents (dir_docs, /Documents/)
    //     └── Danh sách truyện 2024 (dir_truyen, /Documents/Danh sách truyện 2024/)
    //         └── chap1.pdf (f_chap, 2000B)
    db.gdriveCacheNodesUpsertBatch([
      {
        id: 'dir_photos',
        parentId: 'root',
        name: 'Photos',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Photos/',
      },
      {
        id: 'dir_2024',
        parentId: 'dir_photos',
        name: '2024',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Photos/2024/',
      },
      {
        id: 'dir_vacation',
        parentId: 'dir_2024',
        name: 'Vacation',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Photos/2024/Vacation/',
      },
      {
        id: 'f_pic',
        parentId: 'dir_vacation',
        name: 'pic.jpg',
        mimeType: 'image/jpeg',
        isFolder: 0,
        size: 1000,
        drivePath: '/Photos/2024/Vacation/pic.jpg',
      },
      {
        id: 'dir_docs',
        parentId: 'root',
        name: 'Documents',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Documents/',
      },
      {
        id: 'dir_truyen',
        parentId: 'dir_docs',
        name: 'Danh sách truyện 2024',
        mimeType: 'application/vnd.google-apps.folder',
        isFolder: 1,
        drivePath: '/Documents/Danh sách truyện 2024/',
      },
      {
        id: 'f_chap',
        parentId: 'dir_truyen',
        name: 'chap1.pdf',
        mimeType: 'application/pdf',
        isFolder: 0,
        size: 2000,
        drivePath: '/Documents/Danh sách truyện 2024/chap1.pdf',
      },
    ]);

    // 1. Test DAO method: search folders
    assert.equal(typeof db.gdriveCacheSearchFolders, 'function', 'gdriveCacheSearchFolders should exist');

    const searchTruyen = db.gdriveCacheSearchFolders('truyện');
    assert.equal(searchTruyen.length, 1);
    assert.equal(searchTruyen[0].id, 'dir_truyen');
    assert.equal(searchTruyen[0].name, 'Danh sách truyện 2024');
    assert.equal(searchTruyen[0].totalFiles, 1);

    const search2024 = db.gdriveCacheSearchFolders('2024');
    assert.equal(search2024.length, 2);
    const ids = search2024.map(f => f.id).sort();
    assert.deepEqual(ids, ['dir_2024', 'dir_truyen'].sort());

    const searchVacation = db.gdriveCacheSearchFolders('Vacation');
    assert.equal(searchVacation.length, 1);
    assert.equal(searchVacation[0].id, 'dir_vacation');

    const searchEmpty = db.gdriveCacheSearchFolders('KhongTonTai');
    assert.equal(searchEmpty.length, 0);

    // 2. Test DAO method: get ancestors
    assert.equal(typeof db.gdriveCacheFolderAncestors, 'function', 'gdriveCacheFolderAncestors should exist');

    const ancestors = db.gdriveCacheFolderAncestors('dir_vacation');
    // Expected chain from root down to dir_vacation: dir_photos -> dir_2024 -> dir_vacation
    assert.equal(ancestors.length, 3);
    assert.equal(ancestors[0].id, 'dir_photos');
    assert.equal(ancestors[1].id, 'dir_2024');
    assert.equal(ancestors[2].id, 'dir_vacation');

    // 3. Test IPC handlers
    const mockCtx = {
      getDb: () => db,
      getGDriveSyncService: () => null,
      isReady: () => true,
    };
    registerGDriveHandlers(mockIpcMain, mockCtx);

    assert.ok(handlers.has('gdrive:searchFolders'), 'gdrive:searchFolders should be registered');
    assert.ok(handlers.has('gdrive:getFolderAncestors'), 'gdrive:getFolderAncestors should be registered');

    const searchIpc = handlers.get('gdrive:searchFolders');
    const ipcRes = await searchIpc({}, { search: 'truyện' });
    assert.equal(ipcRes.ok, true);
    assert.equal(ipcRes.folders.length, 1);
    assert.equal(ipcRes.folders[0].id, 'dir_truyen');

    const ancestorsIpc = handlers.get('gdrive:getFolderAncestors');
    const ancRes = await ancestorsIpc({}, { folderId: 'dir_vacation' });
    assert.equal(ancRes.ok, true);
    assert.equal(ancRes.ancestors.length, 3);
    assert.equal(ancRes.ancestors[2].name, 'Vacation');

  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});
