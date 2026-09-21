const { bootstrapTelegram } = require('./bootstrap');
const { createInteractiveAuth } = require('./authService');
const { ChannelService } = require('./channelService');
const { wrapClientWithFloodRetry, FloodWaitError } = require('./floodRetry');
const { TransferQueue } = require('../transfer/transferQueue');
const { VaultService } = require('../vault/vaultService');
const { SharedVaultManager } = require('../vault/sharedVaultManager');

const {
  broadcastVaultChanged,
  broadcastTransfersChanged,
  broadcastSharedVaultsChanged,
  broadcastMoveProgress,
} = require('../ipc/vaultHandlers');

class TelegramCoordinator {
  /**
   * @param {{ 
   *   userDataPath: string, 
   *   onUploadDone?: (destPath: string) => void,
   *   onSyncReady?: () => void,
   *   onChange?: () => void,
   *   onAccountInfo?: (info: { name: string, phone: string }) => void,
   * }} opts
   */
  constructor(opts) {
    this.userDataPath = opts.userDataPath;
    this.onUploadDone = opts.onUploadDone || (() => {});
    this.onSyncReady = opts.onSyncReady || (() => {});
    this.onChange = opts.onChange || (() => {});
    this.onAccountInfo = opts.onAccountInfo || (() => {});

    /** @type {import('tdl').Client | null} */
    this.client = null;
    /** @type {ReturnType<import('../db/indexDb').openIndexDb> | null} */
    this.db = null;
    /** @type {ReturnType<createInteractiveAuth> | null} */
    this.auth = null;
    /** @type {ChannelService | null} */
    this.channel = null;
    /** @type {VaultService | null} */
    this.vault = null;
    /** @type {TransferQueue | null} */
    this.queue = null;
    this.chatId = null;

    this.authState = 'starting';
    this.authError = null;
    this.authDetail = {};
    this.syncError = null;
    this.scannedCount = 0;
    this.entryCount = 0;
    this.bootError = null;
    /** Seconds remaining for Telegram flood wait; 0 when not waiting. */
    this.floodWaitSec = 0;
    this._booting = false;
    this._syncGen = 0;
    this._loginEpoch = 0;
    this.syncComplete = false;
    /** @type {SharedVaultManager | null} */
    this.sharedVaults = null;
    /** @type {Promise<void>} */
    this._lifecycle = Promise.resolve();
    this._floodInterval = null;
  }

  setFloodWait(waitSec) {
    if (this._floodInterval) {
      clearInterval(this._floodInterval);
      this._floodInterval = null;
    }
    this.floodWaitSec = Math.max(0, waitSec);
    this.onChange();

    if (this.floodWaitSec > 0) {
      this._floodInterval = setInterval(() => {
        this.floodWaitSec = Math.max(0, this.floodWaitSec - 1);
        this.onChange();
        if (this.floodWaitSec <= 0) {
          this.clearFloodWait();
        }
      }, 1000);
    }
  }

  clearFloodWait() {
    if (this._floodInterval) {
      clearInterval(this._floodInterval);
      this._floodInterval = null;
    }
    if (this.floodWaitSec !== 0) {
      this.floodWaitSec = 0;
      this.onChange();
    }
  }

  isActive() {
    return Boolean(this.client) || this._booting;
  }

  /** @param {() => Promise<void>} fn */
  _enqueue(fn) {
    const next = this._lifecycle.then(fn);
    this._lifecycle = next.catch(() => {});
    return next;
  }

  getSnapshot() {
    return {
      authState: this.authState,
      authError: this.authError,
      authDetail: this.authDetail,
      syncError: this.syncError,
      scannedCount: this.scannedCount,
      entryCount: this.entryCount,
      bootError: this.bootError,
      floodWaitSec: this.floodWaitSec,
      booting: this._booting,
      syncComplete: this.syncComplete,
      sharedVaults: this.sharedVaults?.getDiscoveredVaults() || [],
    };
  }

  async checkAccountStatus() {
    if (!this.client || this.authState !== 'ready') {
      return {
        connected: false,
        floodWaitSec: this.floodWaitSec,
        restrictionReason: null,
        isPremium: false,
        canPostMessages: false,
        status: 'disconnected',
      };
    }
    try {
      const me = await this.client.invoke({ _: 'getMe' });
      const restrictionReason = me.restriction_reason || null;
      const isPremium = Boolean(me.is_premium);
      let canPostMessages = true;
      if (this.chatId) {
        try {
          const member = await this.client.invoke({
            _: 'getChatMember',
            chat_id: this.chatId,
            member_id: { _: 'messageSenderUser', user_id: me.id },
          });
          const memberStatus = member?.status?._;
          if (memberStatus === 'chatMemberStatusBanned' || memberStatus === 'chatMemberStatusLeft') {
            canPostMessages = false;
          } else if (memberStatus === 'chatMemberStatusRestricted') {
            canPostMessages = Boolean(member.status.permissions?.can_send_basic_messages !== false);
          }
        } catch {
          // ignore chat member check errors if chat not resolved yet
        }
      }
      return {
        connected: true,
        floodWaitSec: this.floodWaitSec,
        restrictionReason,
        isPremium,
        canPostMessages,
        status: this.floodWaitSec > 0 ? 'flood_wait' : (restrictionReason || !canPostMessages) ? 'restricted' : 'ok',
      };
    } catch (err) {
      return {
        connected: false,
        floodWaitSec: this.floodWaitSec,
        restrictionReason: null,
        isPremium: false,
        canPostMessages: false,
        error: String(err?.message || err),
        status: 'error',
      };
    }
  }

  async shutdown() {
    return this._enqueue(() => this._shutdownInternal());
  }

  async _shutdownInternal() {
    this._syncGen += 1;
    this.clearFloodWait();
    this.vault?.cancelJournalResume({ prune: false });
    this.channel?.dispose();
    this.channel = null;
    this.vault = null;
    this.queue = null;
    this.chatId = null;
    this.sharedVaults?.dispose();
    this.sharedVaults = null;
    const client = this.client;
    this.client = null;
    await this.auth?.close();
    this.auth = null;
    if (client) {
      try {
        await client.close();
      } catch {
        /* ignore */
      }
    }
    this.db?.close();
    this.db = null;
    this.authState = 'starting';
    this.authDetail = {};
    this.scannedCount = 0;
    this.entryCount = 0;
    this.floodWaitSec = 0;
    this.syncComplete = false;
    this.onChange();
  }

  /** @param {Promise<unknown>} loginPromise */
  _trackLoginPromise(loginPromise) {
    const epoch = ++this._loginEpoch;
    loginPromise.catch((e) => {
      if (epoch !== this._loginEpoch) return;
      this.authError = formatAuthError(e);
      this.onChange();
    });
  }

  /**
   * @param {{ apiId: number, apiHash: string }} creds
   */
  async start(creds) {
    return this._enqueue(() => this._bootInternal(creds));
  }

  /**
   * @param {{ apiId: number, apiHash: string }} creds
   */
  async _bootInternal(creds) {
    await this._shutdownInternal();
    this._booting = true;
    this.bootError = null;
    this.authError = null;
    this.syncError = null;
    this.authState = 'starting';
    this.onChange();

    try {
      const boot = await bootstrapTelegram({
        userDataPath: this.userDataPath,
        apiId: creds.apiId,
        apiHash: creds.apiHash,
      });
      this.client = wrapClientWithFloodRetry(boot.client, {
        onWait: ({ waitSec }) => {
          this.setFloodWait(waitSec);
        },
        onResume: () => {
          this.clearFloodWait();
        },
      });
      this.db = boot.db;

      this.auth = createInteractiveAuth(boot.client, (state, detail) => {
        this.authState = state;
        this.authDetail = detail || this.auth?.authDetail || {};
        if (state === 'ready') {
          void this.client.invoke({
            _: 'setNetworkType',
            type: { _: 'networkTypeWiFi' },
          }).catch((err) => console.warn('[TelegramCoordinator] setNetworkType error:', err?.message || err));
          void this.client.invoke({ _: 'getMe' }).then(me => {
            const name = [me.first_name, me.last_name].filter(Boolean).join(' ') || 'User';
            const phone = me.phone_number ? '+' + me.phone_number : '';
            const restrictionReason = me.restriction_reason || null;
            const isPremium = Boolean(me.is_premium);
            this.onAccountInfo?.({ name, phone, restrictionReason, isPremium });
          }).catch(err => console.error('[TelegramCoordinator] getMe error', err));
          this._enqueue(() => this._runSync());
        } else if (state === 'waitPassword' || state.startsWith('wait')) {
          this.syncComplete = false;
        }
        if (state === 'loggedOut') {
          this.scannedCount = 0;
          this.entryCount = 0;
        }
        this.onChange();
      });

      this._booting = false;
      this.onChange();

      this._trackLoginPromise(this.auth.runLogin());
    } catch (e) {
      this._booting = false;
      this.bootError = formatAuthError(e);
      this.onChange();
      throw e;
    }
  }

  async _runSync() {
    const gen = ++this._syncGen;
    this.syncError = null;
    this.syncComplete = false;
    this.scannedCount = 0;
    this.floodWaitSec = 0;
    this.onChange();

    try {
      if (!this.client || !this.db) return;
      
      this.channel?.dispose();
      const ch = new ChannelService(this.client, this.db);
      let chatId;
      try {
        chatId = await ch.resolveVaultChatId();
      } catch (e) {
        throw new Error(`resolveVaultChatId failed: ${e.message}`);
      }
      
      if (gen !== this._syncGen) return;

      await ch.sweepStuckSendingMessages(chatId);
      if (gen !== this._syncGen) return;

      ch.listenUpdates(chatId);
      this.db.deleteTemporaryMessageIds();
      if (gen !== this._syncGen) return;

      try {
        await ch.scanHistory(chatId, (n) => {
          if (gen !== this._syncGen) return;
          this.scannedCount = n;
          this.onChange();
        });
      } catch (e) {
        throw new Error(`scanHistory failed: ${e.message}`);
      }
      
      if (gen !== this._syncGen) return;

      this.channel = ch;
      this.chatId = chatId;
      this.queue = new TransferQueue({
        maxConcurrent: Number(this.db.getSetting('max_concurrent_transfers', '2')),
        onChange: () => {
          this.onChange();
          broadcastTransfersChanged();
        },
      });
      this.vault = new VaultService({
        client: this.client,
        db: this.db,
        channel: ch,
        queue: this.queue,
        chatId,
        onUploadDone: this.onUploadDone,
        onChange: () => {
          this.entryCount = this.db.listVisibleFileCount();
          broadcastVaultChanged();
          this.onChange();
        },
      });
      try {
        // Local-only: ~1600 remote caption edits would flood Telegram and freeze boot.
        await this.vault.resolveConflictsNow({ syncRemote: false });
        await this.vault.restorePendingTransfers({ autoStart: this.db.getAutoResumeTransfers() });
      } catch (e) {
        throw new Error(`vault initialization failed: ${e.message}`);
      }
      broadcastTransfersChanged();
      ch.onChange(() => {
        this.entryCount = this.db.listVisibleFileCount();
        broadcastVaultChanged();
        this.onChange();
      });
      ch.onMessageSendSucceeded((oldId, newId) => {
        void this.vault.handleMessageSendSucceeded(oldId, newId);
      });
      ch.onMessageSendFailed((oldId) => {
        this.vault.handleMessageSendFailed(oldId);
      });
      this.entryCount = this.db.listVisibleFileCount();
      this.syncComplete = true;
      this.floodWaitSec = 0;
      this.onChange();

      // Discover shared vaults before onSyncReady so GDrive can target them.
      try {
        this.sharedVaults = new SharedVaultManager({
          client: this.client,
          ownChatId: chatId,
          userDataPath: this.userDataPath,
          onChange: () => {
            broadcastSharedVaultsChanged();
            this.onChange();
          },
        });
        await this.sharedVaults.discover();
      } catch (e) {
        console.error('[TeleVault shared-vault discover]', e);
      }

      if (this.onSyncReady) this.onSyncReady();

      // Resume pending journal operations in background without blocking boot.
      void this._startBackgroundJournalResume(gen);
    } catch (e) {
      if (gen !== this._syncGen) return;
      this.syncError = formatAuthError(e);
      this.syncComplete = false;
      this.floodWaitSec = 0;
      console.error('[TeleVault sync]', e);
      this.onChange();
    }
  }

  async _startBackgroundJournalResume(gen) {
    if (!this.vault || !this.db) return;
    const pending = this.db.journalPending();
    if (!pending || pending.length === 0) return;

    console.log(`[TeleVault] Resuming ${pending.length} pending journal operations in background...`);

    broadcastMoveProgress({
      active: true,
      phase: 'resuming',
      current: 0,
      total: pending.length,
      name: '',
    });

    try {
      const result = await this.vault.resumePendingJournal((progress) => {
        if (gen !== this._syncGen) return;
        broadcastMoveProgress({
          ...progress,
          active: true,
          phase: 'resuming',
        });
      });

      if (gen !== this._syncGen) return;

      broadcastMoveProgress({
        active: false,
        phase: 'resuming',
        completed: Boolean(result?.ok),
        cancelled: Boolean(result?.cancelled),
        current: result?.completed || 0,
        total: result?.total || 0,
      });
      broadcastVaultChanged();
    } catch (e) {
      if (gen !== this._syncGen) return;
      if (e instanceof FloodWaitError || e.name === 'FloodWaitError' || e.code === 429) {
        const waitSec = e.waitSec || 60;
        this.setFloodWait(waitSec);
        console.warn(`[TeleVault] Background journal paused due to Telegram rate limit (FLOOD_WAIT_${waitSec})`);
        broadcastMoveProgress({
          active: false,
          paused: true,
          waitSec,
          phase: 'resuming',
          error: `Telegram tạm giới hạn tốc độ (chờ ${waitSec}s)`,
        });
        return;
      }
      console.warn('[TeleVault background journal resume warning]:', e.message);
      broadcastMoveProgress({
        active: false,
        phase: 'resuming',
        error: String(e.message || e),
      });
    }
  }

  submitPhone(phone) {
    try {
      console.log('[TeleVault] submitPhone called with:', phone);
      this.authError = null;
      if (!this.auth) throw new Error('Telegram chưa khởi động xong — vui lòng đợi vài giây.');
      this.auth.submitPhone(phone);
      console.log('[TeleVault] auth.submitPhone successful');
    } catch (e) {
      console.error('[TeleVault] submitPhone error:', e);
      this.authError = formatAuthError(e);
      this.onChange();
    }
  }

  submitCode(code) {
    try {
      this.authError = null;
      if (!this.auth) throw new Error('Telegram chưa khởi động xong — vui lòng đợi vài giây.');
      this.auth.submitCode(code);
    } catch (e) {
      this.authError = formatAuthError(e);
      this.onChange();
    }
  }

  submitEmail(email) {
    try {
      this.authError = null;
      if (!this.auth) throw new Error('Telegram chưa khởi động xong — vui lòng đợi vài giây.');
      this.auth.submitEmail(email);
    } catch (e) {
      this.authError = formatAuthError(e);
      this.onChange();
    }
  }

  submitEmailCode(code) {
    try {
      this.authError = null;
      if (!this.auth) throw new Error('Telegram chưa khởi động xong — vui lòng đợi vài giây.');
      this.auth.submitEmailCode(code);
    } catch (e) {
      this.authError = formatAuthError(e);
      this.onChange();
    }
  }

  submitRegistration(firstName, lastName) {
    try {
      this.authError = null;
      if (!this.auth) throw new Error('Telegram chưa khởi động xong — vui lòng đợi vài giây.');
      this.auth.submitRegistration(firstName, lastName);
    } catch (e) {
      this.authError = formatAuthError(e);
      this.onChange();
    }
  }

  submitPassword(password) {
    try {
      this.authError = null;
      if (!this.auth) throw new Error('Telegram chưa khởi động xong — vui lòng đợi vài giây.');
      this.auth.submitPassword(password);
    } catch (e) {
      this.authError = formatAuthError(e);
      this.onChange();
    }
  }

  async _teardownSessionServices() {
    this._syncGen += 1;
    this.channel?.dispose();
    this.channel = null;
    this.vault = null;
    this.queue = null;
    this.chatId = null;
    this.sharedVaults?.dispose();
    this.sharedVaults = null;
    this.scannedCount = 0;
    this.entryCount = 0;
    this.syncComplete = false;
    this.syncError = null;
  }

  async _waitForAuthState(states, timeoutMs = 30000) {
    const targets = Array.isArray(states) ? states : [states];
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (targets.includes(this.authState)) return this.authState;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Timed out waiting for auth state: ${targets.join(' | ')}`);
  }

  async logOutTelegram(creds) {
    return this._enqueue(async () => {
      this._loginEpoch += 1;
      this._teardownSessionServices();
      this.authError = null;
      this.authDetail = {};

      if (this.auth && this.client) {
        try {
          await this.auth.logOut();
          await this._waitForAuthState(['waitPhone', 'loggedOut']);
        } catch (e) {
          console.error('[TeleVault logout]', e);
        }
      }

      if (this.db) {
        try {
          this.db.close();
          const fs = require('fs');
          const path = require('path');
          const indexPath = path.join(this.userDataPath, 'index.db');
          if (fs.existsSync(indexPath)) fs.unlinkSync(indexPath);
        } catch (e) {
          console.error('[TeleVault] failed to delete index.db', e);
        }
        this.db = null;
      }

      if (creds?.apiId && creds?.apiHash) {
        await this._bootInternal(creds);
        return;
      }
      await this.shutdown();
    });
  }
}

function formatAuthError(e) {
  const s = String(e?.message || e);
  if (s.includes('406') && s.toUpperCase().includes('UPDATE_APP')) {
    return 'TDLib quá cũ — Telegram không cho đăng nhập. Cập nhật prebuilt-tdlib hoặc cài tdlib mới qua Homebrew.';
  }
  return s;
}

module.exports = { TelegramCoordinator };
