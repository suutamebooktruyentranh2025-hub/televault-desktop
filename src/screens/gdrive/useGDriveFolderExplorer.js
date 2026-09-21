import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

/**
 * Hook that manages state for the Folder Tree + Detail Panel UI.
 *
 * - Folder tree: lazy-loaded children, expanded state, selected folder
 * - Detail panel: files/subfolders of selected folder with pagination, search, filter
 * - Actions: sync folder, sync folder + subfolders, export CSV
 */
export function useGDriveFolderExplorer({ gdriveConnected } = {}) {
  const { showToast } = useToast();
  const { t } = useI18n();

  // ── Folder Tree State ──
  const [treeData, setTreeData] = useState({}); // parentId → folder[]
  const [expandedFolders, setExpandedFolders] = useState(new Set(['root']));
  const [selectedFolderId, setSelectedFolderId] = useState('root');
  const [selectedFolderPath, setSelectedFolderPath] = useState([
    { id: 'root', name: t('gdriveMyDrive') },
  ]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeSearch, setTreeSearch] = useState('');
  const [treeSearchResults, setTreeSearchResults] = useState([]);
  const [treeSearchLoading, setTreeSearchLoading] = useState(false);
  const treeSearchTimerRef = useRef(null);

  // ── Detail Panel State ──
  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(() => {
    try {
      const saved = localStorage.getItem('televault_gdrive_folder_status');
      if (saved && ['all', 'pending', 'synced'].includes(saved)) return saved;
    } catch {}
    return 'all';
  });
  const [sortBy, setSortBy] = useState('name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [loading, setLoading] = useState(false);

  // ── Ignored Files Filter ──
  const [hideIgnored, setHideIgnored] = useState(() => {
    try {
      const saved = localStorage.getItem('televault_gdrive_hide_ignored');
      if (saved !== null) return saved === 'true';
    } catch {}
    return true;
  });

  const handleToggleHideIgnored = useCallback((val) => {
    setHideIgnored((prev) => {
      const nextVal = typeof val === 'boolean' ? val : !prev;
      try {
        localStorage.setItem('televault_gdrive_hide_ignored', String(nextVal));
      } catch {}
      return nextVal;
    });
    setPage(1);
  }, []);

  // ── Summary (reuse existing summary hook logic) ──
  const [summary, setSummary] = useState({
    totalFiles: 0,
    totalFolders: 0,
    syncedCount: 0,
    pendingCount: 0,
    queuedCount: 0,
    errorCount: 0,
    skippedCount: 0,
    trashedCount: 0,
    totalSizeBytes: 0,
    syncedSizeBytes: 0,
    lastFullScanAt: null,
  });

  // ── Action State ──
  const [actionBusyId, setActionBusyId] = useState(null);
  const [syncFolderBusy, setSyncFolderBusy] = useState(null); // folderId or null
  const [syncAllBusy, setSyncAllBusy] = useState(false);
  const [reconcileBusy, setReconcileBusy] = useState(false);

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimerRef = useRef(null);

  const handleSearchChange = (val) => {
    setSearch(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(val);
      setPage(1);
    }, 300);
  };

  // ── Fetch Folder Tree Children ──
  const fetchFolderChildren = useCallback(async (parentId, hideIgnoredParam = hideIgnored) => {
    if (!window.televault?.gdrive?.queryFolderTree) return [];
    try {
      const res = await window.televault.gdrive.queryFolderTree({ parentId, hideIgnored: hideIgnoredParam });
      if (res?.ok && Array.isArray(res.folders)) {
        const seen = new Set();
        return res.folders.filter((f) => {
          if (!f.id || seen.has(f.id)) return false;
          seen.add(f.id);
          return true;
        });
      }
    } catch (err) {
      console.error('[FolderExplorer] Failed to fetch tree:', err);
    }
    return [];
  }, [hideIgnored]);

  // Load root-level folders on init
  useEffect(() => {
    if (!gdriveConnected) return;
    (async () => {
      setTreeLoading(true);
      const folders = await fetchFolderChildren('root');
      setTreeData((prev) => ({ ...prev, root: folders }));
      setTreeLoading(false);
    })();
  }, [gdriveConnected, fetchFolderChildren]);

  // ── Toggle Folder Expand ──
  const toggleFolder = useCallback(async (folderId) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
    // Lazy-load children if not already loaded
    if (!treeData[folderId]) {
      const folders = await fetchFolderChildren(folderId);
      setTreeData((prev) => ({ ...prev, [folderId]: folders }));
    }
  }, [treeData, fetchFolderChildren]);

  // ── Select Folder ──
  const selectFolder = useCallback((folderId, breadcrumb) => {
    setSelectedFolderId(folderId);
    setSelectedFolderPath(breadcrumb || [{ id: 'root', name: t('gdriveMyDrive') }]);
    setPage(1);
    setSearch('');
    setDebouncedSearch('');
  }, [t]);

  // ── Debounced Search For Folder Tree ──
  useEffect(() => {
    if (treeSearchTimerRef.current) clearTimeout(treeSearchTimerRef.current);
    const query = treeSearch.trim();
    if (!query) {
      setTreeSearchResults([]);
      setTreeSearchLoading(false);
      return;
    }

    setTreeSearchLoading(true);
    treeSearchTimerRef.current = setTimeout(async () => {
      try {
        if (window.televault?.gdrive?.searchFolders) {
          const res = await window.televault.gdrive.searchFolders({ search: query, limit: 100, hideIgnored });
          if (res?.ok) {
            setTreeSearchResults(res.folders || []);
          } else {
            setTreeSearchResults([]);
          }
        }
      } catch (err) {
        console.error('[FolderExplorer] searchFolders error:', err);
        setTreeSearchResults([]);
      } finally {
        setTreeSearchLoading(false);
      }
    }, 250);

    return () => {
      if (treeSearchTimerRef.current) clearTimeout(treeSearchTimerRef.current);
    };
  }, [treeSearch, hideIgnored]);

  // ── Select Folder From Search ──
  const selectFolderFromSearch = useCallback(async (folder) => {
    if (!folder?.id) return;
    try {
      let breadcrumb = [{ id: 'root', name: t('gdriveMyDrive') }];
      if (window.televault?.gdrive?.getFolderAncestors) {
        const res = await window.televault.gdrive.getFolderAncestors({ folderId: folder.id });
        if (res?.ok && Array.isArray(res.ancestors) && res.ancestors.length > 0) {
          breadcrumb = [
            { id: 'root', name: t('gdriveMyDrive') },
            ...res.ancestors.map((a) => ({ id: a.id, name: a.name })),
          ];
          setExpandedFolders((prev) => {
            const next = new Set(prev);
            for (const a of res.ancestors) {
              next.add(a.id);
            }
            return next;
          });
          for (const a of res.ancestors) {
            if (!treeData[a.id]) {
              fetchFolderChildren(a.id).then((children) => {
                setTreeData((prev) => ({ ...prev, [a.id]: children }));
              });
            }
          }
        } else {
          breadcrumb = [
            { id: 'root', name: t('gdriveMyDrive') },
            { id: folder.id, name: folder.name },
          ];
        }
      }
      selectFolder(folder.id, breadcrumb);
    } catch (err) {
      console.error('[FolderExplorer] selectFolderFromSearch error:', err);
      selectFolder(folder.id, [{ id: 'root', name: t('gdriveMyDrive') }, { id: folder.id, name: folder.name }]);
    }
  }, [t, selectFolder, fetchFolderChildren, treeData]);

  // ── Fetch Detail Panel Items ──
  const fetchDetail = useCallback(async () => {
    if (!window.televault?.gdrive?.queryFolderChildren) return;
    setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const res = await window.televault.gdrive.queryFolderChildren({
        parentId: selectedFolderId,
        search: debouncedSearch,
        status,
        hideIgnored,
        limit,
        offset,
        sortBy,
        sortOrder,
      });
      if (res?.ok) {
        const seen = new Set();
        const uniqueItems = (res.items || []).filter((item) => {
          if (!item.id || seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        setItems(uniqueItems);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.error('[FolderExplorer] fetchDetail error:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedFolderId, debouncedSearch, status, hideIgnored, limit, page, sortBy, sortOrder]);

  useEffect(() => {
    if (gdriveConnected) fetchDetail();
  }, [gdriveConnected, fetchDetail]);

  // ── Fetch Summary ──
  const fetchSummary = useCallback(async () => {
    if (!window.televault?.gdrive?.getCacheSummary) return;
    try {
      const res = await window.televault.gdrive.getCacheSummary();
      if (res?.ok && res.summary) {
        setSummary(res.summary);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (gdriveConnected) fetchSummary();
  }, [gdriveConnected, fetchSummary]);

  // Ref to always have latest expanded folders without recreating refreshTreeStats
  const expandedFoldersRef = useRef(expandedFolders);
  expandedFoldersRef.current = expandedFolders;

  // Refresh tree stats for currently visible folders
  const refreshTreeStats = useCallback(async (hideIgnoredParam = hideIgnored) => {
    const parentIds = ['root', ...expandedFoldersRef.current];
    for (const pid of parentIds) {
      const folders = await fetchFolderChildren(pid, hideIgnoredParam);
      setTreeData((prev) => ({ ...prev, [pid]: folders }));
    }
  }, [fetchFolderChildren, hideIgnored]);

  useEffect(() => {
    if (gdriveConnected) {
      refreshTreeStats();
    }
  }, [gdriveConnected, hideIgnored, refreshTreeStats]);

  // ── Listen for changes ──
  const prevScanPhaseRef = useRef(null);

  useEffect(() => {
    if (!window.televault?.gdrive?.onChanged) return;
    let timer = null;
    const unsub = window.televault.gdrive.onChanged((snapshot) => {
      const currentPhase = snapshot?.scanPhase || null;
      const isScanning = Boolean(currentPhase);
      prevScanPhaseRef.current = currentPhase;

      // During active scan, do NOT flood database with tree & summary queries!
      if (isScanning) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchSummary();
        fetchDetail();
        refreshTreeStats();
      }, 500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub?.();
    };
  }, [fetchSummary, fetchDetail, refreshTreeStats]);

  // ── Sorting ──
  const handleSort = (col) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    try {
      localStorage.setItem('televault_gdrive_folder_status', newStatus);
    } catch {}
    setPage(1);
  };

  // ── Sync File (individual) ──
  const handleSyncFile = async (driveFileId) => {
    if (!window.televault?.gdrive?.requeueCacheFile) return;
    setActionBusyId(driveFileId);
    try {
      const res = await window.televault.gdrive.requeueCacheFile(driveFileId);
      if (res?.ok) {
        showToast(t('gdriveToastFileEnqueued'), 'success');
        fetchDetail();
        fetchSummary();
      } else {
        showToast(res?.error || t('gdriveToastFileEnqueueError'), 'error');
      }
    } catch (err) {
      showToast(err.message || t('gdriveToastFileEnqueueException'), 'error');
    } finally {
      setActionBusyId(null);
    }
  };

  // ── Sync Folder ──
  const handleSyncFolder = async (folderId, includeSubfolders = false) => {
    if (!window.televault?.gdrive?.syncFolder) return;
    setSyncFolderBusy(folderId);
    try {
      const res = await window.televault.gdrive.syncFolder({ folderId, includeSubfolders });
      if (res?.ok) {
        showToast(
          t('gdriveToastFolderEnqueuedCount', { count: res.enqueuedCount || 0 }),
          'success'
        );
        fetchDetail();
        fetchSummary();
        refreshTreeStats();
      } else {
        showToast(res?.error || t('gdriveToastFolderEnqueueError'), 'error');
      }
    } catch (err) {
      showToast(err.message || t('gdriveToastFolderEnqueueException'), 'error');
    } finally {
      setSyncFolderBusy(null);
    }
  };

  // ── Sync All Pending (global) ──
  const handleSyncAllPending = async () => {
    if (!window.televault?.gdrive?.requeueAllPending) return;
    setSyncAllBusy(true);
    try {
      const res = await window.televault.gdrive.requeueAllPending({
        search: debouncedSearch,
        status: status === 'all' ? null : status,
      });
      if (res?.ok) {
        showToast(t('gdriveToastBatchEnqueuedCount', { count: res.enqueuedCount || 0 }), 'success');
        fetchDetail();
        fetchSummary();
      } else {
        showToast(res?.error || t('gdriveToastBatchEnqueueError'), 'error');
      }
    } catch (err) {
      showToast(err.message || t('gdriveToastBatchEnqueueException'), 'error');
    } finally {
      setSyncAllBusy(false);
    }
  };

  // ── Reconcile ──
  const handleReconcileExisting = async () => {
    if (!window.televault?.gdrive?.reconcileExisting) return;
    setReconcileBusy(true);
    try {
      const res = await window.televault.gdrive.reconcileExisting();
      if (res?.ok) {
        if (res.matchedCount > 0) {
          showToast(t('gdriveToastReconciledCount', { count: res.matchedCount }), 'success');
        } else {
          showToast(t('gdriveToastReconcileNoMatches'), 'info');
        }
        fetchDetail();
        fetchSummary();
        refreshTreeStats();
      } else {
        showToast(res?.error || t('gdriveToastReconcileError'), 'error');
      }
    } catch (err) {
      showToast(err.message || t('gdriveToastReconcileException'), 'error');
    } finally {
      setReconcileBusy(false);
    }
  };

  // ── Navigate into subfolder from detail panel ──
  const navigateToFolder = useCallback(async (folderId, folderName) => {
    const existingIndex = selectedFolderPath.findIndex((c) => c.id === folderId);
    let newBreadcrumb;
    if (existingIndex >= 0) {
      newBreadcrumb = selectedFolderPath.slice(0, existingIndex + 1);
    } else {
      newBreadcrumb = [...selectedFolderPath, { id: folderId, name: folderName }];
    }
    selectFolder(folderId, newBreadcrumb);
    // Auto-expand in tree
    if (!expandedFolders.has(folderId)) {
      await toggleFolder(folderId);
    }
  }, [selectedFolderPath, selectFolder, expandedFolders, toggleFolder]);

  // ── Navigate via breadcrumb ──
  const navigateToBreadcrumb = useCallback((index) => {
    const crumb = selectedFolderPath[index];
    if (!crumb) return;
    const newPath = selectedFolderPath.slice(0, index + 1);
    selectFolder(crumb.id, newPath);
  }, [selectedFolderPath, selectFolder]);

  // ── Open in Vault ──
  const handleOpenInVault = (item) => {
    if (!item?.vaultPath) return;
    let targetFolder = '/';
    let targetFilePath = null;

    if (item.isFolder) {
      targetFolder = item.vaultPath.endsWith('/') ? item.vaultPath : `${item.vaultPath}/`;
    } else {
      targetFilePath = item.vaultPath;
      const lastSlash = item.vaultPath.lastIndexOf('/');
      if (lastSlash >= 0) {
        targetFolder = item.vaultPath.substring(0, lastSlash + 1) || '/';
      } else {
        targetFolder = '/';
      }
    }
    if (!targetFolder.startsWith('/')) {
      targetFolder = '/' + targetFolder;
    }

    window.dispatchEvent(
      new CustomEvent('gd-navigate', {
        detail: { folder: targetFolder, filePath: targetFilePath },
      })
    );
  };

  return {
    // Tree
    treeData,
    expandedFolders,
    selectedFolderId,
    selectedFolderPath,
    treeLoading,
    treeSearch,
    setTreeSearch,
    treeSearchResults,
    treeSearchLoading,
    selectFolderFromSearch,
    toggleFolder,
    selectFolder,

    // Detail
    items,
    total,
    page,
    setPage,
    limit,
    setLimit,
    search,
    handleSearchChange,
    status,
    handleStatusChange,
    sortBy,
    sortOrder,
    handleSort,
    loading,

    // Filter
    hideIgnored,
    handleToggleHideIgnored,

    // Summary
    summary,

    // Actions
    actionBusyId,
    syncFolderBusy,
    syncAllBusy,
    reconcileBusy,
    handleSyncFile,
    handleSyncFolder,
    handleSyncAllPending,
    handleReconcileExisting,
    handleOpenInVault,
    navigateToFolder,
    navigateToBreadcrumb,

    // Refresh
    refresh: () => {
      fetchSummary();
      fetchDetail();
      refreshTreeStats();
    },
  };
}
