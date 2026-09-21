import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '../../context/ToastContext';
import { useI18n } from '../../context/I18nContext';

export function useGDriveCacheExplorer({ gdriveConnected } = {}) {
  const { showToast } = useToast();
  const { t } = useI18n();

  const [items, setItems] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sortBy, setSortBy] = useState('drive_path');
  const [sortOrder, setSortOrder] = useState('asc');
  const [loading, setLoading] = useState(false);
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
  });

  const [actionBusyId, setActionBusyId] = useState(null);
  const [syncAllBusy, setSyncAllBusy] = useState(false);
  const [reconcileBusy, setReconcileBusy] = useState(false);

  // Debounced search state
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

  const fetchSummary = useCallback(async () => {
    if (!window.televault?.gdrive?.getCacheSummary) return;
    try {
      const res = await window.televault.gdrive.getCacheSummary();
      if (res?.ok && res.summary) {
        setSummary(res.summary);
      }
    } catch {}
  }, []);

  const fetchFiles = useCallback(async () => {
    if (!window.televault?.gdrive?.queryCacheFiles) return;
    setLoading(true);
    try {
      let isFolder = null;
      if (typeFilter === 'files') isFolder = 0;
      if (typeFilter === 'folders') isFolder = 1;

      const offset = (page - 1) * limit;
      const res = await window.televault.gdrive.queryCacheFiles({
        search: debouncedSearch,
        status,
        isFolder,
        limit,
        offset,
        sortBy,
        sortOrder,
      });

      if (res?.ok) {
        setItems(res.items || []);
        setTotal(res.total || 0);
      }
    } catch (err) {
      console.error('Failed to query cache files:', err);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, status, typeFilter, limit, page, sortBy, sortOrder]);

  // Initial load and parameter change triggers
  useEffect(() => {
    if (gdriveConnected) {
      fetchSummary();
      fetchFiles();
    }
  }, [gdriveConnected, fetchSummary, fetchFiles]);

  // Listen to sync changes to refresh summary and files periodically
  const prevScanPhaseRef = useRef(null);

  useEffect(() => {
    if (!window.televault?.gdrive?.onChanged) return;
    let timer = null;
    const unsub = window.televault.gdrive.onChanged((snapshot) => {
      const currentPhase = snapshot?.scanPhase || null;
      prevScanPhaseRef.current = currentPhase;

      if (currentPhase) return;

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        fetchSummary();
        fetchFiles();
      }, 500);
    });
    return () => {
      if (timer) clearTimeout(timer);
      unsub?.();
    };
  }, [fetchSummary, fetchFiles]);

  const handleStatusChange = (newStatus) => {
    setStatus(newStatus);
    setPage(1);
  };

  const handleTypeChange = (newType) => {
    setTypeFilter(newType);
    setPage(1);
  };

  const handleSort = (col) => {
    if (sortBy === col) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortOrder('asc');
    }
    setPage(1);
  };

  const handleSyncFile = async (driveFileId) => {
    if (!window.televault?.gdrive?.requeueCacheFile) return;
    setActionBusyId(driveFileId);
    try {
      const res = await window.televault.gdrive.requeueCacheFile(driveFileId);
      if (res?.ok) {
        showToast(t('gdriveToastFileEnqueued'), 'success');
        fetchFiles();
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
        fetchFiles();
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
        fetchFiles();
        fetchSummary();
      } else {
        showToast(res?.error || t('gdriveToastReconcileError'), 'error');
      }
    } catch (err) {
      showToast(err.message || t('gdriveToastReconcileException'), 'error');
    } finally {
      setReconcileBusy(false);
    }
  };

  const handleExportCsv = async () => {
    if (!window.televault?.gdrive?.exportCacheCsv) return;
    try {
      let isFolder = null;
      if (typeFilter === 'files') isFolder = 0;
      if (typeFilter === 'folders') isFolder = 1;

      const res = await window.televault.gdrive.exportCacheCsv({
        search: debouncedSearch,
        status,
        isFolder,
      });

      if (res?.ok && res.csvContent) {
        const blob = new Blob([res.csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `televault_gdrive_scanned_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(t('gdriveToastExportCsvSuccess'), 'success');
      } else {
        showToast(res?.error || t('gdriveToastExportCsvError'), 'error');
      }
    } catch (err) {
      showToast(err.message || t('gdriveToastExportCsvException'), 'error');
    }
  };

  return {
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
    typeFilter,
    handleTypeChange,
    sortBy,
    sortOrder,
    handleSort,
    loading,
    summary,
    actionBusyId,
    syncAllBusy,
    reconcileBusy,
    handleSyncFile,
    handleSyncAllPending,
    handleReconcileExisting,
    handleExportCsv,
    refresh: () => {
      fetchSummary();
      fetchFiles();
    },
  };
}
