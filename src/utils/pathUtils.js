/**
 * Sanitizes and normalizes folder paths in televault:
 * - Replaces backslashes with forward slashes
 * - Collapses consecutive slashes
 * - Ensures leading and trailing slashes
 * - Deduplicates consecutive identical segments (e.g. /a/b/b/ -> /a/b/)
 *
 * @param {string} path
 * @returns {string}
 */
export function sanitizeFolderPath(path) {
  if (!path || typeof path !== 'string') return '/';
  const normalized = path.trim().replace(/\\/g, '/').replace(/\/+/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  if (segments.length === 0) return '/';

  const deduplicated = [];
  for (let i = 0; i < segments.length; i++) {
    if (i === 0 || segments[i] !== segments[i - 1]) {
      deduplicated.push(segments[i]);
    }
  }

  return `/${deduplicated.join('/')}/`;
}
