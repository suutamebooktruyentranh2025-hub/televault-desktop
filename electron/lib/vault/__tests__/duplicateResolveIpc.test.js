const test = require('node:test');
const assert = require('node:assert/strict');
const { createVaultEntry } = require('@televault/core');
const {
  scanDuplicateGroups,
  validateDuplicateResolve,
} = require('@televault/core');

function file(messageId, path, sha = 'a'.repeat(64)) {
  return createVaultEntry({
    messageId,
    path,
    size: 1,
    sha256: sha,
    mtime: new Date('2024-01-01T00:00:00.000Z'),
    tags: [],
  });
}

test('resolve contract: trash others keeps one', () => {
  const groups = scanDuplicateGroups([
    file(1, '/a/T01.cbz'),
    file(2, '/a/T01 (conflict 2026-07-15).cbz', 'b'.repeat(64)),
  ]);
  assert.equal(validateDuplicateResolve(groups, 1, [2]).ok, true);
  assert.equal(validateDuplicateResolve(groups, 2, [1]).ok, true);
  assert.equal(validateDuplicateResolve(groups, 1, [1]).ok, false);
});
