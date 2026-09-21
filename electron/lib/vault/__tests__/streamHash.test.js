const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { sha256Stream } = require('../streamHash');

test('sha256Stream matches sync hash for small file', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-hash-'));
  const filePath = path.join(tmpDir, 'test.bin');
  const content = Buffer.alloc(1024 * 1024, 0xab);
  fs.writeFileSync(filePath, content);
  const expected = crypto.createHash('sha256').update(content).digest('hex');
  const actual = await sha256Stream(filePath, {});
  assert.equal(actual, expected);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('sha256Stream reports progress', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-hash-'));
  const filePath = path.join(tmpDir, 'progress.bin');
  fs.writeFileSync(filePath, Buffer.alloc(256 * 1024, 0xcd));
  let lastFraction = 0;
  await sha256Stream(filePath, {
    onProgress: (fraction) => {
      lastFraction = fraction;
    },
  });
  assert.ok(lastFraction >= 0.99);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
