const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { SharedVaultManager } = require('../sharedVaultManager');

describe('SharedVaultManager', () => {
  let tmpDir;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sv-test-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeMockClient(chatIds, chatMap, supergroupMap) {
    return {
      invoke: async (req) => {
        if (req._ === 'getChats') return { chat_ids: chatIds };
        if (req._ === 'getChat') return chatMap[req.chat_id] || {};
        if (req._ === 'getSupergroupFullInfo') return supergroupMap[req.supergroup_id] || {};
        return {};
      },
      on: () => {},
      off: () => {},
    };
  }

  test('discover stores shared vaults list', async () => {
    const client = makeMockClient(
      [200],
      { 200: { id: 200, title: 'Friend Vault', type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 20 } } },
      { 20: { description: '#televault-v1' } },
    );

    const mgr = new SharedVaultManager({
      client,
      ownChatId: 100,
      userDataPath: tmpDir,
      onChange: () => {},
    });

    await mgr.discover();
    const vaults = mgr.getDiscoveredVaults();
    assert.equal(vaults.length, 1);
    assert.equal(vaults[0].chatId, 200);
    assert.equal(vaults[0].title, 'Friend Vault');

    mgr.dispose();
  });

  test('getDiscoveredVaults returns empty when none found', async () => {
    const client = makeMockClient([], {}, {});

    const mgr = new SharedVaultManager({
      client,
      ownChatId: 100,
      userDataPath: tmpDir,
      onChange: () => {},
    });

    await mgr.discover();
    assert.deepStrictEqual(mgr.getDiscoveredVaults(), []);
    mgr.dispose();
  });

  test('seeds discovered vaults from existing shared-vaults directories when network discover is empty', async () => {
    const shared_dir = path.join(tmpDir, 'shared-vaults', '-1004310533766');
    fs.mkdirSync(shared_dir, { recursive: true });
    fs.writeFileSync(path.join(shared_dir, 'index.db'), '');

    const client = makeMockClient([], {}, {});
    client.invoke = async (req) => {
      if (req._ === 'getChats') return { chat_ids: [] };
      if (req._ === 'getChat' && req.chat_id === -1004310533766) {
        return {
          id: -1004310533766,
          title: 'TeleVault Storage',
          type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 99 },
        };
      }
      if (req._ === 'getSupergroupFullInfo') {
        return { description: '#televault-v1' };
      }
      return {};
    };

    const mgr = new SharedVaultManager({
      client,
      ownChatId: -1004360325905,
      userDataPath: tmpDir,
      onChange: () => {},
    });

    await mgr.discover();
    const vaults = mgr.getDiscoveredVaults();
    assert.equal(vaults.length, 1);
    assert.equal(vaults[0].chatId, -1004310533766);
    assert.equal(vaults[0].title, 'TeleVault Storage');
    mgr.dispose();
  });

  test('discover does not wipe previously known vaults when getChats returns none', async () => {
    const client = makeMockClient(
      [200],
      { 200: { id: 200, title: 'Friend Vault', type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 20 } } },
      { 20: { description: '#televault-v1' } },
    );
    const mgr = new SharedVaultManager({
      client,
      ownChatId: 100,
      userDataPath: tmpDir,
      onChange: () => {},
    });
    await mgr.discover();
    assert.equal(mgr.getDiscoveredVaults().length, 1);

    client.invoke = async (req) => {
      if (req._ === 'getChats') return { chat_ids: [] };
      if (req._ === 'getChat' && req.chat_id === 200) {
        return { id: 200, title: 'Friend Vault', type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 20 } };
      }
      if (req._ === 'getSupergroupFullInfo') return { description: '#televault-v1' };
      return {};
    };
    await mgr.discover();
    assert.equal(mgr.getDiscoveredVaults().length, 1);
    assert.equal(mgr.getDiscoveredVaults()[0].chatId, 200);
    mgr.dispose();
  });

  test('ensureUploadVault returns VaultService for discovered shared chat', async () => {
    const client = makeMockClient(
      [200],
      { 200: { id: 200, title: 'Friend Vault', type: { _: 'chatTypeSupergroup', is_channel: true, supergroup_id: 20 } } },
      { 20: { description: '#televault-v1' } },
    );

    const mgr = new SharedVaultManager({
      client,
      ownChatId: 100,
      userDataPath: tmpDir,
      onChange: () => {},
    });
    await mgr.discover();

    const fake_db = { getAll: () => [], close: () => {} };
    const fake_channel = { listenUpdates: () => {}, dispose: () => {}, onChange: () => {} };
    mgr.scanVault = async (chatId) => {
      const id = Number(chatId);
      if (!mgr._instances.has(id)) {
        mgr._instances.set(id, { db: fake_db, channel: fake_channel, scanned: true });
      } else {
        mgr._instances.get(id).scanned = true;
      }
    };

    const queue = { add: () => Promise.resolve(), cancel: () => {}, onStatusChange: null };
    const vault = await mgr.ensureUploadVault(200, { queue });
    assert.equal(vault.chatId, 200);
    assert.equal(typeof vault.enqueueUpload, 'function');
    assert.equal(vault.db, fake_db);

    const again = await mgr.ensureUploadVault(200, { queue });
    assert.equal(again, vault);

    mgr.dispose();
  });
});
