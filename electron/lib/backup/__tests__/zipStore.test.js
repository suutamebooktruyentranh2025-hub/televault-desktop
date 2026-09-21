const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createZipFromDirectory, extractZipToDirectory } = require('../zipStore');

test('zip store round-trips nested files', () => {
  const temp_root = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-zip-'));
  const source_dir = path.join(temp_root, 'src');
  const zip_path = path.join(temp_root, 'out.zip');
  const dest_dir = path.join(temp_root, 'dest');
  try {
    fs.mkdirSync(path.join(source_dir, 'nested'), { recursive: true });
    fs.writeFileSync(path.join(source_dir, 'manifest.json'), '{"ok":true}');
    fs.writeFileSync(path.join(source_dir, 'nested', 'index.db'), 'db-bytes');

    createZipFromDirectory(source_dir, zip_path);
    extractZipToDirectory(zip_path, dest_dir);

    assert.equal(fs.readFileSync(path.join(dest_dir, 'manifest.json'), 'utf8'), '{"ok":true}');
    assert.equal(fs.readFileSync(path.join(dest_dir, 'nested', 'index.db'), 'utf8'), 'db-bytes');
  } finally {
    fs.rmSync(temp_root, { recursive: true, force: true });
  }
});
