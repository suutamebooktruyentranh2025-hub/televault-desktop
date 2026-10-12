import { useCallback, useEffect, useMemo, useState } from 'react';
import { sanitizeFolderPath } from '../utils/pathUtils';

const api = window.televault?.sharedVault;
const vaultApi = window.televault?.vault;

const sharedListingCache = new Map();

export function useSharedVaults() {
  const [vaults, setVaults] = useState([]);
  const [activeVaultId, setActiveVaultId] = useState(() => Number(localStorage.getItem('televault_shared_vault_id')) || null);
  useEffect(() => {
    if (activeVaultId) localStorage.setItem('televault_shared_vault_id', activeVaultId);
    else localStorage.removeItem('televault_shared_vault_id');
  }, [activeVaultId]);

  const [currentFolder, setCurrentFolder] = useState(() => {
    const saved = localStorage.getItem('televault_shared_current_folder') || '/';
    return sanitizeFolderPath(saved);
  });
  useEffect(() => {
    localStorage.setItem('televault_shared_current_folder', currentFolder);
  }, [currentFolder]);

  const [browseScope, setBrowseScopeState] = useState('folders');
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [currentFolderCounts, setCurrentFolderCounts] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  const setBrowseScope = useCallback((newScope) => {
    setBrowseScopeState((prev) => {
      if (prev === newScope) return prev;
      if (newScope !== 'folders' && sortField === 'name') {
        setSortField('size');
        setSortDirection('desc');
      }
      return newScope;
    });
  }, [sortField]);

  const reloadListing = useCallback(async ({
    scope = browseScope,
    folder = currentFolder,
    field = sortField,
    direction = sortDirection,
  } = {}) => {
    if (!api || !activeVaultId) {
      setLoading(false);
      return;
    }

    if (scope === 'stories') {
      const cacheKey = `scope:stories:${activeVaultId}:${field}:${direction}`;
      const cached = sharedListingCache.get(cacheKey);
      if (cached) {
        setFolders(cached.folders);
        setFiles([]);
        setCurrentFolderCounts(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        const res = await vaultApi?.getFlatStories?.({ chatId: activeVaultId, sortField: field, sortDirection: direction });
        if (res?.ok) {
          sharedListingCache.set(cacheKey, {
            folders: res.folders || [],
            files: [],
            counts: null,
          });
          setFolders(res.folders || []);
          setFiles([]);
          setCurrentFolderCounts(null);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    if (scope === 'files') {
      const cacheKey = `scope:files:${activeVaultId}:${field}:${direction}`;
      const cached = sharedListingCache.get(cacheKey);
      if (cached) {
        setFolders([]);
        setFiles(cached.files);
        setCurrentFolderCounts(null);
        setLoading(false);
      } else {
        setLoading(true);
      }
      try {
        const res = await vaultApi?.getFlatFiles?.({ chatId: activeVaultId, sortField: field, sortDirection: direction });
        if (res?.ok) {
          sharedListingCache.set(cacheKey, {
            folders: [],
            files: res.files || [],
            counts: null,
          });
          setFolders([]);
          setFiles(res.files || []);
          setCurrentFolderCounts(null);
        }
      } finally {
        setLoading(false);
      }
      return;
    }

    const cacheKey = `${activeVaultId}:${folder}:${field}:${direction}`;
    const cached = sharedListingCache.get(cacheKey);
    if (cached) {
      setFolders(cached.folders);
      setFiles(cached.files);
      setCurrentFolderCounts(cached.counts);
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      const result = await api.getListing(activeVaultId, folder, field, direction);
      if (result?.ok) {
        sharedListingCache.set(cacheKey, {
          folders: result.folders,
          files: result.files,
          counts: result.counts || null,
        });
        setFolders(result.folders);
        setFiles(result.files);
        setCurrentFolderCounts(result.counts || null);
      }
    } finally {
      setLoading(false);
    }
  }, [activeVaultId, browseScope, currentFolder, sortField, sortDirection]);

  // Load vault list and listen for changes
  useEffect(() => {
    if (!api) return undefined;
    let cancelled = false;

    async function load() {
      const result = await api.list();
      if (!cancelled && result?.ok) {
        setVaults(result.vaults);
        setActiveVaultId((prev) => {
          if (prev && result.vaults.some((v) => v.chatId === prev)) return prev;
          return result.vaults[0]?.chatId || null;
        });
      }
    }
    void load();

    const unsub = api.onChanged(() => {
      sharedListingCache.clear();
      void load();
      void reloadListing();
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [reloadListing]);

  // Scan + load listing when activeVaultId, folder, or scope changes
  useEffect(() => {
    if (!api || !activeVaultId) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    async function loadListing() {
      if (browseScope === 'folders') {
        try {
          setScanning(true);
          await api.scan(activeVaultId);
        } catch {
          // ignore scan error
        } finally {
          if (!cancelled) setScanning(false);
        }
      }
      if (!cancelled) {
        await reloadListing();
      }
    }
    void loadListing();

    return () => {
      cancelled = true;
    };
  }, [activeVaultId, currentFolder, browseScope, sortField, sortDirection, reloadListing]);

  const goTo = useCallback((folder) => {
    if (browseScope !== 'folders') {
      setBrowseScope('folders');
    }
    const nextFolder = sanitizeFolderPath(folder);
    if (nextFolder === currentFolder && browseScope === 'folders') return;

    const cacheKey = `${activeVaultId}:${nextFolder}:${sortField}:${sortDirection}`;
    const cached = sharedListingCache.get(cacheKey);
    if (cached) {
      setFolders(cached.folders);
      setFiles(cached.files);
      setCurrentFolderCounts(cached.counts);
      setLoading(false);
    } else {
      setLoading(true);
      setFolders([]);
      setFiles([]);
      setCurrentFolderCounts(null);
    }
    setCurrentFolder(nextFolder);
  }, [activeVaultId, browseScope, currentFolder, sortField, sortDirection, setBrowseScope]);

  const openVault = useCallback((chatId) => {
    const isSameVault = chatId === activeVaultId;
    if (isSameVault) {
      if (currentFolder === '/' && browseScope === 'folders') {
        if (folders.length > 0 || files.length > 0) {
          // Keep existing data intact when navigating back to the same vault root
          return;
        }
        void reloadListing({ folder: '/', scope: 'folders' });
        return;
      }
      setCurrentFolder('/');
      setBrowseScopeState('folders');
      const cacheKey = `${chatId}:/:${sortField}:${sortDirection}`;
      const cached = sharedListingCache.get(cacheKey);
      if (cached) {
        setFolders(cached.folders);
        setFiles(cached.files);
        setCurrentFolderCounts(cached.counts);
        setLoading(false);
      } else {
        setLoading(true);
      }
      void reloadListing({ folder: '/', scope: 'folders' });
      return;
    }

    setActiveVaultId(chatId);
    setCurrentFolder('/');
    setBrowseScopeState('folders');
    const cacheKey = `${chatId}:/:${sortField}:${sortDirection}`;
    const cached = sharedListingCache.get(cacheKey);
    if (cached) {
      setFolders(cached.folders);
      setFiles(cached.files);
      setCurrentFolderCounts(cached.counts);
      setLoading(false);
    } else {
      setFolders([]);
      setFiles([]);
      setCurrentFolderCounts(null);
      setLoading(true);
    }
  }, [activeVaultId, currentFolder, browseScope, folders.length, files.length, sortField, sortDirection, reloadListing]);

  const toggleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const activeVault = vaults.find((v) => v.chatId === activeVaultId) || null;

  const breadcrumbs = useMemo(() => {
    const label = activeVault?.title || 'Shared Vault';
    if (browseScope === 'stories') {
      return [
        { label, path: '/' },
        { label: '', labelKey: 'scopeStoriesBreadcrumb', labelParams: { n: folders.length }, path: null },
      ];
    }
    if (browseScope === 'files') {
      return [
        { label, path: '/' },
        { label: '', labelKey: 'scopeFilesBreadcrumb', labelParams: { n: files.length }, path: null },
      ];
    }
    if (currentFolder === '/') return [{ label, path: '/' }];
    const parts = currentFolder.split('/').filter(Boolean);
    const crumbs = [{ label, path: '/' }];
    for (let i = 0; i < parts.length; i += 1) {
      crumbs.push({
        label: parts[i],
        path: `/${parts.slice(0, i + 1).join('/')}/`,
      });
    }
    return crumbs;
  }, [activeVault?.title, browseScope, currentFolder, folders.length, files.length]);

  return {
    vaults,
    activeVaultId,
    activeVault,
    currentFolder,
    browseScope,
    setBrowseScope,
    folders,
    files,
    currentFolderCounts,
    loading,
    scanning,
    sortField,
    sortDirection,
    breadcrumbs,
    openVault,
    goTo,
    toggleSort,
    refresh: reloadListing,
    reload: reloadListing,
    discover: async () => {
      setScanning(true);
      await api?.discover?.();
      setScanning(false);
    },
  };
}
