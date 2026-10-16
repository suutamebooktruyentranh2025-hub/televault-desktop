const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const {
  entryName,
  isDir,
  effectiveTagsForPath,
  isInTrash,
  pathFromTrash,
} = require('@televault/core');

/** 
 * @param {import('../../db/indexDb').ReturnType<import('../../db/indexDb').openIndexDb>} db 
 * @param {any} e
 * @param {Record<string, string[]>|null} [preloadedFolderTags=null]
 */
function serializeEntry(db, e, preloadedFolderTags = null) {
  const folderTags = preloadedFolderTags || db.folderTagsIndex();
  const tags = e.path.endsWith('/')
    ? e.tags || []
    : effectiveTagsForPath(e.path, folderTags);
  const inTrash = isInTrash(e.path);
  return {
    messageId: e.messageId,
    path: e.path,
    name: entryName(e),
    size: e.size,
    sha256: e.sha256,
    mtime: e.mtime instanceof Date ? e.mtime.toISOString() : new Date(e.mtime).toISOString(),
    tags,
    localPath: e.localPath ?? null,
    isDir: isDir(e),
    originalPath: inTrash ? pathFromTrash(e.path) : null,
  };
}

/** @param {string} dir @returns {Array<{ rel: string, full: string }>} */
function walkFilesEntries(dir, prefix = '') {
  /** @type {Array<{ rel: string, full: string }>} */
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    if (fs.statSync(full).isDirectory()) out.push(...walkFilesEntries(full, rel));
    else out.push({ rel: rel.replace(/\\/g, '/'), full });
  }
  return out;
}

function safeSend(win, channel, ...args) {
  try {
    if (!win || typeof win.isDestroyed !== 'function' || win.isDestroyed()) return;
    const wc = win.webContents;
    if (!wc || typeof wc.isDestroyed !== 'function' || wc.isDestroyed()) return;
    if (typeof wc.isCrashed === 'function' && wc.isCrashed()) return;
    wc.send(channel, ...args);
  } catch {
    // Render frame was disposed before WebFrameMain could be accessed (e.g. reload, navigation, close)
  }
}

function safeBroadcast(channel, ...args) {
  if (!BrowserWindow || typeof BrowserWindow.getAllWindows !== 'function') return;
  for (const win of BrowserWindow.getAllWindows()) {
    safeSend(win, channel, ...args);
  }
}

function broadcastVaultChanged() {
  safeBroadcast('vault:changed');
}

function broadcastTransfersChanged() {
  safeBroadcast('transfers:changed');
}

function broadcastSharedVaultsChanged() {
  safeBroadcast('sharedVault:changed');
}

function broadcastTrashProgress(payload) {
  safeBroadcast('vault:trashProgress', payload);
}

function broadcastDeleteProgress(payload) {
  safeBroadcast('vault:deleteProgress', payload);
}

function broadcastMoveProgress(payload) {
  safeBroadcast('vault:moveProgress', payload);
}

module.exports = {
  serializeEntry,
  walkFilesEntries,
  safeSend,
  safeBroadcast,
  broadcastVaultChanged,
  broadcastTransfersChanged,
  broadcastSharedVaultsChanged,
  broadcastTrashProgress,
  broadcastDeleteProgress,
  broadcastMoveProgress,
};

