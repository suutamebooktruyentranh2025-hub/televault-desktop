const { decodeCaption } = require('@televault/core');

const VAULT_MARKER = '#televault-v1';

class ChannelService {
  /**
   * @param {import('tdl').Client} client
   * @param {import('../db/indexDb')} db
   */
  constructor(client, db) {
    this.client = client;
    this.db = db;
    /** @type {((() => void) | null)} */
    this._onChange = null;
    /** @type {((oldId: number, newId: number) => void) | null} */
    this._onMessageSendSucceeded = null;
    /** @type {((oldId: number) => void) | null} */
    this._onMessageSendFailed = null;
    /** @type {((update: unknown) => void) | null} */
    this._updateHandler = null;
    /** Message ids của upload đang chạy — không index document cho đến khi upload xong. */
    this._pendingUploadIds = new Set();
    /** Vault paths đang upload — đặt trước sendMessage để chặn updateNewMessage đồng bộ. */
    this._pendingUploadPaths = new Set();
  }

  /** @param {string} destPath */
  markUploadPath(destPath) {
    if (destPath) this._pendingUploadPaths.add(destPath);
  }

  /** @param {string} destPath */
  clearUploadPath(destPath) {
    if (destPath) this._pendingUploadPaths.delete(destPath);
  }

  /** @param {number} messageId */
  markUploadPending(messageId) {
    if (messageId > 0) this._pendingUploadIds.add(messageId);
  }

  /** @param {...(number|null|undefined)} messageIds */
  clearUploadPending(...messageIds) {
    for (const id of messageIds) {
      if (id != null && id > 0) this._pendingUploadIds.delete(id);
    }
  }

  /** @param {number} oldId @param {number} newId */
  rekeyUploadPending(oldId, newId) {
    if (this._pendingUploadIds.has(oldId)) {
      this._pendingUploadIds.delete(oldId);
      if (newId > 0) this._pendingUploadIds.add(newId);
    }
  }

  /** @param {Record<string, unknown>} msg */
  _shouldIndexMessage(msg) {
    if (!this._isDocumentMessage(msg)) return true;
    const id = this._tdId(msg.id);
    if (id > 0 && this._pendingUploadIds.has(id)) return false;
    const entry = this.entryFromMessage(msg);
    if (entry && this._pendingUploadPaths.has(entry.path)) return false;
    return true;
  }

  onChange(fn) {
    this._onChange = fn;
  }

  onMessageSendSucceeded(fn) {
    this._onMessageSendSucceeded = fn;
  }

  onMessageSendFailed(fn) {
    this._onMessageSendFailed = fn;
  }

  _tdId(v) {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') return Number.parseInt(v, 10) || -1;
    return -1;
  }

  _emitChange() {
    this._onChange?.();
  }

  async createVaultChannel() {
    const chat = await this.client.invoke({
      _: 'createNewSupergroupChat',
      title: 'TeleVault Storage',
      is_channel: true,
      description: `Kho file TeleVault — không xoá kênh này. ${VAULT_MARKER}`,
    });
    return chat.id;
  }

  async findVaultChannel() {
    const chats = await this.client.invoke({
      _: 'getChats',
      chat_list: { _: 'chatListMain' },
      limit: 200,
    });
    for (const chatId of chats.chat_ids || []) {
      try {
        const chat = await this.client.invoke({ _: 'getChat', chat_id: chatId });
        const type = chat.type;
        if (type?._ !== 'chatTypeSupergroup' || !type.is_channel) continue;
        
        const supergroup = await this.client.invoke({
          _: 'getSupergroup',
          supergroup_id: type.supergroup_id,
        });
        if (supergroup.status?._ !== 'chatMemberStatusCreator') continue;

        const full = await this.client.invoke({
          _: 'getSupergroupFullInfo',
          supergroup_id: type.supergroup_id,
        });
        if (String(full.description || '').includes(VAULT_MARKER)) {
          // Network check to ensure we ACTUALLY have access
          await this.client.invoke({
            _: 'getChatHistory',
            chat_id: chatId,
            from_message_id: 0,
            offset: 0,
            limit: 1,
            only_local: false,
          });
          return chatId;
        }
      } catch (e) {
        console.warn('[TeleVault] Skipping chat during search due to error:', e.message);
      }
    }
    return null;
  }

  async isVaultChat(chatId) {
    try {
      const chat = await this.client.invoke({ _: 'getChat', chat_id: chatId });
      const type = chat.type;
      if (type?._ !== 'chatTypeSupergroup' || !type.is_channel) return false;
      
      const supergroup = await this.client.invoke({
        _: 'getSupergroup',
        supergroup_id: type.supergroup_id,
      });
      if (supergroup.status?._ !== 'chatMemberStatusCreator') return false;

      const full = await this.client.invoke({
        _: 'getSupergroupFullInfo',
        supergroup_id: type.supergroup_id,
      });
      if (!String(full.description || '').includes(VAULT_MARKER)) return false;
      // Network check to ensure we ACTUALLY have access
      await this.client.invoke({
        _: 'getChatHistory',
        chat_id: chatId,
        from_message_id: 0,
        offset: 0,
        limit: 1,
        only_local: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  async resolveVaultChatId() {
    const cached = this.db.getVaultChatId();
    if (cached != null && (await this.isVaultChat(cached))) return cached;
    const found = await this.findVaultChannel();
    if (found != null) {
      this.db.setVaultChatId(found);
      return found;
    }
    const created = await this.createVaultChannel();
    this.db.setVaultChatId(created);
    return created;
  }

  entryFromMessage(msg) {
    const content = msg.content;
    const id = msg.id;
    if (!content) return null;
    if (content._ === 'messageDocument') {
      const caption = content.caption?.text || '';
      return decodeCaption(id, caption);
    }
    if (content._ === 'messageText') {
      const text = content.text?.text || '';
      return decodeCaption(id, text);
    }
    return null;
  }

  _isDocumentMessage(msg) {
    return msg?.content?._ === 'messageDocument';
  }

  async scanHistory(chatId, onProgress, opts = {}) {
    if (opts.forceFull === true) {
      return this._scanHistoryFull(chatId, onProgress);
    }
    const lastKnown = this.db.getLastMessageId();
    const hasLocalIndex = lastKnown > 0 && this.db.countEntries() > 0;

    if (hasLocalIndex) {
      return this._scanHistoryIncremental(chatId, lastKnown, onProgress);
    }
    return this._scanHistoryFull(chatId, onProgress);
  }

  /**
   * Full network history walk — used on first sync or empty local index.
   * Reconciles DB to the complete set of message ids seen on Telegram.
   */
  async _scanHistoryFull(chatId, onProgress) {
    let fromMessageId = 0;
    let scanned = 0;
    let maxId = 0;
    const seenIds = new Set();

    while (true) {
      const page = await this.client.invoke({
        _: 'getChatHistory',
        chat_id: chatId,
        from_message_id: fromMessageId,
        offset: 0,
        limit: 100,
        only_local: false,
      });
      const messages = page.messages || [];
      if (messages.length === 0) break;

      for (const msg of messages) {
        const id = msg.id;
        seenIds.add(id);
        const entry = this.entryFromMessage(msg);
        if (entry) this.db.upsert(entry);
        scanned += 1;
        if (id > maxId) maxId = id;
      }

      const nextFrom = messages[messages.length - 1].id;
      if (nextFrom === fromMessageId) break;
      fromMessageId = nextFrom;
      onProgress?.(scanned);
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    this.db.reconcileToMessageIds(seenIds);
    this.db.setLastMessageId(maxId);
    this._emitChange();
    return scanned;
  }

  /**
   * Fetch only messages newer than lastKnown. Does not reconcile — offline
   * deletes are handled by listenUpdates while the app is running.
   */
  async _scanHistoryIncremental(chatId, lastKnown, onProgress) {
    let fromMessageId = 0;
    let scanned = 0;
    let maxId = lastKnown;

    while (true) {
      const page = await this.client.invoke({
        _: 'getChatHistory',
        chat_id: chatId,
        from_message_id: fromMessageId,
        offset: 0,
        limit: 100,
        only_local: false,
      });
      const messages = page.messages || [];
      if (messages.length === 0) break;

      let hitKnown = false;
      for (const msg of messages) {
        const id = msg.id;
        if (id <= lastKnown) {
          hitKnown = true;
          continue;
        }
        const entry = this.entryFromMessage(msg);
        if (entry) this.db.upsert(entry);
        scanned += 1;
        if (id > maxId) maxId = id;
      }

      onProgress?.(scanned);
      if (hitKnown) break;

      const nextFrom = messages[messages.length - 1].id;
      if (nextFrom === fromMessageId) break;
      fromMessageId = nextFrom;
      await new Promise((resolve) => setTimeout(resolve, 40));
    }

    this.db.setLastMessageId(maxId);
    this._emitChange();
    return scanned;
  }

  /** Re-index folder marker text messages so caption tags match local DB. */
  async resyncDirMarkers(chatId) {
    let fromMessageId = 0;
    while (true) {
      const page = await this.client.invoke({
        _: 'getChatHistory',
        chat_id: chatId,
        from_message_id: fromMessageId,
        offset: 0,
        limit: 100,
        only_local: false,
      });
      const messages = page.messages || [];
      if (messages.length === 0) break;

      for (const msg of messages) {
        if (msg.content?._ !== 'messageText') continue;
        const entry = this.entryFromMessage(msg);
        if (entry?.path.endsWith('/')) this.db.upsert(entry);
      }

      const nextFrom = messages[messages.length - 1].id;
      if (nextFrom === fromMessageId) break;
      fromMessageId = nextFrom;
    }

    this.db.reconcileFolderTagsFromMarkers();
    this._emitChange();
  }

  listenUpdates(chatId) {
    if (this._updateHandler) {
      this.client.off('update', this._updateHandler);
    }
    this._updateHandler = async (u) => {
      try {
        switch (u._) {
          case 'updateNewMessage': {
            const msg = u.message;
            if (msg.chat_id !== chatId) return;
            // Outgoing messages get a temporary negative id until Telegram confirms send.
            if (this._tdId(msg.id) < 0) break;
            if (!this._shouldIndexMessage(msg)) break;
            const entry = this.entryFromMessage(msg);
            if (entry) {
              this.db.upsert(entry);
              this._emitChange();
            }
            break;
          }
          case 'updateMessageSendSucceeded': {
            const msg = u.message;
            if (!msg || msg.chat_id !== chatId) break;
            const oldId = this._tdId(u.old_message_id);
            const newId = this._tdId(msg.id);
            this.rekeyUploadPending(oldId, newId);
            if (oldId !== newId) this.db.rekeyMessageId(oldId, newId);
            if (!this._isDocumentMessage(msg)) {
              const entry = this.entryFromMessage(msg);
              if (entry) {
                this.db.upsert(entry);
                this._emitChange();
              }
            }
            this._onMessageSendSucceeded?.(oldId, newId);
            break;
          }
          case 'updateMessageSendFailed': {
            const oldId = this._tdId(u.old_message_id);
            if (oldId < 0) {
              this.db.delete(oldId);
              this._emitChange();
            }
            this._onMessageSendFailed?.(oldId);
            break;
          }
          case 'updateDeleteMessages': {
            if (u.chat_id !== chatId || !u.is_permanent) return;
            for (const id of u.message_ids || []) {
              this.db.delete(id);
            }
            this._emitChange();
            break;
          }
          case 'updateMessageContent': {
            if (u.chat_id !== chatId) return;
            const msgId = this._tdId(u.message_id);
            if (msgId > 0 && this._pendingUploadIds.has(msgId)) return;
            const entry = this.entryFromMessage({
              id: u.message_id,
              content: u.new_content,
            });
            if (entry) {
              this.db.upsert(entry);
              this._emitChange();
            }
            break;
          }
          default:
            break;
        }
      } catch (e) {
        console.error('[ChannelService update]', e);
      }
    };
    this.client.on('update', this._updateHandler);
  }

  dispose() {
    if (this._updateHandler) {
      this.client.off('update', this._updateHandler);
      this._updateHandler = null;
    }
  }

  /** @param {Record<string, unknown>} msg */
  tdFileIdFromMessage(msg) {
    const content = msg.content;
    if (!content || content._ !== 'messageDocument') return null;
    const doc = content.document;
    if (!doc) return null;
    const inner = doc.document ?? doc;
    const id = inner?.id ?? doc.id;
    if (id == null) return null;
    return typeof id === 'number' ? id : Number.parseInt(String(id), 10);
  }

  /**
   * Sweeps and deletes any stuck outgoing messages (sending_state) in the given chat
   * and all chats in chatListMain to prevent TDLib from repeatedly failing and spamming "Can't resend local file".
   * @param {number} [chatId]
   * @returns {Promise<number>} Number of swept messages
   */
  async sweepStuckSendingMessages(chatId) {
    try {
      const chatIds = new Set();
      if (chatId) chatIds.add(chatId);

      const chats = await this.client.invoke({
        _: 'getChats',
        chat_list: { _: 'chatListMain' },
        limit: 100,
      }).catch(() => null);
      for (const id of chats?.chat_ids || []) chatIds.add(id);

      let totalSwept = 0;
      for (const id of chatIds) {
        let fromMessageId = 0;
        const toDelete = [];

        while (true) {
          const page = await this.client.invoke({
            _: 'getChatHistory',
            chat_id: id,
            from_message_id: fromMessageId,
            offset: 0,
            limit: 100,
            only_local: true,
          }).catch(() => null);

          if (!page?.messages || page.messages.length === 0) break;

          for (const msg of page.messages) {
            if (msg.sending_state) {
              toDelete.push(msg.id);
            }
          }

          const nextFrom = page.messages[page.messages.length - 1].id;
          if (nextFrom === fromMessageId) break;
          fromMessageId = nextFrom;
        }

        if (toDelete.length > 0) {
          for (let i = 0; i < toDelete.length; i += 100) {
            const chunk = toDelete.slice(i, i + 100);
            await this.client.invoke({
              _: 'deleteMessages',
              chat_id: id,
              message_ids: chunk,
              revoke: true,
            }).catch(() => {});
          }
          console.log(`[TeleVault] Swept ${toDelete.length} stuck sending messages in chat ${id}`);
          totalSwept += toDelete.length;
        }
      }
      return totalSwept;
    } catch (e) {
      console.warn(`[TeleVault] sweepStuckSendingMessages warning:`, e.message);
      return 0;
    }
  }

  /**
   * Scan chatListMain for all channels with #televault-v1, excluding a given chatId.
   * @param {import('tdl').Client} client
   * @param {number|null} excludeChatId - own vault chatId to exclude
   * @returns {Promise<Array<{ chatId: number, title: string }>>}
   */
  static async findAllVaultChannels(client, excludeChatId) {
    const chats = await client.invoke({
      _: 'getChats',
      chat_list: { _: 'chatListMain' },
      limit: 200,
    });
    const results = [];
    for (const chatId of chats.chat_ids || []) {
      if (chatId === excludeChatId) continue;
      try {
        const chat = await client.invoke({ _: 'getChat', chat_id: chatId });
        const type = chat.type;
        if (type?._ !== 'chatTypeSupergroup' || !type.is_channel) continue;
        const full = await client.invoke({
          _: 'getSupergroupFullInfo',
          supergroup_id: type.supergroup_id,
        });
        const description = String(full.description || '');
        const title = String(chat.title || '');
        console.log(`[TeleVault] Checking channel: ${title} (${chatId}) - Description: ${description}`);
        if (description.includes(VAULT_MARKER) || title.includes(VAULT_MARKER)) {
          console.log(`[TeleVault] Found Shared Vault: ${title} (${chatId})`);
          results.push({ chatId, title: chat.title || `Vault ${chatId}` });
        }
      } catch (err) {
        // skip inaccessible chats
        console.log(`[TeleVault] Skipping chat ${chatId} due to error: ${err.message}`);
      }
    }
    return results;
  }
}

module.exports = { ChannelService };
