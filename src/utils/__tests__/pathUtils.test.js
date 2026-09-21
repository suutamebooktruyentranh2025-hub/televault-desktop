import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFolderPath } from '../pathUtils.js';

test('sanitizeFolderPath: handles root and empty inputs', () => {
  assert.equal(sanitizeFolderPath(''), '/');
  assert.equal(sanitizeFolderPath('/'), '/');
  assert.equal(sanitizeFolderPath(null), '/');
  assert.equal(sanitizeFolderPath(undefined), '/');
});

test('sanitizeFolderPath: normalizes leading/trailing slashes and double slashes', () => {
  assert.equal(sanitizeFolderPath('GDrive'), '/GDrive/');
  assert.equal(sanitizeFolderPath('/GDrive'), '/GDrive/');
  assert.equal(sanitizeFolderPath('GDrive/'), '/GDrive/');
  assert.equal(sanitizeFolderPath('//GDrive///Folder///'), '/GDrive/Folder/');
});

test('sanitizeFolderPath: collapses consecutive duplicate path segments', () => {
  assert.equal(sanitizeFolderPath('/GDrive/GDrive/'), '/GDrive/');
  assert.equal(sanitizeFolderPath('/GDrive/GDrive/GDrive/GDrive/'), '/GDrive/');
  assert.equal(
    sanitizeFolderPath('/GDrive/Danh sách 2024/Danh sách truyện 2024/Naruto/Naruto (CBZ)/Naruto (CBZ)/'),
    '/GDrive/Danh sách 2024/Danh sách truyện 2024/Naruto/Naruto (CBZ)/'
  );
});

test('sanitizeFolderPath: preserves valid non-consecutive segments with same name', () => {
  assert.equal(sanitizeFolderPath('/root/sub/root/'), '/root/sub/root/');
});
