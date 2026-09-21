const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVaultLookupIndex } = require('../gdriveDiscovery');

test('buildVaultLookupIndex matches exact target path and size', () => {
  const vaultEntries = [
    { path: '/Comics/7 Seeds/7 Seeds T15.cbz', size: 200737870, sha256: 'sha_t15' },
    { path: '/Comics/Naruto/Ch01.cbz', size: 50000000, sha256: 'sha_ch01' },
  ];

  const lookup = buildVaultLookupIndex(vaultEntries);
  const match = lookup.findMatch({
    targetPath: '/Comics/7 Seeds/7 Seeds T15.cbz',
    drivePath: '7 Seeds/7 Seeds T15.cbz',
    fileName: '7 Seeds T15.cbz',
    size: 200737870,
  });

  assert.ok(match);
  assert.equal(match.path, '/Comics/7 Seeds/7 Seeds T15.cbz');
  assert.equal(match.sha256, 'sha_t15');
});

test('buildVaultLookupIndex matches relative path suffix when targetPath prefix differs', () => {
  const vaultEntries = [
    // Previously uploaded to a different folder prefix on Televault:
    { path: '/[8. test]/7 Seeds T15.cbz', size: 200737870, sha256: 'sha_t15_test' },
  ];

  const lookup = buildVaultLookupIndex(vaultEntries);
  const match = lookup.findMatch({
    targetPath: '/GoogleDrive/DifferentPrefix/[8. test]/7 Seeds T15.cbz',
    drivePath: '[8. test]/7 Seeds T15.cbz',
    fileName: '7 Seeds T15.cbz',
    size: 200737870,
  });

  assert.ok(match);
  assert.equal(match.path, '/[8. test]/7 Seeds T15.cbz');
});

test('buildVaultLookupIndex matches unique file by exact name and size across vault', () => {
  const vaultEntries = [
    { path: '/My Uploads/Archive/7 Seeds TExtra.cbz', size: 163698409, sha256: 'sha_extra' },
  ];

  const lookup = buildVaultLookupIndex(vaultEntries);
  const match = lookup.findMatch({
    targetPath: '/GoogleDrive/Comics/7 Seeds TExtra.cbz',
    drivePath: 'RandomDriveFolder/7 Seeds TExtra.cbz',
    fileName: '7 Seeds TExtra.cbz',
    size: 163698409,
  });

  assert.ok(match);
  assert.equal(match.path, '/My Uploads/Archive/7 Seeds TExtra.cbz');
});

test('buildVaultLookupIndex excludes trashed vault entries', () => {
  const vaultEntries = [
    { path: '/Rác/7 Seeds T15.cbz', size: 200737870, sha256: 'sha_trashed' },
  ];

  const lookup = buildVaultLookupIndex(vaultEntries);
  const match = lookup.findMatch({
    targetPath: '/Comics/7 Seeds/7 Seeds T15.cbz',
    drivePath: '7 Seeds/7 Seeds T15.cbz',
    fileName: '7 Seeds T15.cbz',
    size: 200737870,
  });

  assert.equal(match, null);
});

test('buildVaultLookupIndex returns null if size does not match', () => {
  const vaultEntries = [
    { path: '/Comics/7 Seeds/7 Seeds T15.cbz', size: 1000000, sha256: 'sha_small' },
  ];

  const lookup = buildVaultLookupIndex(vaultEntries);
  const match = lookup.findMatch({
    targetPath: '/Comics/7 Seeds/7 Seeds T15.cbz',
    drivePath: '7 Seeds/7 Seeds T15.cbz',
    fileName: '7 Seeds T15.cbz',
    size: 200737870,
  });

  assert.equal(match, null);
});
