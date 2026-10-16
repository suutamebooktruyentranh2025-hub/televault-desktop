const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDownloadAsset } = require('../githubUpdater');

const mockRelease = {
  tag_name: 'v0.3.2',
  assets: [
    {
      name: 'TeleVault-0.3.2-arm64.dmg',
      browser_download_url: 'https://github.com/test/download/TeleVault-0.3.2-arm64.dmg',
      size: 104857600,
    },
    {
      name: 'TeleVault-0.3.2.dmg',
      browser_download_url: 'https://github.com/test/download/TeleVault-0.3.2.dmg',
      size: 104857600,
    },
    {
      name: 'TeleVault Setup 0.3.2.exe',
      browser_download_url: 'https://github.com/test/download/TeleVault-Setup-0.3.2.exe',
      size: 83886080,
    },
    {
      name: 'latest.yml',
      browser_download_url: 'https://github.com/test/download/latest.yml',
      size: 300,
    },
  ],
};

test('resolveDownloadAsset: finds Windows .exe asset', () => {
  const asset = resolveDownloadAsset(mockRelease, 'win32', 'x64');
  assert.ok(asset);
  assert.equal(asset.name, 'TeleVault Setup 0.3.2.exe');
  assert.equal(asset.url, 'https://github.com/test/download/TeleVault-Setup-0.3.2.exe');
});

test('resolveDownloadAsset: finds macOS arm64 .dmg asset', () => {
  const asset = resolveDownloadAsset(mockRelease, 'darwin', 'arm64');
  assert.ok(asset);
  assert.equal(asset.name, 'TeleVault-0.3.2-arm64.dmg');
  assert.equal(asset.url, 'https://github.com/test/download/TeleVault-0.3.2-arm64.dmg');
});

test('resolveDownloadAsset: finds macOS Intel/x64 .dmg asset', () => {
  const asset = resolveDownloadAsset(mockRelease, 'darwin', 'x64');
  assert.ok(asset);
  assert.equal(asset.name, 'TeleVault-0.3.2.dmg');
  assert.equal(asset.url, 'https://github.com/test/download/TeleVault-0.3.2.dmg');
});

test('resolveDownloadAsset: returns null when no matching asset exists', () => {
  const asset = resolveDownloadAsset(mockRelease, 'linux', 'x64');
  assert.equal(asset, null);
});
