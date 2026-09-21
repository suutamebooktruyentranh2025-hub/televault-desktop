const path = require('path');
const fs = require('fs');
const { ChannelService } = require('../telegram/channelService');
const { openIndexDb } = require('../db/indexDb');
const { VaultService } = require('./vaultService');
const {
  listFolder,
  sortFolderListing,
  folderMtime,
  folderSize,
  folderCounts,
  entryName,
  isDir,
  effectiveTagsForPath,
} = require('@televault/core');

class SharedVaultManager {
  /**
   * @param {{ client: import('tdl').Client, ownChatId: number, userDataPath: string, onChange: () => void }} opts
   */
  constructor(opts) {
    this.client = opts.client;
    this.ownChatId = opts.ownChatId;
    this.userDataPath = opts.userDataPath;
    this.onChange = opts.onChange;
    /** @type {Array<{ chatId: number, title: string }>} */
    this._vaults = [];
    /** @type {Map<number, { db: ReturnType<typeof openIndexDb>, channel: ChannelService, scanned: boolean, vaultService?: import('./vaultService').VaultService }>} */
    this._instances = new Map();
  }

  async discover() {
    const from_network = await ChannelService.findAllVaultChannels(this.client, this.ownChatId);
    const by_id = new Map(from_network.map((vault_item) => [vault_item.chatId, vault_item]));

    const candidate_ids = new Set([
      ...from_network.map((vault_item) => vault_item.chatId),
      ...this._vaults.map((vault_item) => vault_item.chatId),
      ...this._listKnownSharedChatIds(),
    ]);
    candidate_ids.delete(this.ownChatId);

    for (const chat_id of candidate_ids) {
      if (by_id.has(chat_id)) continue;
      const verified = await this._verifySharedVaultChat(chat_id);
      if (verified) by_id.set(chat_id, verified);
    }

    this._vaults = [...by_id.values()];
    // Clean up instances for vaults no longer accessible
    for (const [chatId, inst] of this._instances) {
      if (!by_id.has(chatId)) {
        inst.channel.dispose();
        inst.db.close();
        this._instances.delete(chatId);
      }
    }
    this.onChange();
  }

  /** Chat ids previously synced locally under shared-vaults/<chatId>/ */
  _listKnownSharedChatIds() {
    const root = path.join(this.userDataPath, 'shared-vaults');
    if (!fs.existsSync(root)) return [];
    return fs.readdirSync(root)
      .map((name) => Number(name))
      .filter((chat_id) => Number.isFinite(chat_id) && chat_id !== this.ownChatId);
  }

  /**
   * Re-validate a known chat id (disk cache / prior discover) when getChats omitted it.
   * @param {number} chatId
   * @returns {Promise<{ chatId: number, title: string } | null>}
   */
  async _verifySharedVaultChat(chatId) {
    const previous = this._vaults.find((vault_item) => vault_item.chatId === chatId) || null;
    try {
      const chat = await this.client.invoke({ _: 'getChat', chat_id: chatId });
      const type = chat?.type;
      if (type?._ !== 'chatTypeSupergroup' || !type.is_channel) {
        return previous;
      }
      const full = await this.client.invoke({
        _: 'getSupergroupFullInfo',
        supergroup_id: type.supergroup_id,
      });
      const description = String(full?.description || '');
      const title = String(chat.title || '');
      const marker = '#televault-v1';
      if (description.includes(marker) || title.includes(marker)) {
        return { chatId, title: chat.title || previous?.title || `Vault ${chatId}` };
      }
      // Still treat as shared vault if we already have a local index for it.
      if (previous || this._listKnownSharedChatIds().includes(chatId)) {
        return { chatId, title: chat.title || previous?.title || `Vault ${chatId}` };
      }
      return null;
    } catch {
      if (previous) return previous;
      if (this._listKnownSharedChatIds().includes(chatId)) {
        return { chatId, title: previous?.title || `Vault ${chatId}` };
      }
      return null;
    }
  }

  getDiscoveredVaults() {
    return this._vaults.map((v) => ({ ...v }));
  }

  /** @param {number} chatId */
  _ensureInstance(chatId) {
    if (this._instances.has(chatId)) return this._instances.get(chatId);
    const dir = path.join(this.userDataPath, 'shared-vaults', String(chatId));
    fs.mkdirSync(dir, { recursive: true });
    const dbPath = path.join(dir, 'index.db');
    const db = openIndexDb(dbPath);
    const channel = new ChannelService(this.client, db);
    const inst = { db, channel, scanned: false };
    this._instances.set(chatId, inst);
    return inst;
  }

  /** @param {number} chatId */
  async scanVault(chatId) {
    const inst = this._ensureInstance(chatId);
    if (inst.scanned) return;
    inst.channel.listenUpdates(chatId);
    await inst.channel.scanHistory(chatId);
    inst.scanned = true;
    inst.channel.onChange(() => this.onChange());
    this.onChange();
  }

  /**
   * Force a full Telegram history rescan into the shared vault index
   * (ignores session scanned flag and incremental last_message_id shortcut).
   * @param {number} chatId
   * @param {(n: number) => void} [onProgress]
   * @returns {Promise<number>} messages scanned
   */
  async forceRescanVault(chatId, onProgress) {
    const inst = this._ensureInstance(chatId);
    inst.scanned = false;
    inst.channel.listenUpdates(chatId);
    const scanned = await inst.channel.scanHistory(chatId, onProgress, { forceFull: true });
    inst.scanned = true;
    inst.channel.onChange(() => this.onChange());
    this.onChange();
    return scanned;
  }

  /**
   * @param {number} chatId
   * @param {string} folder
   * @param {string} sortField
   * @param {string} sortDirection
   */
  getFiles(chatId, folderPath) {
    const inst = this._instances.get(chatId);
    if (!inst) return [];
    const { filesInVaultFolder } = require('./fileExport');
    return filesInVaultFolder(inst.db.getAll(), folderPath);
  }

  getListing(chatId, folder = '/', sortField = 'name', sortDirection = 'asc') {
    const inst = this._instances.get(chatId);
    if (!inst) return { ok: false, error: 'not_scanned', folders: [], files: [] };
    const all = inst.db.getAll();
    const listing = listFolder(all, folder);
    const sorted = sortFolderListing(listing, all, folder, {
      field: sortField,
      direction: sortDirection,
    });
    const folderItems = sorted.folders.map((name) => {
      const folderPath = `${folder}${name}/`;
      const mtime = folderMtime(all, folderPath);
      const counts = folderCounts(all, folderPath);
      return {
        name,
        path: folderPath,
        mtime: mtime.toISOString(),
        size: folderSize(all, folderPath),
        fileCount: counts.fileCount,
        folderCount: counts.folderCount,
        totalFiles: counts.totalFiles,
        totalFolders: counts.totalFolders,
      };
    });
    const folderTags = inst.db.folderTagsIndex();
    const files = sorted.files.map((e) => ({
      messageId: e.messageId,
      path: e.path,
      name: entryName(e),
      size: e.size,
      sha256: e.sha256,
      mtime: e.mtime.toISOString(),
      tags: effectiveTagsForPath(e.path, folderTags),
      localPath: null,
      isDir: isDir(e),
    }));
    const currentCounts = folderCounts(all, folder);
    return { ok: true, folders: folderItems, files, counts: currentCounts };
  }

  /**
   * @param {number} chatId
   * @param {string} query
   */
  search(chatId, query) {
    const inst = this._instances.get(chatId);
    if (!inst) return { ok: false, files: [] };
    const folderTags = inst.db.folderTagsIndex();
    const files = inst.db.search({ query, tags: [] }).map((e) => ({
      messageId: e.messageId,
      path: e.path,
      name: entryName(e),
      size: e.size,
      sha256: e.sha256,
      mtime: e.mtime.toISOString(),
      tags: effectiveTagsForPath(e.path, folderTags),
      localPath: null,
      isDir: isDir(e),
    }));
    return { ok: true, files };
  }

  /** @param {number} chatId */
  getStats(chatId) {
    const inst = this._instances.get(chatId);
    if (!inst) return { ok: false, count: 0 };
    return { ok: true, count: inst.db.listVisibleFileCount() };
  }

  /**
   * Build (or reuse) a VaultService that uploads into a shared vault channel.
   * Used by GDrive sync when the user selects a non-personal sync target.
   * @param {number|string} chatId
   * @param {{ queue: import('../transfer/transferQueue').TransferQueue, onChange?: () => void }} deps
   */
  async ensureUploadVault(chatId, deps) {
    const numeric_id = typeof chatId === 'number' ? chatId : Number(chatId);
    if (!Number.isFinite(numeric_id)) throw new Error('Invalid shared vault chat id');

    if (!this._vaults.some((vault_item) => vault_item.chatId === numeric_id)) {
      await this.discover();
    }
    if (!this._vaults.some((vault_item) => vault_item.chatId === numeric_id)) {
      throw new Error('Shared vault not found or inaccessible');
    }
    if (!deps?.queue) throw new Error('Transfer queue required for shared vault upload');

    await this.scanVault(numeric_id);
    const inst = this._instances.get(numeric_id);
    if (!inst) throw new Error('Shared vault instance missing');

    if (!inst.vaultService) {
      inst.vaultService = new VaultService({
        client: this.client,
        db: inst.db,
        channel: inst.channel,
        queue: deps.queue,
        chatId: numeric_id,
        onChange: deps.onChange || this.onChange,
      });
    } else {
      inst.vaultService.queue = deps.queue;
      if (deps.onChange) inst.vaultService.onChange = deps.onChange;
    }
    return inst.vaultService;
  }

  /** @param {number} chatId */
  getVaultTitle(chatId) {
    const hit = this._vaults.find((vault_item) => vault_item.chatId === Number(chatId));
    return hit?.title || null;
  }

  /**
   * Returns the entry info so the caller can download via TDLib directly.
   * @param {number} chatId
   * @param {number} messageId
   */
  getDownloadInfo(chatId, messageId) {
    const inst = this._instances.get(chatId);
    if (!inst) return null;
    const entry = inst.db.getByMessageId(messageId);
    if (!entry) return null;
    return { entry, chatId };
  }

  dispose() {
    for (const [, inst] of this._instances) {
      inst.channel.dispose();
      inst.db.close();
    }
    this._instances.clear();
    this._vaults = [];
  }
}

module.exports = { SharedVaultManager };
