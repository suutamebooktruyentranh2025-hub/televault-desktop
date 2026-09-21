import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeFolderPath } from '../utils/pathUtils';

const vaultApi = window.televault?.vault;

// In-memory SWR cache across folder navigations
const folderListingCache = new Map();

export function useVault({ enabled = true, rootLabel = 'My Vault' } = {}) {
  const [currentFolder, setCurrentFolder] = useState(() => {
    const saved = localStorage.getItem('televault_current_folder') || '/';
    return sanitizeFolderPath(saved);
  });
  useEffect(() => {
    localStorage.setItem('televault_current_folder', currentFolder);
  }, [currentFolder]);

  const [expandedFolders, setExpandedFolders] = useState(['/']);
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [viewMode, setViewMode] = useState('list');
  const [allFolders, setAllFolders] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [currentFolderCounts, setCurrentFolderCounts] = useState(null);
  const [treeRows, setTreeRows] = useState([]);
  const [stats, setStats] = useState({ count: 0, trashFolder: '/Rác/' });
  const [loading, setLoading] = useState(true);
  const activeFetchIdRef = useRef(0);

  const breadcrumbs = useMemo(() => {
    if (currentFolder === '/') return [{ label: rootLabel, path: '/' }];
    const parts = currentFolder.split('/').filter(Boolean);
    const crumbs = [{ label: rootLabel, path: '/' }];
    for (let i = 0; i < parts.length; i += 1) {
      crumbs.push({
        label: parts[i],
        path: `/${parts.slice(0, i + 1).join('/')}/`,
      });
    }
    return crumbs;
  }, [currentFolder, rootLabel]);

  // Load listing for the current folder (with SWR caching)
  const reloadListing = useCallback(async ({ folder = currentFolder, field = sortField, direction = sortDirection, showLoading = false } = {}) => {
    if (!enabled || !vaultApi?.getListing) {
      setLoading(false);
      return;
    }
    const targetFolder = sanitizeFolderPath(folder);
    const cacheKey = `${targetFolder}:${field}:${direction}`;
    const cached = folderListingCache.get(cacheKey);

    if (cached) {
      // Instant render from cache
      setFolders(cached.folders);
      setFiles(cached.files);
      setCurrentFolderCounts(cached.counts);
      setLoading(false);
    } else if (showLoading) {
      setLoading(true);
    }

    const fetchId = ++activeFetchIdRef.current;

    try {
      const listing = await vaultApi.getListing(targetFolder, field, direction);
      if (fetchId !== activeFetchIdRef.current) return;

      if (listing?.ok) {
        folderListingCache.set(cacheKey, {
          folders: listing.folders,
          files: listing.files,
          counts: listing.counts || null,
          timestamp: Date.now(),
        });
        setFolders(listing.folders);
        setFiles(listing.files);
        setCurrentFolderCounts(listing.counts || null);
      }
    } finally {
      if (fetchId === activeFetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [enabled, currentFolder, sortField, sortDirection]);

  // Reload tree only when expandedFolders changes
  const reloadTree = useCallback(async () => {
    if (!enabled || !vaultApi?.getTree) return;
    try {
      const tree = await vaultApi.getTree([...expandedFolders]);
      if (tree?.ok) setTreeRows(tree.rows);
    } catch {
      // Ignore tree fetch error
    }
  }, [enabled, expandedFolders]);

  // Reload global stats & allFolders list (rarely changes)
  const reloadMetadata = useCallback(async () => {
    if (!enabled || !vaultApi) return;
    try {
      const foldersPromise = typeof vaultApi.allFolders === 'function'
        ? vaultApi.allFolders().catch(() => ({ ok: false, folders: [] }))
        : Promise.resolve({ ok: false, folders: [] });

      const [stat, folderResult] = await Promise.all([
        vaultApi.getStats(),
        foldersPromise,
      ]);
      if (stat?.ok) setStats({ count: stat.count, trashFolder: stat.trashFolder });
      if (folderResult?.ok) setAllFolders(folderResult.folders);
    } catch {
      // Ignore metadata fetch error
    }
  }, [enabled]);

  // Initial load: fetch metadata + tree once
  useEffect(() => {
    void reloadMetadata();
    void reloadTree();
  }, [reloadMetadata, reloadTree]);

  // Fetch listing when folder or sort changes
  useEffect(() => {
    const cacheKey = `${currentFolder}:${sortField}:${sortDirection}`;
    const hasCache = folderListingCache.has(cacheKey);
    void reloadListing({ folder: currentFolder, field: sortField, direction: sortDirection, showLoading: !hasCache });
  }, [currentFolder, sortField, sortDirection, reloadListing]);

  // When backend database changes, clear cache and reload all (debounced to avoid event storming)
  useEffect(() => {
    if (!enabled || !vaultApi?.onChanged) return undefined;
    let debounceTimer = null;
    const unsub = vaultApi.onChanged(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        folderListingCache.clear();
        void reloadListing({ folder: currentFolder, field: sortField, direction: sortDirection, showLoading: false });
        void reloadTree();
        void reloadMetadata();
      }, 300);
    });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [enabled, currentFolder, sortField, sortDirection, reloadListing, reloadTree, reloadMetadata]);

  const goTo = useCallback((folder) => {
    const nextFolder = sanitizeFolderPath(folder);
    if (nextFolder === currentFolder) return;

    const cacheKey = `${nextFolder}:${sortField}:${sortDirection}`;
    const cached = folderListingCache.get(cacheKey);

    if (cached) {
      // 0ms instant display from cache
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
  }, [currentFolder, sortField, sortDirection]);

  const toggleFolderExpanded = useCallback((folderPath) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderPath)) next.delete(folderPath);
      else next.add(folderPath);
      return [...next];
    });
  }, []);

  const toggleSort = useCallback((field) => {
    if (sortField === field) {
      setSortDirection((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  }, [sortField]);

  const toggleViewMode = useCallback(() => {
    setViewMode((m) => (m === 'list' ? 'grid' : 'list'));
  }, []);

  const reloadAll = useCallback(async () => {
    folderListingCache.clear();
    await Promise.all([
      reloadListing({ folder: currentFolder, field: sortField, direction: sortDirection, showLoading: true }),
      reloadTree(),
      reloadMetadata(),
    ]);
  }, [currentFolder, sortField, sortDirection, reloadListing, reloadTree, reloadMetadata]);

  return {
    currentFolder,
    folders,
    files,
    currentFolderCounts,
    allFolders,
    treeRows,
    breadcrumbs,
    stats,
    loading,
    sortField,
    sortDirection,
    viewMode,
    expandedFolders,
    goTo,
    toggleFolderExpanded,
    toggleSort,
    toggleViewMode,
    refresh: reloadAll,
  };
}
