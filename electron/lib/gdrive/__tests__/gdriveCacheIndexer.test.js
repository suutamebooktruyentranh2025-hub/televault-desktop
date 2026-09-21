const test = require('node:test');
const assert = require('node:assert/strict');
const { materializePaths, disambiguateSiblingNames } = require('../gdriveCacheIndexer');

test('disambiguateSiblingNames handles duplicate file and folder names', () => {
  const siblings = [
    { id: 'f1', name: 'report.pdf', isFolder: 0 },
    { id: 'f2', name: 'report.pdf', isFolder: 0 },
    { id: 'd1', name: 'Photos', isFolder: 1 },
    { id: 'd2', name: 'Photos', isFolder: 1 },
  ];
  const disambiguated = disambiguateSiblingNames(siblings);
  assert.equal(disambiguated.get('f1'), 'report.pdf');
  assert.equal(disambiguated.get('f2'), 'report (1).pdf');
  assert.equal(disambiguated.get('d1'), 'Photos');
  assert.equal(disambiguated.get('d2'), 'Photos (1)');
});

test('materializePaths builds clean NFC paths and resolves duplicate names', () => {
  const nodes = [
    { id: 'dir1', parentId: 'root', name: 'Truyện', isFolder: 1 }, // decomposed unicode
    { id: 'dir2', parentId: 'dir1', name: 'Manga', isFolder: 1 },
    { id: 'f1', parentId: 'dir2', name: 'Chapter 1.cbz', isFolder: 0 },
    { id: 'f2', parentId: 'dir2', name: 'Chapter 1.cbz', isFolder: 0 }, // duplicate
    { id: 'f3', parentId: 'root', name: 'standalone.txt', isFolder: 0 },
  ];

  const materialized = materializePaths(nodes);
  assert.equal(materialized.get('dir1').drivePath, '/Truyện/'.normalize('NFC'));
  assert.equal(materialized.get('dir2').drivePath, '/Truyện/Manga/'.normalize('NFC'));
  assert.equal(materialized.get('f1').drivePath, '/Truyện/Manga/Chapter 1.cbz'.normalize('NFC'));
  assert.equal(materialized.get('f2').drivePath, '/Truyện/Manga/Chapter 1 (1).cbz'.normalize('NFC'));
  assert.equal(materialized.get('f3').drivePath, '/standalone.txt');
});

test('materializePaths handles orphaned nodes gracefully', () => {
  const nodes = [
    { id: 'orphan1', parentId: 'non_existent_folder_id', name: 'lost.doc', isFolder: 0 },
  ];
  const materialized = materializePaths(nodes);
  assert.equal(materialized.get('orphan1').drivePath, '/lost.doc');
});

test('disambiguateSiblingNames and materializePaths sanitize forward and backward slashes in names', () => {
  const nodes = [
    { id: 'dir1', parentId: 'root', name: 'Folder/With/Slashes', isFolder: 1 },
    { id: 'f1', parentId: 'dir1', name: 'file\\with/slashes.txt', isFolder: 0 },
  ];
  const materialized = materializePaths(nodes);
  assert.equal(materialized.get('dir1').name, 'Folder_With_Slashes');
  assert.equal(materialized.get('dir1').drivePath, '/Folder_With_Slashes/');
  assert.equal(materialized.get('f1').name, 'file_with_slashes.txt');
  assert.equal(materialized.get('f1').drivePath, '/Folder_With_Slashes/file_with_slashes.txt');
});

test('materializePaths protects against cyclic parent-child references without infinite loop', () => {
  // dir1 is under root, dir2 is under dir1, dir1 is also claimed as child of dir2 (cycle)
  const nodes = [
    { id: 'dir1', parentId: 'root', name: 'LoopA', isFolder: 1 },
    { id: 'dir2', parentId: 'dir1', name: 'LoopB', isFolder: 1 },
    { id: 'dir1_cycle', parentId: 'dir2', name: 'LoopA', isFolder: 1 },
  ];
  // Must terminate and return results without stack overflow
  const materialized = materializePaths(nodes);
  assert.ok(materialized.has('dir1'));
  assert.ok(materialized.has('dir2'));
});

