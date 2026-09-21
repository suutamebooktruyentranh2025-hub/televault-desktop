const fs = require('fs');
const path = require('path');
const { BrowserWindow } = require('electron');
const {
  entryName,
  isDir,
  effectiveTagsForPath,
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

function broadcastVaultChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('vault:changed');
  }
}

function broadcastTransfersChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('transfers:changed');
  }
}

function broadcastSharedVaultsChanged() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('sharedVault:changed');
  }
}

function broadcastDeleteProgress(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('vault:deleteProgress', payload);
    }
  }
}

function broadcastMoveProgress(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('vault:moveProgress', payload);
    }
  }
}

module.exports = {
  serializeEntry,
  walkFilesEntries,
  broadcastVaultChanged,
  broadcastTransfersChanged,
  broadcastSharedVaultsChanged,
  broadcastDeleteProgress,
  broadcastMoveProgress,
};
