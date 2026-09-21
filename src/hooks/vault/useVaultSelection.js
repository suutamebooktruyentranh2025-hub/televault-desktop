import { useState, useCallback } from 'react';

export function parseSelectionKey(key) {
  if (!key) return null;
  if (key.startsWith('file:')) return { type: 'file', id: Number(key.slice(5)) };
  if (key.startsWith('folder:')) return { type: 'folder', path: key.slice(7) };
  return null;
}

export function useVaultSelection() {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedFolders, setSelectedFolders] = useState(new Set());
  const [lastSelectedKey, setLastSelectedKey] = useState(null);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectedFolders(new Set());
    setLastSelectedKey(null);
  }, []);

  const applyItemSelection = useCallback((key, { additive, range }, orderedKeys) => {
    const item = parseSelectionKey(key);
    if (!item) return;

    if (range && lastSelectedKey && orderedKeys.length > 0) {
      const from = orderedKeys.indexOf(lastSelectedKey);
      const to = orderedKeys.indexOf(key);
      if (from >= 0 && to >= 0) {
        const lo = Math.min(from, to);
        const hi = Math.max(from, to);
        const newIds = new Set();
        const newFolders = new Set();
        for (const entryKey of orderedKeys.slice(lo, hi + 1)) {
          const parsed = parseSelectionKey(entryKey);
          if (parsed?.type === 'file') newIds.add(parsed.id);
          if (parsed?.type === 'folder') newFolders.add(parsed.path);
        }
        setSelectedIds(newIds);
        setSelectedFolders(newFolders);
        setLastSelectedKey(key);
        return;
      }
    }

    if (additive) {
      if (item.type === 'file') {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(item.id)) next.delete(item.id);
          else next.add(item.id);
          return next;
        });
      } else {
        setSelectedFolders((prev) => {
          const next = new Set(prev);
          if (next.has(item.path)) next.delete(item.path);
          else next.add(item.path);
          return next;
        });
      }
    } else if (item.type === 'file') {
      setSelectedIds(new Set([item.id]));
      setSelectedFolders(new Set());
    } else {
      setSelectedFolders(new Set([item.path]));
      setSelectedIds(new Set());
    }

    setLastSelectedKey(key);
  }, [lastSelectedKey]);

  const toggleSelect = useCallback((keyOrId) => {
    const key = String(keyOrId).includes(':') ? keyOrId : `file:${keyOrId}`;
    applyItemSelection(key, { additive: true, range: false }, [key]);
  }, [applyItemSelection]);

  const selectAllInView = useCallback((vault) => {
    const orderedKeys = [
      ...vault.folders.map((folder) => `folder:${vault.currentFolder}${folder.name}/`),
      ...vault.files.map((file) => `file:${file.messageId}`),
    ];
    const newIds = new Set(vault.files.map((file) => file.messageId));
    const newFolders = new Set(vault.folders.map((folder) => `${vault.currentFolder}${folder.name}/`));
    setSelectedIds(newIds);
    setSelectedFolders(newFolders);
    setLastSelectedKey(orderedKeys.at(-1) ?? null);
  }, []);

    const selectionCount = selectedIds.size + selectedFolders.size;
    const canDownloadSelection = selectedIds.size > 0 || selectedFolders.size > 0;

    return {
      selectedIds,
      setSelectedIds,
      selectedFolders,
      setSelectedFolders,
      lastSelectedKey,
      setLastSelectedKey,
      clearSelection,
      applyItemSelection,
      toggleSelect,
      selectAllInView,
      selectionCount,
      canDownloadSelection,
    };
  }
