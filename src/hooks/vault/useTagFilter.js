import { useCallback, useEffect, useMemo, useState } from 'react';

const api = window.televault?.vault;

const STORAGE_KEY_TAGS = 'televault:active_tags';

export function useTagFilter({ chatId = null } = {}) {
  const storageKey = chatId ? `televault:active_tags:${chatId}` : STORAGE_KEY_TAGS;
  const [tagNames, setTagNames] = useState([]);
  /** @type {[Record<string, string[]>, Function]} */
  const [foldersByTag, setFoldersByTag] = useState({});
  const [activeTags, setActiveTags] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);

  // Re-read activeTags if storageKey changes
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setActiveTags(Array.isArray(parsed) ? parsed : []);
    } catch {
      setActiveTags([]);
    }
  }, [storageKey]);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(activeTags));
    } catch {}
  }, [activeTags, storageKey]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api?.allTags({ chatId });
      if (result?.ok) {
        const folders = result.foldersByTag || {};
        const names = [
          ...new Set([...(result.names || []), ...Object.keys(folders)]),
        ];
        setTagNames(names);
        setFoldersByTag(folders);
        // Retain only active tags that still exist without recreating array if unchanged
        setActiveTags((prev) => {
          if (!prev || prev.length === 0) return prev;
          const next = prev.filter((tag) => names.includes(tag));
          if (next.length === prev.length && next.every((t, i) => t === prev[i])) {
            return prev;
          }
          return next;
        });
      }
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    void refresh();
    const unsubVault = api?.onChanged?.(() => void refresh());
    const unsubShared = window.televault?.sharedVault?.onChanged?.(() => void refresh());
    return () => {
      unsubVault?.();
      unsubShared?.();
    };
  }, [refresh]);

  const toggleTag = useCallback((tag) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const clearTags = useCallback(() => {
    setActiveTags((prev) => (prev.length === 0 ? prev : []));
    try {
      localStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey]);

  const EMPTY_FOLDERS = useMemo(() => [], []);

  // Filter folders: Default to OR (union of all folders matching any selected tag)
  const filteredFolders = useMemo(() => {
    if (activeTags.length === 0) return EMPTY_FOLDERS;
    if (activeTags.length === 1) {
      return foldersByTag[activeTags[0]] || EMPTY_FOLDERS;
    }
    const set = new Set();
    for (const tag of activeTags) {
      for (const p of foldersByTag[tag] || []) {
        set.add(p);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeTags, foldersByTag, EMPTY_FOLDERS]);

  const EMPTY_DETAILS = useMemo(() => ({}), []);
  const [folderDetails, setFolderDetails] = useState(EMPTY_DETAILS);

  useEffect(() => {
    if (!filteredFolders.length || !api?.getFoldersDetails) {
      setFolderDetails((prev) => (Object.keys(prev).length === 0 ? prev : EMPTY_DETAILS));
      return undefined;
    }
    let cancelled = false;
    api.getFoldersDetails(filteredFolders, { chatId }).then((res) => {
      if (!cancelled && res?.ok && Array.isArray(res.folders)) {
        const map = {};
        for (const f of res.folders) {
          map[f.path] = f;
        }
        setFolderDetails(map);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [filteredFolders, EMPTY_DETAILS, chatId]);

  const filteredFolderItems = useMemo(() => {
    return filteredFolders.map((p) => {
      if (folderDetails[p]) return folderDetails[p];
      const name = p.split('/').filter(Boolean).at(-1) || p;
      return {
        path: p,
        name,
        mtime: null,
        size: 0,
        fileCount: 0,
        folderCount: 0,
        totalFiles: 0,
        totalFolders: 0,
      };
    });
  }, [filteredFolders, folderDetails]);

  const renameTag = useCallback(
    async (oldName, newName) => {
      if (!oldName || !newName || oldName === newName) return false;
      const result = await api?.renameTag(oldName, newName);
      if (result?.ok) {
        setActiveTags((prev) =>
          prev.map((t) => (t === oldName ? newName : t)),
        );
        await refresh();
        return true;
      }
      return false;
    },
    [refresh],
  );

  const deleteTag = useCallback(
    async (tag) => {
      if (!tag) return false;
      const result = await api?.deleteTag(tag);
      if (result?.ok) {
        setActiveTags((prev) => prev.filter((t) => t !== tag));
        await refresh();
        return true;
      }
      return false;
    },
    [refresh],
  );

  return {
    tagNames,
    foldersByTag,
    activeTags,
    activeTag: activeTags[0] || null, // Backwards-compatibility
    matchMode: 'or',
    toggleTag,
    clearTags,
    clearTag: clearTags, // Backwards-compatibility alias
    filteredFolders,
    filteredFolderItems,
    folderDetails,
    renameTag,
    deleteTag,
    refresh,
    tagFilterLoading: loading,
  };
}
