import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeFolderPath } from '../utils/pathUtils';
import { DEFAULT_TRASH_FOLDER, isTrashPath } from '../constants/vaultConstants';

const vaultApi = window.televault?.vault;

// In-memory SWR cache across folder navigations
const folderListingCache = new Map();

export function useVault({ enabled = true, rootLabel = 'My Vault' } = {}) {
  const [currentFolder, setCurrentFolder] = useState(() => {
    const saved = localStorage.getItem('televault_current_folder') || '/';
    const sanitized = sanitizeFolderPath(saved);
    if (!sanitized || isTrashPath(sanitized)) {
      return '/';
    }
    return sanitized;
  });
  useEffect(() => {
    if (currentFolder && !isTrashPath(currentFolder)) {
      localStorage.setItem('televault_current_folder', currentFolder);
    }
  }, [currentFolder]);

  const [expandedFolders, setExpandedFolders] = useState(['/']);
  const [browseScope, setBrowseScopeState] = useState('folders');
  const [sortField, setSortField] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [viewMode, setViewMode] = useState('list');
  const [allFolders, setAllFolders] = useState([]);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [currentFolderCounts, setCurrentFolderCounts] = useState(null);
  const [treeRows, setTreeRows] = useState([]);
  const [stats, setStats] = useState({ count: 0, trashFolder: DEFAULT_TRASH_FOLDER });
  const [loading, setLoading] = useState(true);
  const activeFetchIdRef = useRef(0);

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

  const breadcrumbs = useMemo(() => {
    if (browseScope === 'stories') {
      return [
        { label: rootLabel, path: '/' },
        { label: '', labelKey: 'scopeStoriesBreadcrumb', labelParams: { n: folders.length }, path: null },
      ];
    }
    if (browseScope === 'files') {
      return [
        { label: rootLabel, path: '/' },
        { label: '', labelKey: 'scopeFilesBreadcrumb', labelParams: { n: files.length }, path: null },
      ];
    }
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
  }, [browseScope, folders.length, files.length, currentFolder, rootLabel]);

  // Load listing for current folder or scope (with SWR caching)
  const reloadListing = useCallback(async ({
    scope = browseScope,
    folder = currentFolder,
    field = sortField,
    direction = sortDirection,
    showLoading = false,
  } = {}) => {
    if (!enabled || !vaultApi) {
      setLoading(false);
      return;
    }

    if (scope === 'stories') {
      if (!vaultApi.getFlatStories) {
        setLoading(false);
        return;
      }
      const cacheKey = `scope:stories:${field}:${direction}`;
      const cached = folderListingCache.get(cacheKey);
      if (cached) {
        setFolders(cached.folders);
        setFiles([]);
        setCurrentFolderCounts(null);
        setLoading(false);
      } else if (showLoading) {
        setLoading(true);
      }
      const fetchId = ++activeFetchIdRef.current;
      try {
        const res = await vaultApi.getFlatStories({ sortField: field, sortDirection: direction });
        if (fetchId !== activeFetchIdRef.current) return;
        if (res?.ok) {
          folderListingCache.set(cacheKey, {
            folders: res.folders || [],
            files: [],
            counts: null,
            timestamp: Date.now(),
          });
          setFolders(res.folders || []);
          setFiles([]);
          setCurrentFolderCounts(null);
        }
      } finally {
        if (fetchId === activeFetchIdRef.current) setLoading(false);
      }
      return;
    }

    if (scope === 'files') {
      if (!vaultApi.getFlatFiles) {
        setLoading(false);
        return;
      }
      const cacheKey = `scope:files:${field}:${direction}`;
      const cached = folderListingCache.get(cacheKey);
      if (cached) {
        setFolders([]);
        setFiles(cached.files);
        setCurrentFolderCounts(null);
        setLoading(false);
      } else if (showLoading) {
        setLoading(true);
      }
      const fetchId = ++activeFetchIdRef.current;
      try {
        const res = await vaultApi.getFlatFiles({ sortField: field, sortDirection: direction });
        if (fetchId !== activeFetchIdRef.current) return;
        if (res?.ok) {
          folderListingCache.set(cacheKey, {
            folders: [],
            files: res.files || [],
            counts: null,
            timestamp: Date.now(),
          });
          setFolders([]);
          setFiles(res.files || []);
          setCurrentFolderCounts(null);
        }
      } finally {
        if (fetchId === activeFetchIdRef.current) setLoading(false);
      }
      return;
    }

    // Default: scope === 'folders'
    if (!vaultApi.getListing) {
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
  }, [enabled, browseScope, currentFolder, sortField, sortDirection]);

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

  // Fetch listing when scope, folder, or sort changes
  useEffect(() => {
    const cacheKey =
      browseScope === 'stories'
        ? `scope:stories:${sortField}:${sortDirection}`
        : browseScope === 'files'
        ? `scope:files:${sortField}:${sortDirection}`
        : `${currentFolder}:${sortField}:${sortDirection}`;
    const hasCache = folderListingCache.has(cacheKey);
    void reloadListing({
      scope: browseScope,
      folder: currentFolder,
      field: sortField,
      direction: sortDirection,
      showLoading: !hasCache,
    });
  }, [browseScope, currentFolder, sortField, sortDirection, reloadListing]);

  // When backend database changes, clear cache and reload all (debounced to avoid event storming)
  useEffect(() => {
    if (!enabled || !vaultApi?.onChanged) return undefined;
    let debounceTimer = null;
    const unsub = vaultApi.onChanged(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        folderListingCache.clear();
        void reloadListing({
          scope: browseScope,
          folder: currentFolder,
          field: sortField,
          direction: sortDirection,
          showLoading: false,
        });
        void reloadTree();
        void reloadMetadata();
      }, 300);
    });
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, [enabled, browseScope, currentFolder, sortField, sortDirection, reloadListing, reloadTree, reloadMetadata]);

  const goTo = useCallback((folder) => {
    const nextFolder = sanitizeFolderPath(folder);
    if (browseScope !== 'folders') {
      setBrowseScopeState('folders');
    }
    if (nextFolder === currentFolder && browseScope === 'folders') return;

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
  }, [currentFolder, sortField, sortDirection, browseScope]);

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
      reloadListing({
        scope: browseScope,
        folder: currentFolder,
        field: sortField,
        direction: sortDirection,
        showLoading: true,
      }),
      reloadTree(),
      reloadMetadata(),
    ]);
  }, [browseScope, currentFolder, sortField, sortDirection, reloadListing, reloadTree, reloadMetadata]);

  return {
    currentFolder,
    browseScope,
    setBrowseScope,
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
    reload: reloadAll,
  };
}
