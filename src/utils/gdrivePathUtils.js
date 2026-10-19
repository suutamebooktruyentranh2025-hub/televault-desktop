/**
 * Extracts the relative subfolder path of a file with respect to the currently selected folder.
 * Returns null if the file is directly located in the current folder, or if drivePath is not available.
 *
 * @param {string} drivePath - Full drive path of the file (e.g., "/Danh sách 2025/Danh sách truyện 2025/truyen.pdf")
 * @param {Array<{ id: string, name: string }>} currentFolderPath - Breadcrumb path of current folder
 * @param {string} fileName - File name to strip from the end (e.g., "truyen.pdf")
 * @returns {string|null} Relative subfolder path (e.g. "Danh sách truyện 2025") or null
 */
export function getRelativeSubfolder(drivePath, currentFolderPath, fileName) {
  if (!drivePath) return null;
  let dir = String(drivePath);
  if (fileName && dir.endsWith(fileName)) {
    dir = dir.slice(0, -fileName.length);
  }
  dir = dir.replace(/^\/+|\/+$/g, '');
  if (!dir) return null;

  if (Array.isArray(currentFolderPath) && currentFolderPath.length > 1) {
    // Current folder path segments excluding 'root' (e.g. ['Danh sách 2025'])
    const segments = currentFolderPath.slice(1).map((c) => c?.name).filter(Boolean);
    const parentPathPrefix = segments.join('/');
    if (parentPathPrefix && dir.startsWith(parentPathPrefix)) {
      dir = dir.slice(parentPathPrefix.length).replace(/^\/+/, '');
    }
  }
  return dir || null;
}
