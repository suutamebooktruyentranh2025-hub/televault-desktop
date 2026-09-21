const test = require('node:test');
const assert = require('node:assert/strict');
const { buildVaultLookupIndex, shouldEnqueueDriveFile, nfcPath } = require('../gdriveDiscovery');

// Vietnamese text in two Unicode forms:
// NFC (precomposed): "Nông" = N + ô + n + g  (4 chars, 6 bytes UTF-8)
// NFD (decomposed):  "Nông" = N + o + ̂ + n + g  (5 chars, 7 bytes UTF-8)
const NFC_NAME = 'Anh N\u00f4ng D\u00e2n C\u1ea7n Ki\u1ec7m T01.cbz';
const NFD_NAME = NFC_NAME.normalize('NFD');

test('nfcPath normalizes NFD to NFC', () => {
  assert.notEqual(NFC_NAME, NFD_NAME);
  assert.equal(nfcPath(NFC_NAME), nfcPath(NFD_NAME));
});

test('buildVaultLookupIndex matches NFD vault path against NFC Drive path', () => {
  // Vault entries stored with NFD paths (macOS default)
  const vaultEntries = [
    { path: `/GDrive/Truyện/${NFD_NAME}`, size: 100000, sha256: 'sha_nfd' },
  ];

  const lookup = buildVaultLookupIndex(vaultEntries);

  // Drive uses NFC, so targetPath will be NFC
  const match = lookup.findMatch({
    targetPath: `/GDrive/Truyện/${NFC_NAME}`,
    drivePath: `Truyện/${NFC_NAME}`,
    fileName: NFC_NAME,
    size: 100000,
  });

  assert.ok(match, 'Should match despite Unicode normalization difference');
  assert.equal(match.sha256, 'sha_nfd');
});

test('buildVaultLookupIndex matches NFC vault path against NFD Drive path', () => {
  // Vault entries stored with NFC paths
  const vaultEntries = [
    { path: `/GDrive/Truyện/${NFC_NAME}`, size: 100000, sha256: 'sha_nfc' },
  ];

  const lookup = buildVaultLookupIndex(vaultEntries);

  // Lookup with NFD (hypothetical)
  const match = lookup.findMatch({
    targetPath: `/GDrive/Truyện/${NFD_NAME}`,
    drivePath: `Truyện/${NFD_NAME}`,
    fileName: NFD_NAME,
    size: 100000,
  });

  assert.ok(match, 'Should match despite Unicode normalization difference');
  assert.equal(match.sha256, 'sha_nfc');
});

test('shouldEnqueueDriveFile skips when modifiedTime changed but MD5 unchanged', () => {
  const result = shouldEnqueueDriveFile({
    manifest: { driveModifiedTime: 't1', md5: 'abc123', vaultPath: '/GDrive/a.cbz' },
    driveModifiedTime: 't2', // changed
    driveMd5: 'abc123',      // same MD5 → content unchanged
    vaultEntry: { path: '/GDrive/a.cbz', sha256: 's1', size: 10 },
  });
  assert.equal(result, false, 'Should skip when MD5 is unchanged');
});

test('shouldEnqueueDriveFile re-enqueues when modifiedTime and MD5 both changed', () => {
  const result = shouldEnqueueDriveFile({
    manifest: { driveModifiedTime: 't1', md5: 'abc123', vaultPath: '/GDrive/a.cbz' },
    driveModifiedTime: 't2',  // changed
    driveMd5: 'def456',       // changed MD5 → content changed
    vaultEntry: { path: '/GDrive/a.cbz', sha256: 's1', size: 10 },
  });
  assert.equal(result, true, 'Should re-enqueue when MD5 changed');
});

test('shouldEnqueueDriveFile re-enqueues when modifiedTime changed and no driveMd5 provided', () => {
  const result = shouldEnqueueDriveFile({
    manifest: { driveModifiedTime: 't1', md5: 'abc123', vaultPath: '/GDrive/a.cbz' },
    driveModifiedTime: 't2',
    // no driveMd5 → conservative, re-enqueue
    vaultEntry: { path: '/GDrive/a.cbz', sha256: 's1', size: 10 },
  });
  assert.equal(result, true, 'Should re-enqueue when MD5 not available for comparison');
});
