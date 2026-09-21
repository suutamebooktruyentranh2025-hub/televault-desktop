const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { evictCacheIfNeeded } = require('../cacheEvictor');

test('evictCacheIfNeeded removes oldest local files until under limit', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-cache-'));
  const fileA = path.join(tmpDir, 'a.bin');
  const fileB = path.join(tmpDir, 'b.bin');
  fs.writeFileSync(fileA, Buffer.alloc(1000));
  fs.writeFileSync(fileB, Buffer.alloc(1000));

  const entries = [
    {
      messageId: 1,
      localPath: fileA,
      lastUsed: '2020-01-01T00:00:00.000Z',
      mtime: new Date('2020-01-01'),
    },
    {
      messageId: 2,
      localPath: fileB,
      lastUsed: '2024-01-01T00:00:00.000Z',
      mtime: new Date('2024-01-01'),
    },
  ];
  const cleared = new Set();
  const db = {
    getAll: () => entries,
    getCacheLimitBytes: () => 1200,
    setLocalPath: (id, value) => {
      if (value == null) cleared.add(id);
      const entry = entries.find((e) => e.messageId === id);
      if (entry) entry.localPath = value;
    },
  };

  const result = evictCacheIfNeeded({ db });
  assert.ok(result.removed >= 1);
  assert.ok(cleared.has(1));
  assert.equal(fs.existsSync(fileA), false);
  assert.equal(fs.existsSync(fileB), true);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
