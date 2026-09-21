const { createVaultEntry, dirMarker } = require('./vaultEntry');

const CAPTION_VERSION = 1;
const CAPTION_VERSION_V2 = 2;

/**
 * @param {unknown} raw
 * @returns {Array<{ messageId: number, offset: number, size: number }>|null}
 */
function normalizeParts(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  /** @type {Array<{ messageId: number, offset: number, size: number }>} */
  const parts = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const messageId = typeof item.messageId === 'number' ? item.messageId : Number(item.messageId);
    const offset = typeof item.offset === 'number' ? item.offset : Number(item.offset);
    const size = typeof item.size === 'number' ? item.size : Number(item.size);
    if (!Number.isFinite(messageId) || !Number.isFinite(offset) || !Number.isFinite(size)) return null;
    if (offset < 0 || size <= 0) return null;
    parts.push({ messageId, offset, size });
  }
  return parts;
}

/** @param {import('./vaultEntry').VaultEntry} entry */
function encodeCaption(entry) {
  if (entry.path.endsWith('/')) {
    const payload = { v: CAPTION_VERSION, dir: entry.path };
    if (entry.tags.length > 0) payload.tags = entry.tags;
    return JSON.stringify(payload);
  }

  const parts = normalizeParts(entry.parts);
  if (parts) {
    return JSON.stringify({
      v: CAPTION_VERSION_V2,
      path: entry.path,
      size: entry.size,
      sha256: entry.sha256,
      mtime: entry.mtime.toISOString(),
      parts,
    });
  }

  return JSON.stringify({
    v: CAPTION_VERSION,
    path: entry.path,
    size: entry.size,
    sha256: entry.sha256,
    mtime: entry.mtime.toISOString(),
  });
}

/**
 * Encode a shard caption for a non-manifest multi-part piece.
 * @param {number} manifestMessageId
 * @param {number} partIndex
 */
function encodePartCaption(manifestMessageId, partIndex) {
  return JSON.stringify({
    v: CAPTION_VERSION_V2,
    partOf: manifestMessageId,
    index: partIndex,
  });
}

/**
 * @param {number} messageId
 * @param {string} caption
 * @returns {import('./vaultEntry').VaultEntry|null}
 */
function decodeCaption(messageId, caption) {
  let m;
  try {
    const d = JSON.parse(caption);
    if (!d || typeof d !== 'object') return null;
    m = d;
  } catch {
    return null;
  }

  // Shard messages are not vault entries — skip indexing.
  if (m.partOf != null) return null;

  if (typeof m.dir === 'string' && m.dir.startsWith('/') && m.dir.endsWith('/')) {
    if (m.v !== CAPTION_VERSION && m.v !== CAPTION_VERSION_V2) return null;
    const tagsRaw = m.tags;
    const tags = Array.isArray(tagsRaw) ? tagsRaw.filter((t) => typeof t === 'string') : [];
    return dirMarker({ messageId, path: m.dir, tags });
  }

  if (m.v === CAPTION_VERSION) {
    return decodeFileCaptionV1(messageId, m);
  }
  if (m.v === CAPTION_VERSION_V2) {
    return decodeFileCaptionV2(messageId, m);
  }
  return null;
}

function decodeFileCaptionV1(messageId, m) {
  const path = m.path;
  if (typeof path !== 'string' || !path.startsWith('/') || path.endsWith('/')) return null;
  const mtimeRaw = m.mtime;
  const mtime = typeof mtimeRaw === 'string' ? new Date(mtimeRaw) : null;
  if (!mtime || Number.isNaN(mtime.getTime())) return null;

  const size = typeof m.size === 'number' ? m.size : 0;
  const sha256 = typeof m.sha256 === 'string' ? m.sha256 : '';

  return createVaultEntry({ messageId, path, size, sha256, mtime, tags: [] });
}

function decodeFileCaptionV2(messageId, m) {
  const path = m.path;
  if (typeof path !== 'string' || !path.startsWith('/') || path.endsWith('/')) return null;
  const mtimeRaw = m.mtime;
  const mtime = typeof mtimeRaw === 'string' ? new Date(mtimeRaw) : null;
  if (!mtime || Number.isNaN(mtime.getTime())) return null;

  const size = typeof m.size === 'number' ? m.size : 0;
  const sha256 = typeof m.sha256 === 'string' ? m.sha256 : '';
  const parts = normalizeParts(m.parts);

  return createVaultEntry({
    messageId,
    path,
    size,
    sha256,
    mtime,
    tags: [],
    parts,
  });
}

module.exports = {
  CAPTION_VERSION,
  CAPTION_VERSION_V2,
  encodeCaption,
  encodePartCaption,
  decodeCaption,
  normalizeParts,
};
