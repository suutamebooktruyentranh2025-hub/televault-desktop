import { useCallback, useEffect, useMemo, useState } from 'react';

const api = window.televault?.vault;

const STORAGE_KEY_TAGS = 'televault:active_tags';

export function useTagFilter() {
  const [tagNames, setTagNames] = useState([]);
  /** @type {[Record<string, string[]>, Function]} */
  const [foldersByTag, setFoldersByTag] = useState({});
  const [activeTags, setActiveTags] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_TAGS);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_TAGS, JSON.stringify(activeTags));
    } catch {}
  }, [activeTags]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api?.allTags();
      if (result?.ok) {
        const folders = result.foldersByTag || {};
        const names = [
          ...new Set([...(result.names || []), ...Object.keys(folders)]),
        ];
        setTagNames(names);
        setFoldersByTag(folders);
        // Retain only active tags that still exist
        setActiveTags((prev) => prev.filter((tag) => names.includes(tag)));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return api?.onChanged?.(() => void refresh());
  }, [refresh]);

  const toggleTag = useCallback((tag) => {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const clearTags = useCallback(() => {
    setActiveTags([]);
    try {
      localStorage.removeItem(STORAGE_KEY_TAGS);
    } catch {}
  }, []);

  // Filter folders: Default to OR (union of all folders matching any selected tag)
  const filteredFolders = useMemo(() => {
    if (activeTags.length === 0) return [];
    if (activeTags.length === 1) {
      return foldersByTag[activeTags[0]] || [];
    }
    const set = new Set();
    for (const tag of activeTags) {
      for (const p of foldersByTag[tag] || []) {
        set.add(p);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [activeTags, foldersByTag]);

  const [folderDetails, setFolderDetails] = useState({});

  useEffect(() => {
    if (!filteredFolders.length || !api?.getFoldersDetails) {
      setFolderDetails({});
      return undefined;
    }
    let cancelled = false;
    api.getFoldersDetails(filteredFolders).then((res) => {
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
  }, [filteredFolders]);

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
