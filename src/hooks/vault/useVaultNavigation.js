import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLogs } from '../useLogs';

export function sectionTitle(section, t, isTrash, vaultView = 'files') {
  if (section === 'dashboard') return t('dashboardTitle');
  if (section === 'gdrive') return t('gdriveSection');
  if (section === 'transfers') return t('transfersTitle');
  if (section === 'duplicates' || (section === 'vault' && vaultView === 'duplicates')) return t('navDuplicates');
  if (section === 'settings') return t('settingsTitle');
  if (isTrash) return t('navTrash');
  return t('navVault');
}

export function folderLabelFromPath(path, myDriveLabel) {
  if (!path || path === '/') return myDriveLabel;
  return path.split('/').filter(Boolean).at(-1) || myDriveLabel;
}

export function parentFolderOfPath(path) {
  const trimmed = path.endsWith('/') ? path.slice(0, -1) : path;
  const lastSlash = trimmed.lastIndexOf('/');
  return lastSlash <= 0 ? '/' : `${trimmed.slice(0, lastSlash + 1)}`;
}

export function useVaultNavigation({ t, vault, sharedVaults }) {
  const [section, setSectionState] = useState(() => localStorage.getItem('televault_section') || 'vault');
  const [vaultView, setVaultView] = useState('files'); // 'files' | 'duplicates'

  const setSection = useCallback((nextSection) => {
    setSectionState(nextSection);
    setVaultView('files');
  }, []);

  useEffect(() => {
    localStorage.setItem('televault_section', section);
  }, [section]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [localSyncStatus, setLocalSyncStatus] = useState(null);
  const [gdriveSyncStatus, setGDriveSyncStatus] = useState(null);

  const { logs, clearLogs } = useLogs();
  const [logFooterVisible, setLogFooterVisible] = useState(() => {
    return localStorage.getItem('televaultLogFooterVisible') === 'true';
  });
  const [logPanelHeightPx, setLogPanelHeightPx] = useState(() => {
    const cached = parseInt(localStorage.getItem('televaultLogPanelHeightPx'), 10);
    return isNaN(cached) ? 128 : cached;
  });

  const toggleLogFooter = useCallback(() => {
    setLogFooterVisible((v) => {
      const next = !v;
      localStorage.setItem('televaultLogFooterVisible', String(next));
      return next;
    });
  }, []);

  const handleLogResizePointerDown = useCallback((e) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = logPanelHeightPx;

    const onPointerMove = (ev) => {
      const diff = startY - ev.clientY;
      const newH = Math.min(Math.max(startHeight + diff, 100), 500);
      setLogPanelHeightPx(newH);
    };

    const onPointerUp = (ev) => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      const diff = startY - ev.clientY;
      const newH = Math.min(Math.max(startHeight + diff, 100), 500);
      localStorage.setItem('televaultLogPanelHeightPx', String(newH));
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  }, [logPanelHeightPx]);

  useEffect(() => {
    // 1. Local Sync subscription
    const unsubLocal = window.televault?.sync?.onChanged?.((snapshot) => {
      setLocalSyncStatus(snapshot);
    });
    void window.televault?.sync?.getStatus?.().then((s) => {
      if (s?.ok) setLocalSyncStatus(s);
    });

    // 2. Google Drive Sync subscription
    const unsubGDrive = window.televault?.gdrive?.onChanged?.((snapshot) => {
      setGDriveSyncStatus(snapshot);
    });
    void window.televault?.gdrive?.getStatus?.().then((s) => {
      if (s?.ok) setGDriveSyncStatus(s);
    });

    return () => {
      unsubLocal?.();
      unsubGDrive?.();
    };
  }, []);

  const syncStatus = useMemo(() => {
    const local = localSyncStatus;
    const gd = gdriveSyncStatus;

    const isLocalConfigured = Boolean(local?.enabled || (local?.syncEnabled && local?.syncFolder));
    const isGDriveConnected = Boolean(gd?.connected);

    const isLocalSyncing = isLocalConfigured && local?.status === 'syncing';
    const isGDriveSyncing = isGDriveConnected && (gd?.status === 'syncing' || Boolean(gd?.scanPhase) || Boolean(gd?.currentSyncFile));

    const isLocalError = isLocalConfigured && (local?.status === 'error' || Boolean(local?.lastError));
    const isGDriveError = isGDriveConnected && (gd?.status === 'error' || Boolean(gd?.lastError));

    const isLocalConflict = isLocalConfigured && (local?.status === 'conflict' || (local?.conflictCount > 0));

    const isLocalPending = isLocalConfigured && (local?.pendingCount > 0);
    const isGDrivePending = isGDriveConnected && (gd?.pendingCount > 0);

    const isLocalPaused = isLocalConfigured && local?.status === 'paused';
    const isGDrivePaused = isGDriveConnected && (gd?.isPaused || gd?.status === 'paused');

    const totalPendingCount = (isLocalConfigured ? (local?.pendingCount || 0) : 0) +
                              (isGDriveConnected ? (gd?.pendingCount || 0) : 0);

    let status = 'off';
    let labelKey = 'syncStatusNotConfigured';

    if (isLocalSyncing || isGDriveSyncing) {
      status = 'syncing';
      labelKey = 'syncStatusSyncing';
    } else if (isLocalError || isGDriveError) {
      status = 'error';
      labelKey = 'syncStatusError';
    } else if (isLocalConflict) {
      status = 'conflict';
      labelKey = 'syncStatusConflict';
    } else if (isLocalPending || isGDrivePending) {
      status = 'pending';
      labelKey = 'syncStatusPending';
    } else if (isLocalPaused || isGDrivePaused) {
      status = 'paused';
      labelKey = 'syncStatusPaused';
    } else if (isGDriveConnected || isLocalConfigured) {
      const gdSynced = isGDriveConnected && (gd?.syncedCount > 0 || (!gd?.pendingCount && !gd?.scanPhase));
      const localSynced = isLocalConfigured && (local?.lastSyncAt || !local?.pendingCount);
      if (gdSynced || localSynced) {
        status = 'synced';
        labelKey = 'syncStatusSynced';
      } else {
        status = 'idle';
        labelKey = 'syncStatusSynced';
      }
    } else {
      status = 'off';
      labelKey = 'syncStatusNotConfigured';
    }

    return {
      status,
      labelKey,
      totalPendingCount,
      local: {
        isConfigured: isLocalConfigured,
        enabled: Boolean(local?.syncEnabled),
        folder: local?.syncFolder || null,
        status: local?.status || 'idle',
        pendingCount: local?.pendingCount || 0,
        conflictCount: local?.conflictCount || 0,
        lastSyncAt: local?.lastSyncAt || null,
        lastError: local?.lastError || null,
      },
      gdrive: {
        isConnected: isGDriveConnected,
        email: gd?.email || '',
        status: gd?.status || 'disconnected',
        isPaused: Boolean(gd?.isPaused),
        scanPhase: gd?.scanPhase || null,
        currentSyncFile: gd?.currentSyncFile || null,
        speedBps: gd?.speedBps || 0,
        pendingCount: gd?.pendingCount || 0,
        syncedCount: gd?.syncedCount || 0,
        totalCount: gd?.totalCount || 0,
        lastSyncAt: gd?.lastSyncAt || null,
        lastError: gd?.lastError || null,
      },
    };
  }, [localSyncStatus, gdriveSyncStatus]);

  const trash_root = vault.stats?.trashFolder || '/Rác/';
  const isTrash =
    vault.currentFolder === trash_root ||
    (typeof vault.currentFolder === 'string' && vault.currentFolder.startsWith(trash_root));

  const trash_breadcrumbs = useMemo(() => {
    const crumbs = [{ label: t('navTrash'), path: trash_root }];
    if (!vault.currentFolder?.startsWith(trash_root) || vault.currentFolder === trash_root) {
      return crumbs;
    }
    const relative_path = vault.currentFolder.slice(trash_root.length);
    const path_parts = relative_path.split('/').filter(Boolean);
    for (let part_index = 0; part_index < path_parts.length; part_index += 1) {
      crumbs.push({
        label: path_parts[part_index],
        path: `${trash_root}${path_parts.slice(0, part_index + 1).join('/')}/`,
      });
    }
    return crumbs;
  }, [t, trash_root, vault.currentFolder]);

  const showSearch = (section === 'vault' && !isTrash && vaultView !== 'duplicates') || section === 'shared-vault';
  const isSearching = showSearch && searchQuery.trim().length > 0;
  const pageTitle = isSearching ? t('searchHint') : sectionTitle(section, t, isTrash, vaultView);

  useEffect(() => {
    if (!isSearching) {
      setSearchResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      try {
        let result;
        if (section === 'shared-vault' && sharedVaults.activeVaultId) {
          result = await window.televault?.sharedVault?.search(sharedVaults.activeVaultId, searchQuery.trim());
        } else {
          result = await window.televault?.vault?.search(searchQuery.trim(), []);
        }
        if (!cancelled && result?.ok) setSearchResults(result.files);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery, isSearching, section, sharedVaults.activeVaultId]);

  return {
    section,
    setSection,
    vaultView,
    setVaultView,
    searchQuery,
    setSearchQuery,
    searchResults,
    setSearchResults,
    searchLoading,
    syncStatus,
    logs,
    clearLogs,
    logFooterVisible,
    toggleLogFooter,
    logPanelHeightPx,
    handleLogResizePointerDown,
    trash_root,
    isTrash,
    trash_breadcrumbs,
    showSearch,
    isSearching,
    pageTitle,
  };
}
