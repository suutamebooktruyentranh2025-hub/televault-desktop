const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveDownloadAsset, installUpdate } = require('../githubUpdater');

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

test('installUpdate: on win32 spawns silent installer and triggers quit', async () => {
  let spawnedCmd = null;
  let spawnedArgs = null;
  let unrefCalled = false;
  let quitCalled = false;

  const mockSpawn = (cmd, args) => {
    spawnedCmd = cmd;
    spawnedArgs = args;
    return {
      unref: () => { unrefCalled = true; },
    };
  };

  const res = await installUpdate('C:\\mock\\setup.exe', {
    platform: 'win32',
    skipFileCheck: true,
    spawnFn: mockSpawn,
    quitFn: () => { quitCalled = true; },
  });

  assert.equal(res.ok, true);
  assert.equal(res.platform, 'win32');
  assert.equal(spawnedCmd, 'C:\\mock\\setup.exe');
  assert.deepEqual(spawnedArgs, ['/S', '--updated']);
  assert.equal(unrefCalled, true);
});

test('installUpdate: on darwin mounts DMG, copies app, detaches DMG, and relaunches', async () => {
  const execCommands = [];
  const mockExecFile = async (cmd, args) => {
    execCommands.push({ cmd, args });
    return { stdout: '', stderr: '' };
  };

  let relaunchOpts = null;
  let exitCode = null;

  const res = await installUpdate('/mock/TeleVault-0.3.3.dmg', {
    platform: 'darwin',
    skipFileCheck: true,
    mountPoint: '/Volumes/MockMount',
    execFileAsync: mockExecFile,
    readDirSync: () => ['TeleVault.app'],
    existsSync: (p) => p === '/Applications/TeleVault.app',
    execPath: '/Applications/TeleVault.app/Contents/MacOS/TeleVault',
    relaunchFn: (opts) => { relaunchOpts = opts; },
    exitFn: (code) => { exitCode = code; },
  });

  assert.equal(res.ok, true);
  assert.equal(res.platform, 'darwin');
  assert.equal(res.action, 'relaunched');

  // Verify command sequence
  assert.equal(execCommands.length, 4);
  assert.deepEqual(execCommands[0], {
    cmd: 'hdiutil',
    args: ['attach', '/mock/TeleVault-0.3.3.dmg', '-mountpoint', '/Volumes/MockMount', '-nobrowse', '-quiet'],
  });
  assert.deepEqual(execCommands[1], {
    cmd: 'rm',
    args: ['-rf', '/Applications/TeleVault.app'],
  });
  assert.deepEqual(execCommands[2], {
    cmd: 'cp',
    args: ['-R', '/Volumes/MockMount/TeleVault.app', '/Applications/'],
  });
  assert.deepEqual(execCommands[3], {
    cmd: 'hdiutil',
    args: ['detach', '/Volumes/MockMount', '-quiet'],
  });

  assert.deepEqual(relaunchOpts, {
    execPath: '/Applications/TeleVault.app/Contents/MacOS/TeleVault',
  });
  assert.equal(exitCode, 0);
});

test('installUpdate: on darwin falls back to openPath if mounting/copying fails', async () => {
  const execCommands = [];
  const mockExecFile = async (cmd, args) => {
    execCommands.push({ cmd, args });
    if (cmd === 'hdiutil' && args[0] === 'attach') {
      throw new Error('Permission denied or corrupted DMG');
    }
    return { stdout: '', stderr: '' };
  };

  let openedPath = null;
  const res = await installUpdate('/mock/TeleVault-0.3.3.dmg', {
    platform: 'darwin',
    skipFileCheck: true,
    mountPoint: '/Volumes/MockMount',
    execFileAsync: mockExecFile,
    openPathFn: async (p) => { openedPath = p; },
  });

  assert.equal(res.ok, true);
  assert.equal(res.platform, 'darwin');
  assert.equal(res.action, 'opened_fallback');
  assert.equal(res.fallback, true);
  assert.equal(openedPath, '/mock/TeleVault-0.3.3.dmg');
  // Detach was attempted in cleanup
  assert.ok(execCommands.some((c) => c.cmd === 'hdiutil' && c.args[0] === 'detach'));
});

