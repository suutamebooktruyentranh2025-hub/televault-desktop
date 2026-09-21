/**
 * Formats summary count text and tooltip for the current folder view.
 * Handles cases where files are nested inside subfolders rather than directly in the folder root.
 *
 * @param {Object} options
 * @param {Array<{ folderCount?: number, totalFolders?: number, fileCount?: number, totalFiles?: number }>} [options.folders]
 * @param {Array<any>} [options.files]
 * @param {{ folderCount?: number, totalFolders?: number, fileCount?: number, totalFiles?: number } | null} [options.counts]
 * @param {(key: string, params?: Record<string, any>) => string} options.t
 * @returns {{ text: string, tooltip: string }}
 */
export function formatFolderSummary({ folders = [], files = [], counts = null, t }) {
  const directFiles = files.length;
  const totalNestedFiles = folders.reduce((sum, f) => sum + (f.totalFiles ?? f.fileCount ?? 0), 0);
  const totalFiles = counts?.totalFiles ?? (directFiles + totalNestedFiles);

  const directFolders = folders.length;
  const totalNestedFolders = folders.reduce((sum, f) => sum + (f.totalFolders ?? f.folderCount ?? 0), 0);
  const totalFolders = counts?.totalFolders ?? (directFolders + totalNestedFolders);

  if (directFolders === 0 && totalFiles === 0) {
    const emptyText = t ? t('folderItemCountEmpty') : 'Trống';
    return {
      text: emptyText,
      tooltip: emptyText,
    };
  }

  const tooltip = t
    ? t('folderItemCountDetail', {
        folderCount: directFolders.toLocaleString(),
        totalFolders: totalFolders.toLocaleString(),
        fileCount: directFiles.toLocaleString(),
        totalFiles: totalFiles.toLocaleString(),
      })
    : `${directFolders} thư mục con (${totalFolders} tất cả), ${directFiles} tệp (${totalFiles} tất cả)`;

  // If there are no subfolders, only show the file count
  if (directFolders === 0) {
    return {
      text: t ? t('fileCountLabel', { n: totalFiles.toLocaleString() }) : `${totalFiles} tệp`,
      tooltip,
    };
  }

  // If there are subfolders and NO loose direct files, show subfolders and total files inside them
  if (directFiles === 0) {
    return {
      text: t
        ? t('folderSummaryCounts', {
            folders: directFolders.toLocaleString(),
            files: totalFiles.toLocaleString(),
          })
        : `${directFolders} thư mục con • ${totalFiles} tệp`,
      tooltip,
    };
  }

  // If there are both direct files and additional nested files in subfolders
  if (totalFiles > directFiles) {
    return {
      text: t
        ? t('folderSummaryCountsWithTotal', {
            folders: directFolders.toLocaleString(),
            files: directFiles.toLocaleString(),
            totalFiles: totalFiles.toLocaleString(),
          })
        : `${directFolders} thư mục con • ${directFiles} tệp (${totalFiles} tất cả)`,
      tooltip,
    };
  }

  // Subfolders exist and all files are direct files
  return {
    text: t
      ? t('folderSummaryCounts', {
          folders: directFolders.toLocaleString(),
          files: directFiles.toLocaleString(),
        })
      : `${directFolders} thư mục con • ${directFiles} tệp`,
    tooltip,
  };
}

/**
 * Formats item count string for a single folder item in list/grid view.
 * @param {{ folderCount?: number, fileCount?: number, totalFiles?: number }} folder
 * @param {(key: string, params?: Record<string, any>) => string} [t]
 * @returns {string|null}
 */
export function formatFolderItemCount(folder, t) {
  if (!folder) return null;
  const folderCount = folder.folderCount ?? 0;
  const fileCount = folder.fileCount ?? 0;
  const totalFiles = folder.totalFiles ?? fileCount;

  if (folderCount === 0 && fileCount === 0 && totalFiles === 0) {
    return t ? t('folderItemCountEmpty') : 'Trống';
  }

  const parts = [];
  if (folderCount > 0) {
    parts.push(t ? t('folderCountLabel', { n: folderCount }) : `${folderCount} thư mục con`);
  }
  if (fileCount > 0) {
    parts.push(t ? t('fileCountLabel', { n: fileCount }) : `${fileCount} tệp`);
  } else if (totalFiles > 0) {
    parts.push(`(${t ? t('fileCountLabel', { n: totalFiles }) : `${totalFiles} tệp`})`);
  }

  return parts.join(', ');
}

/**
 * Formats tooltip string for a single folder item.
 * @param {{ name?: string, folderCount?: number, totalFolders?: number, fileCount?: number, totalFiles?: number }} folder
 * @param {(key: string, params?: Record<string, any>) => string} [t]
 * @returns {string}
 */
export function formatFolderTooltip(folder, t) {
  if (!folder) return '';
  const folderCount = folder.folderCount ?? 0;
  const totalFolders = folder.totalFolders ?? folderCount;
  const fileCount = folder.fileCount ?? 0;
  const totalFiles = folder.totalFiles ?? fileCount;

  if (!t) return folder.name || '';
  return `${folder.name || ''}\n${t('folderItemCountDetail', {
    folderCount,
    totalFolders,
    fileCount,
    totalFiles,
  })}`;
}

