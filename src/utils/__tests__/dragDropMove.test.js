const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidDropTarget,
  buildDragPayload,
  parseMovePayload,
  isMoveDragEvent,
  TELEVAULT_MOVE_MIME,
} = require('../dragDropMove');

test('isValidDropTarget prevents dropping into self or descendants', () => {
  const payload = {
    messageIds: [10, 20],
    folders: ['/Docs/', '/Projects/App/'],
  };

  // Dropping into self
  assert.equal(isValidDropTarget('/Docs/', payload), false);
  assert.equal(isValidDropTarget('/Projects/App/', payload), false);

  // Dropping into descendant
  assert.equal(isValidDropTarget('/Docs/SubFolder/', payload), false);
  assert.equal(isValidDropTarget('/Projects/App/src/components/', payload), false);

  // Dropping into sibling or parent or unrelated folder
  assert.equal(isValidDropTarget('/Other/', payload), true);
  assert.equal(isValidDropTarget('/Projects/', payload), true);
  assert.equal(isValidDropTarget('/', payload), true);
});

test('buildDragPayload packages all selected items if dragged item is selected', () => {
  const selectedIds = new Set([1, 2, 3]);
  const selectedFolders = new Set(['/FolderA/', '/FolderB/']);

  // Dragging a file that IS in selectedIds
  const resultFile = buildDragPayload({
    itemType: 'file',
    file: { messageId: 2, name: 'doc2.pdf' },
    currentFolder: '/',
    selectedIds,
    selectedFolders,
  });

  assert.deepEqual(resultFile.messageIds, [1, 2, 3]);
  assert.deepEqual(resultFile.folders, ['/FolderA/', '/FolderB/']);
  assert.equal(resultFile.totalCount, 5);

  // Dragging a folder that IS in selectedFolders
  const resultFolder = buildDragPayload({
    itemType: 'folder',
    folderName: 'FolderA',
    currentFolder: '/',
    selectedIds,
    selectedFolders,
  });

  assert.deepEqual(resultFolder.messageIds, [1, 2, 3]);
  assert.deepEqual(resultFolder.folders, ['/FolderA/', '/FolderB/']);
  assert.equal(resultFolder.totalCount, 5);
});

test('buildDragPayload packages only the single dragged item if not selected', () => {
  const selectedIds = new Set([1, 2, 3]);
  const selectedFolders = new Set(['/FolderA/']);

  // Dragging an UNSELECTED file
  const resultFile = buildDragPayload({
    itemType: 'file',
    file: { messageId: 99, name: 'unselected.txt' },
    currentFolder: '/',
    selectedIds,
    selectedFolders,
  });

  assert.deepEqual(resultFile.messageIds, [99]);
  assert.deepEqual(resultFile.folders, []);
  assert.equal(resultFile.totalCount, 1);

  // Dragging an UNSELECTED folder
  const resultFolder = buildDragPayload({
    itemType: 'folder',
    folderName: 'UnselectedFolder',
    currentFolder: '/Docs/',
    selectedIds,
    selectedFolders,
  });

  assert.deepEqual(resultFolder.messageIds, []);
  assert.deepEqual(resultFolder.folders, ['/Docs/UnselectedFolder/']);
  assert.equal(resultFolder.totalCount, 1);
});

test('isMoveDragEvent and parseMovePayload work correctly', () => {
  const fakeEvent = {
    dataTransfer: {
      types: ['text/plain', TELEVAULT_MOVE_MIME],
      getData: (mime) => {
        if (mime === TELEVAULT_MOVE_MIME) {
          return JSON.stringify({ messageIds: [123], folders: ['/Sub/'] });
        }
        return '';
      },
    },
  };

  assert.equal(isMoveDragEvent(fakeEvent), true);
  assert.deepEqual(parseMovePayload(fakeEvent), {
    messageIds: [123],
    folders: ['/Sub/'],
  });

  const emptyEvent = { dataTransfer: { types: ['Files'] } };
  assert.equal(isMoveDragEvent(emptyEvent), false);
  assert.equal(parseMovePayload(emptyEvent), null);
});
