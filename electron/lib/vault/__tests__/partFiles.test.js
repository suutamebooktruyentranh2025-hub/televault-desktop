const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { extractPartFile, writeAtOffset, allocateFile } = require('../partFiles');

test('extractPartFile copies the requested byte range', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-part-'));
  const sourcePath = path.join(tmpDir, 'source.bin');
  const destPath = path.join(tmpDir, 'part.bin');
  fs.writeFileSync(sourcePath, Buffer.from('0123456789abcdef'));
  await extractPartFile(sourcePath, 4, 6, destPath);
  assert.equal(fs.readFileSync(destPath, 'utf8'), '456789');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('writeAtOffset merges parts into allocated file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-merge-'));
  const destPath = path.join(tmpDir, 'merged.bin');
  const partA = path.join(tmpDir, 'a.bin');
  const partB = path.join(tmpDir, 'b.bin');
  fs.writeFileSync(partA, Buffer.from('AAAA'));
  fs.writeFileSync(partB, Buffer.from('BBBB'));
  allocateFile(destPath, 8);
  await writeAtOffset(partA, destPath, 0);
  await writeAtOffset(partB, destPath, 4);
  assert.equal(fs.readFileSync(destPath, 'utf8'), 'AAAABBBB');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
