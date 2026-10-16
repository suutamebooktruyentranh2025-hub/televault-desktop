import React, { useState, useCallback } from 'react';
import { GDriveFilePicker } from '../../components/GDriveFilePicker';
import { useGDriveSyncState } from './useGDriveSyncState';
import { GDriveAuthForm } from './tabs/GDriveAuthForm';
import { GDriveSettingsTab } from './tabs/GDriveSettingsTab';
import { GDriveQueueTab } from './tabs/GDriveQueueTab';
import { GDriveErrorsTab } from './tabs/GDriveErrorsTab';
import { GDriveHistoryTab } from './tabs/GDriveHistoryTab';
import { GDriveCacheExplorerTab } from './tabs/GDriveCacheExplorerTab';
import { GDriveLiveScanFeed } from './components/GDriveLiveScanFeed';
import { GDriveProcessInspector } from './components/GDriveProcessInspector';

export function GDriveSyncScreen() {
  const state = useGDriveSyncState();
  const {
    t,
    initialLoading,
    confirm,
    gdriveConnected,
    gdriveEmail,
    gdriveClientId,
    setGdriveClientId,
    gdriveClientSecret,
    setGdriveClientSecret,
    connectGDrive,
    cancelGDriveConnect,
    gdriveConnecting,
    gdriveAuthUrl,
    gdriveStatus,
    currentThrottle,
    telegramFloodWaitSec,
    gdriveLastError,
    gdriveScanPhase,
    gdriveScanInfo,
    gdriveTotalCount,
    gdriveSyncedCount,
    gdriveCurrentSyncFile,
    gdriveIsPaused,
    handleScanNow,
    handleTogglePause,
    syncTargetChatId,
    handleSyncTargetChange,
    syncTargets,
    vaultRescanBusy,
    handleRescanSyncTargetVault,
    handleCancelRescanVault,
    rescanProgress,
    gdrivePollInterval,
    handlePollIntervalChange,
    gdriveConflictPolicy,
    handleConflictPolicyChange,
    autoSyncAfterScan,
    handleAutoSyncAfterScanChange,
    handleStartSync,
    handleReconnect,
    handleClearLastError,
    handleSaveFilters,
    gdriveIgnoredExtensions,
    setGdriveIgnoredExtensions,
    gdriveAllowedExtensions,
    setGdriveAllowedExtensions,
    gdriveTempDir,
    setGdriveTempDir,
    showToast,
    setShowGDrivePicker,
    gdriveSubs,
    toggleSub,
    removeSub,
    disconnectGDrive,
    activeSyncTab,
    setActiveSyncTab,
    gdriveQueue,
    selectedQueueIds,
    setSelectedQueueIds,
    visibleQueueCount,
    setVisibleQueueCount,
    lastSelectedRef,
    applyQueueSelection,
    handleSelectionClick,
    gdriveCurrentSyncProgress,
    gdriveCurrentSyncSpeedBps,
    gdriveSyncPhase,
    gdriveDownloadProgress,
    gdriveUploadProgress,
    gdriveErrors,
    selectedErrorIds,
    setSelectedErrorIds,
    visibleErrorsCount,
    setVisibleErrorsCount,
    lastSelectedErrorRef,
    applyErrorSelection,
    handleRetryFile,
    handleRetryErrors,
    handleRetryAll,
    gdriveRecentSynced,
    selectedHistoryIds,
    setSelectedHistoryIds,
    visibleHistoryCount,
    setVisibleHistoryCount,
    lastSelectedHistoryRef,
    applyHistorySelection,
    showGDrivePicker,
    handleAddGDriveSubs,
    cacheExplorer,
    folderExplorer,
    scanBusy,
    liveScannedItems,
    handleAbortScan,
    gdriveActiveTasks,
    handleSkipItem,
  } = state;

  const [showLiveScanFeed, setShowLiveScanFeed] = useState(true);
  const [showProcessInspector, setShowProcessInspector] = useState(true);
  const isScanning = scanBusy || (Boolean(gdriveScanPhase) && gdriveScanPhase !== 'vault-scanning');

  const handleClearQueue = useCallback(async () => {
    if (await confirm(t('gdriveSyncQueueClearAllConfirm'))) {
      await window.televault?.gdrive?.clearQueue?.();
      setSelectedQueueIds(new Set());
      if (lastSelectedRef) lastSelectedRef.current = null;
    }
  }, [confirm, t, setSelectedQueueIds, lastSelectedRef]);

  if (initialLoading) {
    return (
      <div className="flex h-full min-h-0 flex-1 items-center justify-center bg-[var(--gd-bg)]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          <span className="text-xs text-[var(--gd-text-secondary)]">{t('gdriveLoadingStatus')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-[var(--gd-bg)]">
      {!gdriveConnected ? (
        <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
          <div className="w-full max-w-xl gd-settings-card bg-[var(--gd-surface)] border border-[var(--gd-border)] rounded-2xl shadow-sm p-6">
            <GDriveAuthForm
              t={t}
              initialClientId={gdriveClientId}
              initialClientSecret={gdriveClientSecret}
              connectGDrive={connectGDrive}
              connecting={gdriveConnecting}
              authUrl={gdriveAuthUrl}
              cancelConnect={cancelGDriveConnect}
            />
          </div>
        </div>
      ) : (
        <>
          {/* Unified GDrive Navigation Tabs & Action Bar */}
          <div className="shrink-0 border-b border-[var(--gd-border)] bg-[var(--gd-surface)] px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
            {/* Left: Navigation Tabs */}
            <div className="flex items-center gap-1.5 p-0.5 rounded-xl bg-zinc-200/50 dark:bg-zinc-800/50 border border-[var(--gd-border)]/50 text-xs shrink-0">
              {/* Files & Folders */}
              <button
                type="button"
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSyncTab === 'cache'
                    ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-200 shadow-xs font-semibold border border-blue-300/80 dark:border-blue-600/50'
                    : 'text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onClick={() => setActiveSyncTab('cache')}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                </svg>
                <span>{t('gdriveTabFilesFolders')}</span>
                {(folderExplorer?.summary?.totalFiles || 0) > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                    activeSyncTab === 'cache'
                      ? 'bg-blue-200/80 text-blue-800 dark:bg-blue-800/60 dark:text-blue-100'
                      : 'bg-[var(--gd-primary)]/10 text-[var(--gd-primary)]'
                  }`}>
                    {(folderExplorer?.summary?.totalFiles || 0).toLocaleString()}
                  </span>
                )}
              </button>

              {/* Queue */}
              <button
                type="button"
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSyncTab === 'queue'
                    ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-200 shadow-xs font-semibold border border-blue-300/80 dark:border-blue-600/50'
                    : 'text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onClick={() => setActiveSyncTab('queue')}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>{t('gdriveTabQueue')}</span>
                {gdriveQueue.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                    activeSyncTab === 'queue'
                      ? 'bg-amber-200/80 text-amber-900 dark:bg-amber-800/60 dark:text-amber-100'
                      : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                  }`}>
                    {gdriveQueue.length.toLocaleString()}
                  </span>
                )}
              </button>

              {/* Errors */}
              <button
                type="button"
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSyncTab === 'errors'
                    ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-200 shadow-xs font-semibold border border-blue-300/80 dark:border-blue-600/50'
                    : 'text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onClick={() => setActiveSyncTab('errors')}
              >
                <svg className="h-3.5 w-3.5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{t('gdriveTabErrors')}</span>
                {gdriveErrors.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                    activeSyncTab === 'errors'
                      ? 'bg-red-200/80 text-red-900 dark:bg-red-800/60 dark:text-red-100'
                      : 'bg-red-500/15 text-red-600 dark:text-red-400'
                  }`}>
                    {gdriveErrors.length.toLocaleString()}
                  </span>
                )}
              </button>

              {/* History */}
              <button
                type="button"
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSyncTab === 'history'
                    ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-200 shadow-xs font-semibold border border-blue-300/80 dark:border-blue-600/50'
                    : 'text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onClick={() => setActiveSyncTab('history')}
              >
                <svg className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{t('gdriveTabHistory')}</span>
                {gdriveRecentSynced.length > 0 && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold tabular-nums ${
                    activeSyncTab === 'history'
                      ? 'bg-emerald-200/80 text-emerald-900 dark:bg-emerald-800/60 dark:text-emerald-100'
                      : 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  }`}>
                    {gdriveRecentSynced.length.toLocaleString()}
                  </span>
                )}
              </button>

              {/* Settings */}
              <button
                type="button"
                className={`px-3.5 py-1.5 rounded-lg font-medium transition-all cursor-pointer flex items-center gap-1.5 ${
                  activeSyncTab === 'settings'
                    ? 'bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-200 shadow-xs font-semibold border border-blue-300/80 dark:border-blue-600/50'
                    : 'text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-black/5 dark:hover:bg-white/5'
                }`}
                onClick={() => setActiveSyncTab('settings')}
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>{t('gdriveTabSettings')}</span>
              </button>
            </div>

            {/* Right: Status badge & Action Controls */}
            <div className="flex items-center gap-2 flex-wrap shrink-0">

              {/* Error warning: clearly separate GDrive OAuth errors from Telegram Vault errors */}
              {gdriveLastError && (() => {
                const lower = String(gdriveLastError).toLowerCase();
                const isDriveAuthError = Boolean(
                  (lower.includes('invalid_grant') ||
                    lower.includes('unauthorized') ||
                    lower.includes('invalid credentials') ||
                    lower.includes('token refresh failed') ||
                    lower.includes('401')) &&
                    !lower.includes('vault')
                );
                const isVaultTargetError = Boolean(
                  lower.includes('vault') || lower.includes('shared vault')
                );

                return (
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border max-w-[340px] ${
                    isDriveAuthError
                      ? 'bg-red-500/10 border-red-500/20 text-red-600 dark:text-red-400'
                      : 'bg-amber-500/10 border-amber-500/25 text-amber-700 dark:text-amber-300'
                  }`}>
                    <span className="text-[11px] truncate font-medium flex-1 min-w-0" title={gdriveLastError}>
                      {gdriveLastError}
                    </span>
                    {isDriveAuthError ? (
                      <button
                        type="button"
                        onClick={handleReconnect}
                        title={t('gdriveBtnReconnectTooltip')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-red-600 text-white hover:bg-red-700 transition-all cursor-pointer shrink-0 shadow-2xs active:scale-95"
                      >
                        <span>{t('gdriveBtnReconnect')}</span>
                      </button>
                    ) : isVaultTargetError ? (
                      <button
                        type="button"
                        onClick={() => handleSyncTargetChange('')}
                        title={t('gdriveBtnResetTargetPersonalTooltip')}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-600 text-white hover:bg-amber-700 transition-all cursor-pointer shrink-0 shadow-2xs active:scale-95"
                      >
                        <span>{t('gdriveBtnResetTargetPersonal')}</span>
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={handleClearLastError}
                      title={t('gdriveBtnDismissError')}
                      className="p-0.5 rounded text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                      aria-label={t('gdriveBtnDismissError')}
                    >
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                );
              })()}

              {/* Telegram Flood Wait Badge */}
              {telegramFloodWaitSec > 0 && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                  <span>⏳</span>
                  {t('gdriveTelegramFloodBadge', { n: telegramFloodWaitSec })}
                </span>
              )}

              {/* Start Sync (when queue exists and idle) */}
              {!isScanning && gdriveStatus === 'idle' && !gdriveIsPaused && gdriveQueue.length > 0 && (
                <button
                  type="button"
                  className="text-xs px-3 py-1.5 font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-98"
                  onClick={handleStartSync}
                >
                  <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  <span>{t('gdriveBtnSyncWithCount', { count: gdriveQueue.length })}</span>
                </button>
              )}

              {/* Pause / Resume Button with floating tooltip */}
              <div className="relative group/pause">
                <button
                  type="button"
                  className={`text-xs px-3 py-1.5 font-semibold rounded-lg border transition-all flex items-center gap-1.5 cursor-pointer shadow-xs active:scale-98 ${
                    gdriveIsPaused
                      ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20'
                      : 'bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] text-[var(--gd-text)] border-[var(--gd-border)]'
                  }`}
                  onClick={handleTogglePause}
                  aria-label={gdriveIsPaused ? t('gdriveTooltipResume') : t('gdriveTooltipPause')}
                >
                  {gdriveIsPaused ? (
                    <>
                      <svg className="h-3.5 w-3.5 fill-current text-amber-600 dark:text-amber-400" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      <span>{t('gdriveStatsResume')}</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
                        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                      </svg>
                      <span>{t('gdriveStatsPause')}</span>
                    </>
                  )}
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full mt-1.5 z-40 hidden group-hover/pause:flex flex-col items-center whitespace-nowrap rounded-md bg-zinc-900/95 dark:bg-zinc-800/95 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg border border-white/10 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
                >
                  <span className="absolute -top-1 right-4 h-2 w-2 rotate-45 bg-zinc-900/95 dark:bg-zinc-800/95 border-t border-l border-white/10" />
                  <span className="relative z-10">{gdriveIsPaused ? t('gdriveTooltipResume') : t('gdriveTooltipPause')}</span>
                </div>
              </div>

              {/* Scan Now Button with floating tooltip */}
              <div className="relative group/scan">
                <button
                  type="button"
                  className={`text-xs px-3.5 py-1.5 font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs ${
                    isScanning
                      ? 'bg-blue-600 text-white cursor-wait opacity-90'
                      : 'bg-[var(--gd-primary)] hover:opacity-90 text-white active:scale-98'
                  }`}
                  onClick={isScanning ? undefined : handleScanNow}
                  disabled={isScanning}
                  aria-label={isScanning ? t('gdriveScanningTitle') : t('gdriveScanAllTitle')}
                >
                  {isScanning ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      <span>{t('gdriveStatusScanning')}</span>
                    </>
                  ) : (
                    <>
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>{t('gdriveBtnScanDrive')}</span>
                    </>
                  )}
                </button>
                <div
                  role="tooltip"
                  className="pointer-events-none absolute right-0 top-full mt-1.5 z-40 hidden group-hover/scan:flex flex-col items-center whitespace-nowrap rounded-md bg-zinc-900/95 dark:bg-zinc-800/95 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg border border-white/10 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
                >
                  <span className="absolute -top-1 right-4 h-2 w-2 rotate-45 bg-zinc-900/95 dark:bg-zinc-800/95 border-t border-l border-white/10" />
                  <span className="relative z-10">{isScanning ? t('gdriveScanningTitle') : t('gdriveScanAllTitle')}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Scanning Progress Banner */}
          {isScanning && (
            <div className="shrink-0 px-4 py-2.5 bg-blue-500/10 dark:bg-blue-500/15 border-b border-blue-500/20 text-xs animate-fadeIn">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-6 w-6 rounded-md bg-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1.5 flex-wrap">
                      <span>
                        {gdriveScanPhase === 'fetching'
                          ? t('gdriveScanPhaseFetching')
                          : gdriveScanPhase === 'materializing'
                            ? t('gdriveScanPhaseMaterializing')
                            : gdriveScanPhase === 'saving'
                              ? t('gdriveScanPhaseSaving')
                              : gdriveScanPhase === 'indexing'
                                ? t('gdriveScanPhaseIndexing')
                                : gdriveScanPhase === 'scanning'
                                  ? t('gdriveScanPhaseScanning')
                                  : t('gdriveScanPhasePreparing')}
                      </span>
                      {gdriveScanPhase && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded uppercase font-bold tracking-wider bg-blue-500/20 text-blue-600 dark:text-blue-300">
                          {gdriveScanPhase}
                        </span>
                      )}
                    </div>
                    {gdriveScanInfo?.currentFolder && gdriveScanInfo.currentFolder !== '/' && (
                      <div className="text-[11px] text-[var(--gd-text-secondary)] font-mono truncate max-w-lg mt-0.5">
                        {t('gdriveScanCurrentFolder', { folder: gdriveScanInfo.currentFolder })}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowLiveScanFeed((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                      showLiveScanFeed
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-blue-500/20 text-blue-700 dark:text-blue-300 hover:bg-blue-500/30'
                    }`}
                    title={showLiveScanFeed ? t('gdriveLiveFeedCollapseTooltip') : t('gdriveLiveFeedExpandTooltip')}
                  >
                    <span>⚡</span>
                    <span>{showLiveScanFeed ? t('gdriveLiveFeedCollapse') : t('gdriveLiveFeedExpand', { count: liveScannedItems?.length || 0 })}</span>
                  </button>

                  <div className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold flex items-center gap-1">
                    <span>📦</span>
                    <span>{t('gdriveScanFilesFoundCount', { count: (gdriveScanInfo?.filesFound || 0).toLocaleString() })}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAbortScan}
                    className="px-2.5 py-1 rounded-md bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30 font-medium transition-colors cursor-pointer text-xs flex items-center gap-1"
                    title={t('gdriveScanStopTooltip')}
                  >
                    <span>✕</span>
                    <span>{t('gdriveScanStop')}</span>
                  </button>
                </div>
              </div>

              {/* Progress bar */}
              <div className="w-full bg-blue-500/20 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-blue-500 h-full rounded-full transition-all duration-300 relative overflow-hidden"
                  style={{
                    width: gdriveScanPhase === 'saving'
                      ? '95%'
                      : gdriveScanPhase === 'materializing'
                        ? '80%'
                        : gdriveScanPhase === 'fetching'
                          ? '55%'
                          : '30%',
                  }}
                >
                  <div className="absolute inset-0 bg-white/30 animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {/* Live Scanned Feed */}
          {isScanning && showLiveScanFeed && (
            <GDriveLiveScanFeed
              t={t}
              items={liveScannedItems}
              filesFound={gdriveScanInfo?.filesFound || 0}
              scanPhase={gdriveScanPhase}
              onClose={() => setShowLiveScanFeed(false)}
            />
          )}

          {/* Active File Sync Banner */}
          {!isScanning && gdriveStatus === 'syncing' && gdriveTotalCount > 0 && (
            <div className="shrink-0 px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs">
              <div className="flex justify-between items-center mb-1">
                <span className="truncate pr-2 font-medium text-[var(--gd-text)]">
                  🔄 {gdriveCurrentSyncFile ? t('gdriveSyncingFileProgress', { current: gdriveSyncedCount, total: gdriveTotalCount, file: gdriveCurrentSyncFile }) : t('gdriveStatsWaitingFiles')}
                </span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 shrink-0">
                  {Math.min(100, Math.round((gdriveSyncedCount / gdriveTotalCount) * 100))}%
                </span>
              </div>
              <div className="w-full bg-emerald-500/20 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.min(100, Math.round((gdriveSyncedCount / gdriveTotalCount) * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Live Process Inspector */}
          {!isScanning && (gdriveStatus === 'syncing' || (gdriveActiveTasks && gdriveActiveTasks.length > 0) || telegramFloodWaitSec > 0) && (
            <GDriveProcessInspector
              t={t}
              activeTasks={gdriveActiveTasks}
              telegramFloodWaitSec={telegramFloodWaitSec}
              gdriveStatus={gdriveStatus}
              currentSyncSpeedBps={gdriveCurrentSyncSpeedBps}
              onSkipItem={handleSkipItem}
              isOpen={showProcessInspector}
              onToggle={() => setShowProcessInspector((prev) => !prev)}
            />
          )}

          {/* Main View Area */}
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden p-3">
            {activeSyncTab === 'cache' && (
              <GDriveCacheExplorerTab
                t={t}
                folderExplorer={folderExplorer}
                onRescanVault={handleRescanSyncTargetVault}
                onCancelRescanVault={handleCancelRescanVault}
                rescanBusy={vaultRescanBusy}
                rescanProgress={rescanProgress}
                scanPhase={gdriveScanPhase}
              />
            )}

            {activeSyncTab === 'queue' && (
              <div className="flex-1 min-h-0 rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-xs overflow-hidden">
                <GDriveQueueTab
                  t={t}
                  gdriveQueue={gdriveQueue}
                  selectedQueueIds={selectedQueueIds}
                  setSelectedQueueIds={setSelectedQueueIds}
                  visibleQueueCount={visibleQueueCount}
                  setVisibleQueueCount={setVisibleQueueCount}
                  lastSelectedRef={lastSelectedRef}
                  applyQueueSelection={applyQueueSelection}
                  handleSelectionClick={handleSelectionClick}
                  gdriveActiveTasks={gdriveActiveTasks}
                  gdriveCurrentSyncFile={gdriveCurrentSyncFile}
                  gdriveCurrentSyncProgress={gdriveCurrentSyncProgress}
                  gdriveCurrentSyncSpeedBps={gdriveCurrentSyncSpeedBps}
                  gdriveSyncPhase={gdriveSyncPhase}
                  gdriveDownloadProgress={gdriveDownloadProgress}
                  gdriveUploadProgress={gdriveUploadProgress}
                  handleScanNow={handleScanNow}
                  isScanning={isScanning}
                  handleClearQueue={handleClearQueue}
                />
              </div>
            )}

            {activeSyncTab === 'errors' && (
              <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-xs overflow-hidden">
                {gdriveErrors.length > 0 && (
                  <div className="shrink-0 p-2.5 border-b border-[var(--gd-border)] bg-[var(--gd-surface-elevated)] flex justify-end gap-3 items-center text-xs">
                    <button
                      type="button"
                      className="text-[#0066cc] hover:underline font-semibold cursor-pointer"
                      onClick={async () => {
                        const res = await handleRetryAll();
                        if (res?.ok) {
                          setActiveSyncTab('queue');
                        }
                      }}
                    >
                      {t('gdriveSyncErrorActionRetryAll')}
                    </button>
                    <button
                      type="button"
                      className="text-red-500 hover:underline font-semibold cursor-pointer"
                      onClick={async () => {
                        if (await confirm(t('gdriveClearAllErrorsConfirm'))) {
                          window.televault?.gdrive?.clearErrors();
                        }
                      }}
                    >
                      {t('gdriveBtnClearAll')}
                    </button>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <GDriveErrorsTab
                    t={t}
                    gdriveErrors={gdriveErrors}
                    selectedErrorIds={selectedErrorIds}
                    setSelectedErrorIds={setSelectedErrorIds}
                    visibleErrorsCount={visibleErrorsCount}
                    setVisibleErrorsCount={setVisibleErrorsCount}
                    lastSelectedErrorRef={lastSelectedErrorRef}
                    applyErrorSelection={applyErrorSelection}
                    handleSelectionClick={handleSelectionClick}
                    handleRetryFile={handleRetryFile}
                    handleRetryErrors={handleRetryErrors}
                  />
                </div>
              </div>
            )}

            {activeSyncTab === 'history' && (
              <div className="flex-1 min-h-0 flex flex-col rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-xs overflow-hidden">
                {gdriveRecentSynced.length > 0 && (
                  <div className="shrink-0 p-2.5 border-b border-[var(--gd-border)] bg-[var(--gd-surface-elevated)] flex justify-end items-center text-xs">
                    <button
                      type="button"
                      className="text-red-500 hover:underline font-semibold cursor-pointer"
                      onClick={async () => {
                        if (await confirm(t('gdriveClearAllHistoryConfirm'))) {
                          window.televault?.gdrive?.clearHistory();
                        }
                      }}
                    >
                      {t('gdriveBtnClearAll')}
                    </button>
                  </div>
                )}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <GDriveHistoryTab
                    t={t}
                    gdriveRecentSynced={gdriveRecentSynced}
                    selectedHistoryIds={selectedHistoryIds}
                    setSelectedHistoryIds={setSelectedHistoryIds}
                    visibleHistoryCount={visibleHistoryCount}
                    setVisibleHistoryCount={setVisibleHistoryCount}
                    lastSelectedHistoryRef={lastSelectedHistoryRef}
                    applyHistorySelection={applyHistorySelection}
                    handleSelectionClick={handleSelectionClick}
                  />
                </div>
              </div>
            )}

            {activeSyncTab === 'settings' && (
              <div className="flex-1 min-h-0 rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-xs overflow-hidden">
                <GDriveSettingsTab
                  t={t}
                  syncTargetChatId={syncTargetChatId}
                  handleSyncTargetChange={handleSyncTargetChange}
                  syncTargets={syncTargets}
                  gdrivePollInterval={gdrivePollInterval}
                  handlePollIntervalChange={handlePollIntervalChange}
                  gdriveConflictPolicy={gdriveConflictPolicy}
                  handleConflictPolicyChange={handleConflictPolicyChange}
                  autoSyncAfterScan={autoSyncAfterScan}
                  handleAutoSyncAfterScanChange={handleAutoSyncAfterScanChange}
                  handleSaveFilters={handleSaveFilters}
                  gdriveIgnoredExtensions={gdriveIgnoredExtensions}
                  setGdriveIgnoredExtensions={setGdriveIgnoredExtensions}
                  gdriveAllowedExtensions={gdriveAllowedExtensions}
                  setGdriveAllowedExtensions={setGdriveAllowedExtensions}
                  gdriveTempDir={gdriveTempDir}
                  setGdriveTempDir={setGdriveTempDir}
                  showToast={showToast}
                  setShowGDrivePicker={setShowGDrivePicker}
                  gdriveSubs={gdriveSubs}
                  toggleSub={toggleSub}
                  removeSub={removeSub}
                  disconnectGDrive={disconnectGDrive}
                />
              </div>
            )}
          </div>
        </>
      )}

      {showGDrivePicker && (
        <GDriveFilePicker
          onConfirm={handleAddGDriveSubs}
          onCancel={() => setShowGDrivePicker(false)}
        />
      )}
    </div>
  );
}

export default GDriveSyncScreen;
