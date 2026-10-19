import test from 'node:test';
import assert from 'node:assert/strict';
import { getRelativeSubfolder } from '../gdrivePathUtils.js';

test('getRelativeSubfolder: returns subfolder relative to parent folder', () => {
  const currentFolderPath = [
    { id: 'root', name: 'My Drive' },
    { id: 'dir_2025', name: 'Danh sách 2025' },
  ];
  const drivePath = '/Danh sách 2025/Danh sách truyện 2025/truyen.pdf';
  const fileName = 'truyen.pdf';

  const result = getRelativeSubfolder(drivePath, currentFolderPath, fileName);
  assert.equal(result, 'Danh sách truyện 2025');
});

test('getRelativeSubfolder: returns multi-level subfolder path', () => {
  const currentFolderPath = [
    { id: 'root', name: 'My Drive' },
    { id: 'dir_2025', name: 'Danh sách 2025' },
  ];
  const drivePath = '/Danh sách 2025/Danh sách truyện 2025/Tập 1/truyen.pdf';
  const fileName = 'truyen.pdf';

  const result = getRelativeSubfolder(drivePath, currentFolderPath, fileName);
  assert.equal(result, 'Danh sách truyện 2025/Tập 1');
});

test('getRelativeSubfolder: returns null when file is directly in current folder', () => {
  const currentFolderPath = [
    { id: 'root', name: 'My Drive' },
    { id: 'dir_2025', name: 'Danh sách 2025' },
  ];
  const drivePath = '/Danh sách 2025/truyen.pdf';
  const fileName = 'truyen.pdf';

  const result = getRelativeSubfolder(drivePath, currentFolderPath, fileName);
  assert.equal(result, null);
});

test('getRelativeSubfolder: at root returns full path without file name', () => {
  const currentFolderPath = [
    { id: 'root', name: 'My Drive' },
  ];
  const drivePath = '/Danh sách 2025/Danh sách truyện 2025/truyen.pdf';
  const fileName = 'truyen.pdf';

  const result = getRelativeSubfolder(drivePath, currentFolderPath, fileName);
  assert.equal(result, 'Danh sách 2025/Danh sách truyện 2025');
});

test('getRelativeSubfolder: handles null or empty inputs gracefully', () => {
  assert.equal(getRelativeSubfolder(null, [], 'file.pdf'), null);
  assert.equal(getRelativeSubfolder('', [], 'file.pdf'), null);
  assert.equal(getRelativeSubfolder('/file.pdf', [{ id: 'root', name: 'My Drive' }], 'file.pdf'), null);
});
