import { useCallback, useEffect, useState } from 'react';
import { sanitizeFolderPath } from '../utils/pathUtils';

const api = window.televault?.sharedVault;

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
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [currentFolderCounts, setCurrentFolderCounts] = useState(null);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');

  // Load vault list
  useEffect(() => {
    if (!api) return undefined;
    let cancelled = false;

    async function load() {
      const result = await api.list();
      if (!cancelled && result?.ok) setVaults(result.vaults);
    }
    void load();

    const unsub = api.onChanged(() => {
      sharedListingCache.clear();
      void load();
    });

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, []);

  // Scan + load listing when activeVaultId or folder changes
  useEffect(() => {
    if (!api || !activeVaultId) return;
    let cancelled = false;

    async function loadListing() {
      const cacheKey = `${activeVaultId}:${currentFolder}:${sortField}:${sortDirection}`;
      const cached = sharedListingCache.get(cacheKey);
      if (cached) {
        setFolders(cached.folders);
        setFiles(cached.files);
        setCurrentFolderCounts(cached.counts);
      } else {
        setLoading(true);
      }

      try {
        setScanning(true);
        await api.scan(activeVaultId);
        if (cancelled) return;
        setScanning(false);

        const result = await api.getListing(activeVaultId, currentFolder, sortField, sortDirection);
        if (!cancelled && result?.ok) {
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
        if (!cancelled) setLoading(false);
      }
    }
    void loadListing();
  }, [activeVaultId, currentFolder, sortField, sortDirection]);

  const goTo = useCallback((folder) => {
    const nextFolder = sanitizeFolderPath(folder);
    if (nextFolder === currentFolder) return;

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
  }, [activeVaultId, currentFolder, sortField, sortDirection]);

  const openVault = useCallback((chatId) => {
    setActiveVaultId(chatId);
    setCurrentFolder('/');
    setFolders([]);
    setFiles([]);
    setCurrentFolderCounts(null);
  }, []);

  const toggleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const activeVault = vaults.find((v) => v.chatId === activeVaultId) || null;

  const breadcrumbs = (() => {
    const label = activeVault?.title || 'Shared Vault';
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
  })();

  return {
    vaults,
    activeVaultId,
    activeVault,
    currentFolder,
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
    discover: async () => {
      setScanning(true);
      await api.discover();
      setScanning(false);
    },
  };
}
