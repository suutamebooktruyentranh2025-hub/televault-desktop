import test from 'node:test';
import assert from 'node:assert/strict';
import { joinFolderPath, folderDisplayName } from '../moveTargets.js';

test('joinFolderPath handles string folder name', () => {
  assert.equal(joinFolderPath('/', 'Manga'), '/Manga/');
  assert.equal(joinFolderPath('/Docs/', 'Novels'), '/Docs/Novels/');
});

test('joinFolderPath handles folder item objects with name property', () => {
  const folderObj = {
    name: 'Gdrive',
    mtime: '2026-09-20T00:00:00.000Z',
    size: 1024,
    fileCount: 5,
  };
  const joined = joinFolderPath('/', folderObj);
  assert.equal(joined, '/Gdrive/');
  assert.notEqual(joined, '/[object Object]/');
  assert.equal(folderDisplayName(joined, 'My Drive'), 'Gdrive');
});

test('joinFolderPath handles nested folder items', () => {
  const subFolder = { name: 'Comics' };
  assert.equal(joinFolderPath('/Gdrive/', subFolder), '/Gdrive/Comics/');
});
