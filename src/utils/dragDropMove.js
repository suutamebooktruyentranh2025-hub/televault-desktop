export const TELEVAULT_MOVE_MIME = 'application/x-televault-move';

/**
 * Validates if the target folder path is a valid drop destination for the given payload.
 *
 * @param {string} targetFolderPath - Destination folder path (must end with '/')
 * @param {{ messageIds?: number[], folders?: string[] }} payload - Drag payload
 * @returns {boolean}
 */
export function isValidDropTarget(targetFolderPath, payload) {
  if (!targetFolderPath || !payload) return false;
  const normalizedTarget = targetFolderPath.endsWith('/') ? targetFolderPath : `${targetFolderPath}/`;
  const folders = payload.folders || [];

  for (const f of folders) {
    const normalizedF = f.endsWith('/') ? f : `${f}/`;
    // Cannot drop a folder into itself
    if (normalizedF === normalizedTarget) return false;
    // Cannot drop a folder into its own descendant
    if (normalizedTarget.startsWith(normalizedF)) return false;
  }

  return true;
}

/**
 * Builds the move payload based on whether the dragged item is part of the active selection.
 *
 * @param {{
 *   itemType: 'file' | 'folder',
 *   file?: { messageId: number, name?: string },
 *   folderName?: string,
 *   currentFolder: string,
 *   selectedIds: Set<number>,
 *   selectedFolders: Set<string>,
 * }} params
 * @returns {{ messageIds: number[], folders: string[], totalCount: number, label: string }}
 */
export function buildDragPayload({
  itemType,
  file,
  folderName,
  currentFolder,
  selectedIds,
  selectedFolders,
}) {
  const normCurrent = currentFolder.endsWith('/') ? currentFolder : `${currentFolder}/`;
  let isSelected = false;

  if (itemType === 'file' && file) {
    isSelected = selectedIds.has(file.messageId);
  } else if (itemType === 'folder' && folderName) {
    isSelected = selectedFolders.has(`${normCurrent}${folderName}/`);
  }

  if (isSelected) {
    const messageIds = Array.from(selectedIds);
    const folders = Array.from(selectedFolders);
    const totalCount = messageIds.length + folders.length;
    return {
      messageIds,
      folders,
      totalCount,
      label: totalCount > 1 ? `${totalCount} items` : (file?.name || folderName || '1 item'),
    };
  }

  if (itemType === 'file' && file) {
    return {
      messageIds: [file.messageId],
      folders: [],
      totalCount: 1,
      label: file.name || '1 file',
    };
  }

  const folderPath = `${normCurrent}${folderName}/`;
  return {
    messageIds: [],
    folders: [folderPath],
    totalCount: 1,
    label: folderName || '1 folder',
  };
}

/**
 * Safely parses the move payload from a drag/drop event.
 *
 * @param {DragEvent} e
 * @returns {{ messageIds: number[], folders: string[] } | null}
 */
export function parseMovePayload(e) {
  try {
    const raw = e?.dataTransfer?.getData(TELEVAULT_MOVE_MIME);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.messageIds) || Array.isArray(parsed?.folders)) {
      return {
        messageIds: parsed.messageIds || [],
        folders: parsed.folders || [],
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Checks if the drag event contains TeleVault move data.
 *
 * @param {DragEvent} e
 * @returns {boolean}
 */
export function isMoveDragEvent(e) {
  if (!e?.dataTransfer?.types) return false;
  return Array.from(e.dataTransfer.types).includes(TELEVAULT_MOVE_MIME);
}
