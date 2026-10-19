import { useState, useEffect, useCallback, useRef } from 'react';
import { useI18n } from '../../context/I18nContext';
import { useDialog } from '../../context/DialogContext';
import { useToast } from '../../context/ToastContext';
import { retryGDriveErrorsSequentially } from '../../utils/retryGDriveErrors';
import { useGDriveFolderExplorer } from './useGDriveFolderExplorer';

export function useGDriveSyncState() {
  const { t } = useI18n();
  const { confirm } = useDialog();
  const { showToast } = useToast();

  const [initialLoading, setInitialLoading] = useState(true);
  const [gdriveConnected, setGdriveConnected] = useState(false);
  const folderExplorer = useGDriveFolderExplorer({ gdriveConnected });
  const [gdriveEmail, setGdriveEmail] = useState('');
  const [gdriveClientId, setGdriveClientId] = useState('');
  const [gdriveClientSecret, setGdriveClientSecret] = useState('');
  const [gdriveSubs, setGdriveSubs] = useState([]);
  const [showGDrivePicker, setShowGDrivePicker] = useState(false);
  const [gdrivePollInterval, setGdrivePollInterval] = useState(300000);
  const [gdriveStatus, setGdriveStatus] = useState('disconnected');
  const [gdriveDisconnecting, setGdriveDisconnecting] = useState(false);
  const [gdriveIsPaused, setGdriveIsPaused] = useState(false);
  const [gdriveLastError, setGdriveLastError] = useState(null);
  const [gdrivePendingCount, setGdrivePendingCount] = useState(0);
  const [gdriveTotalCount, setGdriveTotalCount] = useState(0);
  const [gdriveSyncedCount, setGdriveSyncedCount] = useState(0);
  const [gdriveCurrentSyncFile, setGdriveCurrentSyncFile] = useState(null);
  const [gdriveCurrentSyncProgress, setGdriveCurrentSyncProgress] = useState(0);
  const [gdriveCurrentSyncSpeedBps, setGdriveCurrentSyncSpeedBps] = useState(0);
  const [gdriveSyncPhase, setGdriveSyncPhase] = useState(null);
  const [gdriveDownloadProgress, setGdriveDownloadProgress] = useState(0);
  const [gdriveUploadProgress, setGdriveUploadProgress] = useState(0);
  const [gdriveQueue, setGdriveQueue] = useState([]);
  const [gdriveActiveTasks, setGdriveActiveTasks] = useState([]);
  const [gdriveRecentSynced, setGdriveRecentSynced] = useState([]);
  const [gdriveScanPhase, setGdriveScanPhase] = useState(null);
  const [gdriveScanInfo, setGdriveScanInfo] = useState(null);
  const [gdriveIgnoredExtensions, setGdriveIgnoredExtensions] = useState('');
  const [gdriveAllowedExtensions, setGdriveAllowedExtensions] = useState('');
  const [gdriveTempDir, setGdriveTempDir] = useState('');
  const [gdriveConflictPolicy, setGdriveConflictPolicy] = useState('skip');
  const [autoSyncAfterScan, setAutoSyncAfterScan] = useState(true);
  const [syncTargetChatId, setSyncTargetChatId] = useState('');
  const [syncTargets, setSyncTargets] = useState([]);
  const [vaultRescanBusy, setVaultRescanBusy] = useState(false);
  const [rescanProgress, setRescanProgress] = useState(0);

  useEffect(() => {
    if (!window.televault?.vault?.onScanProgress) return undefined;
    const unsub = window.televault.vault.onScanProgress((payload) => {
      if (typeof payload?.scanned === 'number') {
        setRescanProgress(payload.scanned);
      }
    });
    return () => unsub?.();
  }, []);
  const [progressSources, setProgressSources] = useState([]);
  const [progressSourceId, setProgressSourceId] = useState('');
  const [progressBusy, setProgressBusy] = useState(false);
  const [gdriveErrors, setGdriveErrors] = useState([]);
  const [currentThrottle, setCurrentThrottle] = useState(null);
  const [telegramFloodWaitSec, setTelegramFloodWaitSec] = useState(0);
  const [checkConnBusy, setCheckConnBusy] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [liveScannedItems, setLiveScannedItems] = useState([]);
  const [activeSyncTab, setActiveSyncTab] = useState('cache');
  const [gdriveConnecting, setGdriveConnecting] = useState(false);
  const [gdriveAuthUrl, setGdriveAuthUrl] = useState(null);
  const [syncStarting, setSyncStarting] = useState(false);

  const isSyncing = syncStarting || (!gdriveIsPaused && (
    gdriveStatus === 'syncing' ||
    (Array.isArray(gdriveActiveTasks) && gdriveActiveTasks.length > 0) ||
    Boolean(gdriveCurrentSyncFile)
  ));

  const [selectedQueueIds, setSelectedQueueIds] = useState(new Set());
  const [selectedErrorIds, setSelectedErrorIds] = useState(new Set());
  const [selectedHistoryIds, setSelectedHistoryIds] = useState(new Set());
  const [visibleQueueCount, setVisibleQueueCount] = useState(50);
  const [visibleErrorsCount, setVisibleErrorsCount] = useState(50);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(50);
  const lastSelectedRef = useRef(null);
  const lastSelectedErrorRef = useRef(null);
  const lastSelectedHistoryRef = useRef(null);
  const prevScanPhaseRef = useRef(null);
  const scanActiveRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const gdStatus = await window.televault?.gdrive?.getStatus();
      if (gdStatus?.ok) {
        setGdriveConnected(gdStatus.connected);
        setGdriveEmail(gdStatus.email || '');
        setGdriveSubs(gdStatus.subscriptions || []);
        setGdrivePollInterval(gdStatus.pollIntervalMs !== undefined ? gdStatus.pollIntervalMs : 300000);
        setGdriveStatus(gdStatus.status || 'disconnected');
        setGdriveIsPaused(gdStatus.isPaused || false);
        setGdriveLastError(gdStatus.lastError || null);
        setGdrivePendingCount(gdStatus.pendingCount || 0);
        setGdriveTotalCount(gdStatus.totalCount || 0);
        setGdriveSyncedCount(gdStatus.syncedCount || 0);
        setGdriveCurrentSyncFile(gdStatus.currentSyncFile || null);
        setGdriveCurrentSyncProgress(gdStatus.currentSyncProgress || 0);
        setGdriveCurrentSyncSpeedBps(gdStatus.speedBps || 0);
        setGdriveSyncPhase(gdStatus.syncPhase || null);
        setGdriveDownloadProgress(gdStatus.downloadProgress || 0);
        setGdriveUploadProgress(gdStatus.uploadProgress || 0);
        setGdriveQueue(gdStatus.syncQueue || []);
        setGdriveRecentSynced(gdStatus.recentSynced || []);
        setGdriveScanPhase(gdStatus.scanPhase || null);
        setGdriveScanInfo(gdStatus.scanInfo || null);
        setGdriveIgnoredExtensions(gdStatus.ignoredExtensions || '');
        setGdriveAllowedExtensions(gdStatus.allowedExtensions || '');
        setGdriveTempDir(gdStatus.tempDownloadDir || '');
        setGdriveConflictPolicy(gdStatus.conflictPolicy || 'skip');
        setAutoSyncAfterScan(gdStatus.autoSyncAfterScan !== false);
        setSyncTargetChatId(gdStatus.syncTargetChatId || '');
        setGdriveErrors(gdStatus.syncErrors || []);
        setCurrentThrottle(gdStatus.throttleInfo || null);
        setTelegramFloodWaitSec(Number(gdStatus.telegramFloodWaitSec) || 0);
        if (Array.isArray(gdStatus.activeTasks)) setGdriveActiveTasks(gdStatus.activeTasks);
        if (gdStatus.clientId !== undefined) setGdriveClientId(gdStatus.clientId || '');
        if (gdStatus.clientSecret !== undefined) setGdriveClientSecret(gdStatus.clientSecret || '');
        if (gdStatus.authUrl !== undefined) setGdriveAuthUrl(gdStatus.authUrl || null);
      }
      const targetsRes = await window.televault?.gdrive?.getSyncTargets?.();
      if (targetsRes?.ok) {
        setSyncTargets(targetsRes.targets || []);
        if (targetsRes.selectedChatId != null) setSyncTargetChatId(targetsRes.selectedChatId || '');
      }
    } catch (err) {
      console.error('[useGDriveSyncState] Failed to load status:', err);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadProgressSources = useCallback(async () => {
    const res = await window.televault?.gdrive?.listProgressImportSources?.();
    if (res?.ok) {
      const sources = res.sources || [];
      setProgressSources(sources);
      setProgressSourceId((prev) => (sources.some((s) => s.id === prev) ? prev : (sources[0]?.id || '')));
    }
  }, []);

  useEffect(() => {
    if (gdriveConnected) void loadProgressSources();
  }, [gdriveConnected, loadProgressSources]);

  useEffect(() => {
    const unsub = window.televault?.gdrive?.onChanged((snapshot) => {
      if (snapshot) {
        setGdriveConnected(snapshot.connected);
        setGdriveEmail(snapshot.email || '');
        setGdriveSubs(snapshot.subscriptions || []);
        setGdrivePollInterval(snapshot.pollIntervalMs !== undefined ? snapshot.pollIntervalMs : 300000);
        setGdriveStatus(snapshot.status || 'disconnected');
        setGdriveIsPaused(snapshot.isPaused || false);
        setGdriveLastError(snapshot.lastError || null);
        setGdrivePendingCount(snapshot.pendingCount || 0);
        setGdriveTotalCount(snapshot.totalCount || 0);
        setGdriveSyncedCount(snapshot.syncedCount || 0);
        setGdriveCurrentSyncFile(snapshot.currentSyncFile || null);
        setGdriveCurrentSyncProgress(snapshot.currentSyncProgress || 0);
        setGdriveCurrentSyncSpeedBps(snapshot.speedBps || 0);
        setGdriveSyncPhase(snapshot.syncPhase || null);
        setGdriveDownloadProgress(snapshot.downloadProgress || 0);
        setGdriveUploadProgress(snapshot.uploadProgress || 0);
        setGdriveQueue(snapshot.syncQueue || []);
        setGdriveRecentSynced(snapshot.recentSynced || []);
        setGdriveScanPhase(snapshot.scanPhase || null);
        setGdriveScanInfo(snapshot.scanInfo || null);
        if (Array.isArray(snapshot.scanInfo?.recentItems) && snapshot.scanInfo.recentItems.length > 0) {
          setLiveScannedItems((prev) => {
            const incoming = snapshot.scanInfo.recentItems;
            const seen = new Set(prev.map((x) => x.id));
            const newEntries = incoming.filter((x) => !seen.has(x.id));
            if (newEntries.length === 0) return prev;
            return [...newEntries, ...prev].slice(0, 200);
          });
        }
        setGdriveIgnoredExtensions(snapshot.ignoredExtensions || '');
        setGdriveAllowedExtensions(snapshot.allowedExtensions || '');
        setGdriveTempDir(snapshot.tempDownloadDir || '');
        setGdriveConflictPolicy(snapshot.conflictPolicy || 'skip');
        if (snapshot.autoSyncAfterScan !== undefined) setAutoSyncAfterScan(snapshot.autoSyncAfterScan !== false);
        setSyncTargetChatId(snapshot.syncTargetChatId || '');
        setGdriveErrors(snapshot.syncErrors || []);
        setCurrentThrottle(snapshot.throttleInfo || null);
        setTelegramFloodWaitSec(Number(snapshot.telegramFloodWaitSec) || 0);
        if (Array.isArray(snapshot.activeTasks)) setGdriveActiveTasks(snapshot.activeTasks);
        if (snapshot.clientId !== undefined) setGdriveClientId(snapshot.clientId || '');
        if (snapshot.clientSecret !== undefined) setGdriveClientSecret(snapshot.clientSecret || '');
        const currentPhase = snapshot.scanPhase || null;
        if (currentPhase) {
          scanActiveRef.current = true;
        }
        prevScanPhaseRef.current = currentPhase;

        // Detect background scan completion
        if (scanActiveRef.current && !currentPhase) {
          scanActiveRef.current = false;
          setScanBusy(false);
          if (snapshot.lastError) {
            showToast(snapshot.lastError, { variant: 'error' });
          } else {
            showToast(t('gdriveToastScanDone'), { variant: 'success' });
          }
          if (typeof folderExplorer?.refresh === 'function') {
            void folderExplorer.refresh();
          }
        }
      }
      if (!snapshot?.scanPhase) {
        void window.televault?.gdrive?.getSyncTargets?.().then((targetsRes) => {
          if (targetsRes?.ok) {
            setSyncTargets(targetsRes.targets || []);
            if (targetsRes.selectedChatId != null) setSyncTargetChatId(targetsRes.selectedChatId || '');
          }
        });
      }
    });

    const unsubProgress = window.televault?.gdrive?.onProgress?.((payload) => {
      if (!payload) return;
      if (payload.currentSyncFile !== undefined) {
        setGdriveCurrentSyncFile(payload.currentSyncFile || null);
      }
      if (typeof payload.currentSyncProgress === 'number') {
        setGdriveCurrentSyncProgress(payload.currentSyncProgress);
      }
      if (typeof payload.speedBps === 'number') {
        setGdriveCurrentSyncSpeedBps(payload.speedBps);
      }
      if (payload.syncPhase !== undefined) {
        setGdriveSyncPhase(payload.syncPhase || null);
      }
      if (typeof payload.downloadProgress === 'number') {
        setGdriveDownloadProgress(payload.downloadProgress);
      }
      if (typeof payload.uploadProgress === 'number') {
        setGdriveUploadProgress(payload.uploadProgress);
      }
      if (Array.isArray(payload.activeTasks)) {
        setGdriveActiveTasks(payload.activeTasks);
      }
    });

    const unsubShared = window.televault?.sharedVault?.onChanged?.(() => {
      void window.televault?.gdrive?.getSyncTargets?.().then((targetsRes) => {
        if (targetsRes?.ok) {
          setSyncTargets(targetsRes.targets || []);
          if (targetsRes.selectedChatId != null) setSyncTargetChatId(targetsRes.selectedChatId || '');
        }
      });
    });

    return () => {
      unsub?.();
      unsubProgress?.();
      unsubShared?.();
    };
  }, []);

  async function connectGDrive(overrideClientId, overrideClientSecret) {
    const cid = (overrideClientId !== undefined ? overrideClientId : gdriveClientId)?.trim();
    const csecret = (overrideClientSecret !== undefined ? overrideClientSecret : gdriveClientSecret)?.trim();
    if (!cid || !csecret) {
      showToast(t('gdriveToastEnterCredentials'), { variant: 'error' });
      return { ok: false };
    }
    if (cid !== gdriveClientId) setGdriveClientId(cid);
    if (csecret !== gdriveClientSecret) setGdriveClientSecret(csecret);
    setGdriveConnecting(true);
    try {
      const res = await window.televault?.gdrive?.connect(cid, csecret);
      if (!res?.ok) {
        if (!res?.error?.includes?.('hủy') && !res?.error?.includes?.('cancel')) {
          showToast(t('gdriveToastConnectError', { error: res?.error || 'Unknown error' }), { variant: 'error' });
        }
        return res;
      }
      return res;
    } finally {
      setGdriveConnecting(false);
      setGdriveAuthUrl(null);
    }
  }

  async function cancelGDriveConnect() {
    setGdriveConnecting(false);
    setGdriveAuthUrl(null);
    await window.televault?.gdrive?.cancelConnect?.();
  }

  async function disconnectGDrive(opts) {
    if (gdriveDisconnecting) return;
    setGdriveDisconnecting(true);
    try {
      const payload = (opts && typeof opts === 'object' && !('nativeEvent' in opts) && !('target' in opts))
        ? opts
        : undefined;
      const res = await window.televault?.gdrive?.disconnect(payload);
      if (res?.ok === false && res?.error) {
        showToast(t('gdriveToastDisconnectError', { error: res.error }), { variant: 'error' });
      } else if (!payload?.silent) {
        showToast(t('gdriveToastDisconnected'), { variant: 'info' });
      }
      return res;
    } catch (err) {
      console.error('[GDrive] Disconnect failed:', err);
      showToast(t('gdriveToastDisconnectError', { error: String(err?.message || err) }), { variant: 'error' });
    } finally {
      setGdriveDisconnecting(false);
    }
  }

  const handleReconnect = useCallback(async () => {
    await disconnectGDrive({ silent: true });
  }, []);

  async function toggleSub(driveId, enabled) {
    await window.televault?.gdrive?.toggleSubscription(driveId, enabled);
  }

  async function removeSub(driveId) {
    await window.televault?.gdrive?.removeSubscription(driveId);
  }

  async function handlePollIntervalChange(val) {
    const ms = Number(val);
    setGdrivePollInterval(ms);
    await window.televault?.gdrive?.setPollInterval(ms);
  }

  async function handleConflictPolicyChange(policy) {
    setGdriveConflictPolicy(policy);
    const save_result = await window.televault?.gdrive?.setConflictPolicy(policy);
    if (!save_result?.ok) {
      showToast(t('gdriveConflictPolicySaveError'), { variant: 'error' });
      await load();
    }
  }

  async function handleClearLastError() {
    setGdriveLastError(null);
    await window.televault?.gdrive?.clearLastError?.();
  }

  async function handleSyncTargetChange(chatId) {
    setSyncTargetChatId(chatId);
    const save_result = await window.televault?.gdrive?.setSyncTarget?.(chatId);
    if (!save_result?.ok) {
      showToast(save_result?.error || t('gdriveSyncTargetSaveError'), { variant: 'error' });
      await load();
    }
  }

  async function handleRescanSyncTargetVault() {
    if (vaultRescanBusy) return;
    setVaultRescanBusy(true);
    setRescanProgress(0);
    try {
      const res = await window.televault?.gdrive?.rescanSyncTargetVault?.();
      if (res?.ok) {
        showToast(t('gdriveRescanVaultDone', {
          files: res.fileCount ?? 0,
          messages: res.scanned ?? 0,
        }));
        await load();
        if (typeof folderExplorer?.refresh === 'function') {
          void folderExplorer.refresh();
        }
      } else if (res?.aborted) {
        showToast(t('rescanVaultCancelled'), { variant: 'info' });
      } else {
        showToast(res?.error || t('gdriveRescanVaultError'), { variant: 'error' });
      }
    } catch (e) {
      if (e?.name === 'AbortError' || String(e?.message || e).toLowerCase().includes('abort')) {
        showToast(t('rescanVaultCancelled'), { variant: 'info' });
      } else {
        showToast(String(e?.message || e) || t('gdriveRescanVaultError'), { variant: 'error' });
      }
    } finally {
      setVaultRescanBusy(false);
      setRescanProgress(0);
    }
  }

  async function handleCancelRescanVault() {
    await window.televault?.gdrive?.cancelRescanVault?.();
  }


  async function handleCheckConnection() {
    if (checkConnBusy) return;
    setCheckConnBusy(true);
    try {
      const res = await window.televault?.gdrive?.checkConnection?.();
      if (res?.ok) {
        showToast(t('gdriveCheckConnectionSuccess', { email: res.email || '', ms: res.latencyMs || 0 }), { variant: 'success' });
        await load();
      } else {
        showToast(res?.error || t('gdriveCheckConnectionError'), { variant: 'error' });
        await load();
      }
    } catch (err) {
      showToast(String(err?.message || err) || t('gdriveCheckConnectionError'), { variant: 'error' });
    } finally {
      setCheckConnBusy(false);
    }
  }

  async function handleScanNow() {
    if (scanBusy || Boolean(gdriveScanPhase) || isSyncing) return;
    setScanBusy(true);
    scanActiveRef.current = true;
    setLiveScannedItems([]);
    try {
      const res = await window.televault?.gdrive?.scanNow?.({ forceIndex: true });
      if (res && !res.ok) {
        scanActiveRef.current = false;
        setScanBusy(false);
        if (!res.error?.toLowerCase().includes('abort')) {
          showToast(res.error || t('gdriveScanError'), { variant: 'error' });
        }
      }
    } catch (err) {
      scanActiveRef.current = false;
      setScanBusy(false);
      if (!String(err?.message || err).toLowerCase().includes('abort')) {
        showToast(String(err?.message || err) || t('gdriveScanError'), { variant: 'error' });
      }
    }
  }

  async function handleAbortScan() {
    try {
      scanActiveRef.current = false;
      setScanBusy(false);
      await window.televault?.gdrive?.abortScan?.();
      showToast(t('gdriveToastScanStopped'), { variant: 'info' });
      await load();
    } catch (err) {
      console.warn('Failed to abort scan:', err);
    }
  }

  async function handleStartSync() {
    setSyncStarting(true);
    try {
      const conn = await window.televault?.gdrive?.checkConnection?.();
      if (conn && !conn.ok) {
        showToast(conn.error || t('gdriveCheckConnectionError'), { variant: 'error' });
        await load();
        return;
      }
      const res = await window.televault?.gdrive?.startSync?.();
      if (res && !res.ok) {
        showToast(res.error || t('gdriveStartSyncError'), { variant: 'error' });
        await load();
        return;
      }
      await load();
    } catch (err) {
      showToast(String(err?.message || err) || t('gdriveStartSyncError'), { variant: 'error' });
      await load();
    } finally {
      setSyncStarting(false);
    }
  }

  async function handleAutoSyncAfterScanChange(enabled) {
    setAutoSyncAfterScan(enabled);
    const res = await window.televault?.gdrive?.setAutoSyncAfterScan?.(enabled);
    if (!res?.ok) {
      await load();
    }
  }

  async function handleImportProgressFromAccount() {
    if (!progressSourceId || progressBusy) return;
    const confirmed = await confirm(t('gdriveProgressImportConfirm'));
    if (!confirmed) return;
    setProgressBusy(true);
    try {
      const res = await window.televault?.gdrive?.importProgressFromAccount(progressSourceId);
      if (res?.ok) {
        showToast(t('gdriveProgressImportSuccess', { manifest: res.manifestCount ?? 0, files: res.filesMerged ?? 0 }));
        await load();
        await loadProgressSources();
      } else {
        showToast(t('gdriveProgressImportError'), { variant: 'error' });
      }
    } finally {
      setProgressBusy(false);
    }
  }

  async function handleExportProgress() {
    if (progressBusy) return;
    setProgressBusy(true);
    try {
      const res = await window.televault?.gdrive?.exportProgress();
      if (res?.cancelled) return;
      if (res?.ok) {
        showToast(t('downloadDone', { path: res.zipPath }));
      } else {
        showToast(res?.error || t('gdriveProgressImportError'), { variant: 'error' });
      }
    } finally {
      setProgressBusy(false);
    }
  }

  async function handleImportProgressZip() {
    if (progressBusy) return;
    const confirmed = await confirm(t('gdriveProgressImportConfirm'));
    if (!confirmed) return;
    setProgressBusy(true);
    try {
      const res = await window.televault?.gdrive?.importProgress();
      if (res?.cancelled) return;
      if (res?.ok) {
        showToast(t('gdriveProgressImportSuccess', { manifest: res.manifestCount ?? 0, files: res.filesMerged ?? 0 }));
        await load();
        await loadProgressSources();
      } else {
        showToast(t('gdriveProgressImportError'), { variant: 'error' });
      }
    } finally {
      setProgressBusy(false);
    }
  }

  async function handleTogglePause() {
    await window.televault?.gdrive?.setPaused(!gdriveIsPaused);
  }

  async function handleSaveFilters() {
    const res = await window.televault?.gdrive?.setFilters(gdriveIgnoredExtensions, gdriveAllowedExtensions);
    const res2 = await window.televault?.gdrive?.setTempDir(gdriveTempDir);
    if (res?.ok && res2?.ok) {
      showToast(t('gdriveFiltersSavedAlert'));
    } else {
      showToast(t('gdriveToastFilterSaveError'), { variant: 'error' });
    }
  }

  async function handleAddGDriveSubs(subs) {
    setShowGDrivePicker(false);
    for (const sub of subs) {
      await window.televault?.gdrive?.addSubscription(sub);
    }
  }

  async function handleRetryFile(driveFileId) {
    const res = window.televault?.gdrive?.retryErrors
      ? await window.televault.gdrive.retryErrors([driveFileId])
      : await window.televault?.gdrive?.retryFile(driveFileId);
    if (!res?.ok) {
      showToast(t('gdriveToastRetryError', { error: res?.error || 'Unknown error' }), { variant: 'error' });
    } else {
      showToast(t('gdriveToastRetrySingleEnqueued'), { variant: 'success' });
    }
    return res;
  }

  async function handleRetryErrors(driveFileIds) {
    const ids = Array.isArray(driveFileIds) ? driveFileIds : [driveFileIds].filter(Boolean);
    if (ids.length === 0) return { ok: true, enqueuedCount: 0 };
    const res = window.televault?.gdrive?.retryErrors
      ? await window.televault.gdrive.retryErrors(ids)
      : await window.televault?.gdrive?.retryAllErrors?.();
    if (!res?.ok) {
      showToast(t('gdriveToastRetryError', { error: res?.error || 'Unknown error' }), { variant: 'error' });
    } else {
      const count = res.enqueuedCount !== undefined ? res.enqueuedCount : ids.length;
      showToast(t('gdriveToastRetryEnqueuedCount', { count }), { variant: 'success' });
    }
    return res;
  }

  async function handleRetryAll() {
    let res;
    if (typeof window.televault?.gdrive?.retryAllErrors === 'function') {
      res = await window.televault.gdrive.retryAllErrors();
    } else if (typeof window.televault?.gdrive?.retryErrors === 'function') {
      res = await window.televault.gdrive.retryErrors(gdriveErrors.map(e => e.driveFileId));
    } else {
      await retryGDriveErrorsSequentially(
        gdriveErrors,
        (drive_file_id) => window.televault?.gdrive?.retryFile(drive_file_id),
      );
      res = { ok: true, enqueuedCount: gdriveErrors.length };
    }
    if (!res?.ok) {
      showToast(t('gdriveToastRetryError', { error: res?.error || 'Unknown error' }), { variant: 'error' });
    } else {
      const count = res.enqueuedCount !== undefined ? res.enqueuedCount : gdriveErrors.length;
      showToast(t('gdriveToastRetryEnqueuedCount', { count }), { variant: 'success' });
    }
    return res;
  }

  const makeSelectionHandler = (setSelectedIds, lastRef) => {
    return (key, { additive, range }, orderedKeys) => {
      if (!key) {
        setSelectedIds(new Set());
        lastRef.current = null;
        return;
      }

      if (range && lastRef.current && orderedKeys.length > 0) {
        const from = orderedKeys.indexOf(lastRef.current);
        const to = orderedKeys.indexOf(key);
        if (from >= 0 && to >= 0) {
          const lo = Math.min(from, to);
          const hi = Math.max(from, to);
          const newIds = new Set();
          for (const entryKey of orderedKeys.slice(lo, hi + 1)) {
            newIds.add(entryKey);
          }
          setSelectedIds(newIds);
          lastRef.current = key;
          return;
        }
      }

      if (additive) {
        setSelectedIds((prev) => {
          const next = new Set(prev);
          if (next.has(key)) next.delete(key);
          else next.add(key);
          return next;
        });
      } else {
        setSelectedIds(new Set([key]));
      }
      lastRef.current = key;
    };
  };

  const applyQueueSelection = useCallback(makeSelectionHandler(setSelectedQueueIds, lastSelectedRef), []);
  const applyErrorSelection = useCallback(makeSelectionHandler(setSelectedErrorIds, lastSelectedErrorRef), []);
  const applyHistorySelection = useCallback(makeSelectionHandler(setSelectedHistoryIds, lastSelectedHistoryRef), []);

  const handleSelectionClick = useCallback(
    (e, key, orderedKeys, applySelection) => {
      e.stopPropagation();
      const modifiers = {
        additive: e.metaKey || e.ctrlKey,
        range: e.shiftKey,
      };

      if (e.target.closest('.gd-row-action') || e.target.closest('.gd-row-actions') || e.target.closest('.gd-row-checkbox')) {
        return;
      }

      if (modifiers.additive || modifiers.range) {
        applySelection(key, modifiers, orderedKeys);
      } else {
        applySelection(key, { additive: false, range: false }, orderedKeys);
      }
    },
    []
  );

  const handleSkipItem = useCallback(
    async (driveFileId) => {
      try {
        const res = await window.televault?.gdrive?.skipItem?.(driveFileId);
        if (res?.ok) {
          showToast(t('gdriveToastItemSkipped'), { variant: 'success' });
        } else {
          showToast(res?.error || t('gdriveToastItemSkipFailed'), { variant: 'error' });
        }
      } catch (err) {
        showToast(err.message, { variant: 'error' });
      }
    },
    [showToast, t]
  );

  return {
    t,
    confirm,
    showToast,
    initialLoading,
    gdriveConnected,
    gdriveEmail,
    gdriveClientId,
    setGdriveClientId,
    gdriveClientSecret,
    setGdriveClientSecret,
    gdriveSubs,
    showGDrivePicker,
    setShowGDrivePicker,
    gdrivePollInterval,
    gdriveStatus,
    gdriveIsPaused,
    gdriveLastError,
    gdrivePendingCount,
    gdriveTotalCount,
    gdriveSyncedCount,
    gdriveCurrentSyncFile,
    gdriveCurrentSyncProgress,
    gdriveCurrentSyncSpeedBps,
    gdriveSyncPhase,
    gdriveDownloadProgress,
    gdriveUploadProgress,
    gdriveQueue,
    gdriveActiveTasks,
    gdriveRecentSynced,
    gdriveScanPhase,
    gdriveScanInfo,
    gdriveIgnoredExtensions,
    setGdriveIgnoredExtensions,
    gdriveAllowedExtensions,
    setGdriveAllowedExtensions,
    gdriveTempDir,
    setGdriveTempDir,
    gdriveConflictPolicy,
    autoSyncAfterScan,
    syncTargetChatId,
    syncTargets,
    vaultRescanBusy,
    progressSources,
    progressSourceId,
    setProgressSourceId,
    progressBusy,
    gdriveErrors,
    currentThrottle,
    telegramFloodWaitSec,
    activeSyncTab,
    setActiveSyncTab,
    selectedQueueIds,
    setSelectedQueueIds,
    selectedErrorIds,
    setSelectedErrorIds,
    selectedHistoryIds,
    setSelectedHistoryIds,
    visibleQueueCount,
    setVisibleQueueCount,
    visibleErrorsCount,
    setVisibleErrorsCount,
    visibleHistoryCount,
    setVisibleHistoryCount,
    lastSelectedRef,
    lastSelectedErrorRef,
    lastSelectedHistoryRef,
    connectGDrive,
    cancelGDriveConnect,
    gdriveConnecting,
    gdriveDisconnecting,
    gdriveAuthUrl,
    disconnectGDrive,
    handleReconnect,
    handleClearLastError,
    toggleSub,
    removeSub,
    handlePollIntervalChange,
    handleConflictPolicyChange,
    handleSyncTargetChange,
    handleRescanSyncTargetVault,
    handleCancelRescanVault,
    rescanProgress,
    handleAutoSyncAfterScanChange,
    checkConnBusy,
    handleCheckConnection,
    scanBusy,
    liveScannedItems,
    setLiveScannedItems,
    handleScanNow,
    handleAbortScan,
    handleStartSync,
    handleImportProgressFromAccount,
    handleExportProgress,
    handleImportProgressZip,
    handleTogglePause,
    handleSaveFilters,
    handleAddGDriveSubs,
    handleRetryFile,
    handleRetryErrors,
    handleRetryAll,
    handleSkipItem,
    applyQueueSelection,
    applyErrorSelection,
    applyHistorySelection,
    handleSelectionClick,
    cacheExplorer: null,
    folderExplorer,
    isSyncing,
    syncStarting,
  };
}
