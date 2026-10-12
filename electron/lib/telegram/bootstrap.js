const fs = require('fs');
const path = require('path');
const { ensureTdlibConfigured } = require('./tdConfig');
const { openIndexDb } = require('../db/indexDb');

function hasExistingTdDb(tdDir) {
  if (!fs.existsSync(tdDir)) return false;
  /** @param {string} dir */
  function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (
        name.startsWith('td.') ||
        name === 'db.sqlite' ||
        name.endsWith('.binlog')
      ) {
        return true;
      }
      if (fs.statSync(full).isDirectory() && walk(full)) return true;
    }
    return false;
  }
  return walk(tdDir);
}

function loadOrCreateDbKey(tdDir) {
  const keyFile = path.join(tdDir, 'db_key');
  if (!hasExistingTdDb(tdDir)) return '';
  if (!fs.existsSync(keyFile)) return '';
  const raw = fs.readFileSync(keyFile, 'utf8').trim();
  if (!raw) return '';
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    const bytes = Buffer.from(raw, 'hex');
    const b64 = bytes.toString('base64');
    fs.writeFileSync(keyFile, b64, 'utf8');
    return b64;
  }
  return raw;
}

/**
 * @param {{ userDataPath: string, apiId: number, apiHash: string }} opts
 */
async function bootstrapTelegram(opts) {
  ensureTdlibConfigured();
  const tdl = require('tdl');

  const { userDataPath, apiId, apiHash } = opts;
  if (!apiId || !apiHash) {
    throw new Error('Thiếu Telegram API credentials');
  }

  const tdDir = path.join(userDataPath, 'td');
  const filesDir = path.join(tdDir, 'files');
  fs.mkdirSync(filesDir, { recursive: true });

  const dbKey = loadOrCreateDbKey(tdDir);
  const indexPath = path.join(userDataPath, 'index.db');
  const db = openIndexDb(indexPath);

  const client = tdl.createClient({
    apiId,
    apiHash,
    databaseDirectory: tdDir,
    filesDirectory: filesDir,
    databaseEncryptionKey: dbKey,
    tdlibParameters: {
      use_message_database: false,
      use_secret_chats: false,
      system_language_code: 'vi',
      application_version: '1.0.0',
      device_model: 'TeleVault Desktop',
      system_version: process.platform,
      api_id: apiId,
      api_hash: apiHash,
      database_directory: tdDir,
      files_directory: filesDir,
      use_test_dc: false,
      use_file_database: true,
      use_chat_info_database: true,
    },
  });

  client.on('error', (err) => {
    console.error('[TDLib]', err);
  });

  return { client, db, tdDir, filesDir };
}

module.exports = { bootstrapTelegram };
