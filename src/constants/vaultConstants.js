/**
 * Internal protocol storage path for trash folder on Telegram & SQLite.
 * This is a backend constant and MUST NOT change across UI languages.
 * User-facing display labels always use t('navTrash').
 */
export const DEFAULT_TRASH_FOLDER = '/Rác/';

/**
 * Checks if a given folder path is the trash folder or inside it.
 * @param {string|null|undefined} folderPath
 * @param {string} [trashRoot]
 * @returns {boolean}
 */
export function isTrashPath(folderPath, trashRoot = DEFAULT_TRASH_FOLDER) {
  if (!folderPath || typeof folderPath !== 'string') return false;
  const root = trashRoot || DEFAULT_TRASH_FOLDER;
  return folderPath === root || folderPath.startsWith(root);
}
