import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldOpenFilePreview } from '../filePreview.js';

test('image files do not open preview on open/double-click', () => {
  assert.equal(shouldOpenFilePreview('A-BOUT! Phần 2.jpg'), false);
  assert.equal(shouldOpenFilePreview('photo.PNG'), false);
  assert.equal(shouldOpenFilePreview('shot.jpeg'), false);
  assert.equal(shouldOpenFilePreview('anim.gif'), false);
  assert.equal(shouldOpenFilePreview('pic.webp'), false);
});

test('text files still open preview', () => {
  assert.equal(shouldOpenFilePreview('notes.txt'), true);
  assert.equal(shouldOpenFilePreview('README.md'), true);
  assert.equal(shouldOpenFilePreview('data.json'), true);
});

test('unknown file types do not open preview', () => {
  assert.equal(shouldOpenFilePreview('archive.zip'), false);
  assert.equal(shouldOpenFilePreview('no-extension'), false);
});
