import React from 'react';

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatSpeed(bps) {
  if (!bps || bps <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bps) / Math.log(1024)));
  return `${(bps / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function GDriveProcessInspector({
  t,
  activeTasks = [],
  telegramFloodWaitSec = 0,
  gdriveStatus,
  currentSyncSpeedBps = 0,
  onSkipItem,
  isOpen = false,
  onToggle,
}) {
  const taskList = Array.isArray(activeTasks) ? activeTasks : [];
  const hasActiveTasks = taskList.length > 0;
  const isFloodWait = telegramFloodWaitSec > 0;

  // Render header badge / summary row
  return (
    <div className="shrink-0 border-b border-[var(--gd-border)] bg-[var(--gd-surface)] transition-all duration-200">
      {/* Top Toggle Bar */}
      <div className="px-4 py-2 flex items-center justify-between gap-3 text-xs bg-zinc-50 dark:bg-zinc-900/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-[var(--gd-text)]">
            <span className="relative flex h-2 w-2">
              {(hasActiveTasks || isFloodWait) && (
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                  isFloodWait ? 'bg-amber-400' : 'bg-emerald-400'
                }`} />
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${
                isFloodWait ? 'bg-amber-500' : hasActiveTasks ? 'bg-emerald-500' : 'bg-zinc-400'
              }`} />
            </span>
            <span>{t('gdriveProcessInspectorTitle')}</span>
          </div>

          {/* Active Workers Badge */}
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            {t('gdriveProcessInspectorActiveWorkers', { count: taskList.length })}
          </span>

          {/* Bandwidth Indicator */}
          {currentSyncSpeedBps > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
              <span>⚡</span>
              <span>{formatSpeed(currentSyncSpeedBps)}</span>
            </span>
          )}

          {/* Flood Wait Warning Pill */}
          {isFloodWait && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 animate-pulse">
              <span>⏳</span>
              <span>{telegramFloodWaitSec}s</span>
            </span>
          )}
        </div>

        {/* Toggle Button */}
        <button
          type="button"
          onClick={onToggle}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-black/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <span>{isOpen ? t('gdriveProcessInspectorHide') : t('gdriveProcessInspectorToggle')}</span>
          <svg
            className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {/* Expandable Inspector Body */}
      {isOpen && (
        <div className="p-3 border-t border-[var(--gd-border)] bg-[var(--gd-surface)] max-h-72 overflow-y-auto space-y-2">
          {/* Telegram Flood Wait Card */}
          {isFloodWait && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="text-xl shrink-0">⏳</span>
                <div className="min-w-0">
                  <div className="font-semibold">{t('gdriveProcessInspectorPhaseFloodWait')}</div>
                  <div className="text-[11px] opacity-80 mt-0.5 truncate">
                    {t('gdriveProcessInspectorFloodWaitDesc', { seconds: telegramFloodWaitSec })}
                  </div>
                </div>
              </div>
              <div className="text-base font-bold font-mono px-3 py-1 rounded-lg bg-amber-500/20 shrink-0">
                {telegramFloodWaitSec}s
              </div>
            </div>
          )}

          {/* Active Task List */}
          {taskList.length === 0 && !isFloodWait ? (
            <div className="py-4 text-center text-xs text-[var(--gd-text-secondary)]">
              {t('gdriveProcessInspectorNoTasks')}
            </div>
          ) : (
            taskList.map((task, idx) => {
              const pct = Math.min(100, Math.max(0, Math.round((Number(task.progress) || 0) * 100)));
              const isDownload = task.phase === 'download';
              const isHash = task.phase === 'hash';
              const isUpload = task.phase === 'upload';
              const isTaskFloodWait = task.phase === 'flood_wait';

              const phaseColor = isDownload
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20'
                : isHash
                  ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/20'
                  : isUpload
                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';

              const phaseIcon = isDownload ? '📥' : isHash ? '🔐' : isUpload ? '📤' : '⏳';
              const phaseLabel = isDownload
                ? t('gdriveProcessInspectorPhaseDownload')
                : isHash
                  ? t('gdriveProcessInspectorPhaseHash')
                  : isUpload
                    ? t('gdriveProcessInspectorPhaseUpload')
                    : t('gdriveProcessInspectorPhaseFloodWait');

              const barGradient = isDownload
                ? 'bg-gradient-to-r from-blue-500 to-sky-400'
                : isHash
                  ? 'bg-gradient-to-r from-purple-500 to-indigo-400'
                  : isUpload
                    ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                    : 'bg-amber-500';

              return (
                <div
                  key={task.workerId || task.driveFileId || idx}
                  className="p-2.5 rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface-elevated)] text-xs shadow-2xs hover:border-[var(--gd-border-hover)] transition-all"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    {/* Worker ID & Phase */}
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-200 dark:bg-zinc-800 text-[var(--gd-text)]">
                        #{idx + 1}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${phaseColor}`}>
                        <span>{phaseIcon}</span>
                        <span>{phaseLabel}</span>
                      </span>
                      <span className="font-medium text-[var(--gd-text)] truncate max-w-[280px]" title={task.fileName}>
                        {task.fileName || t('gdriveProcessInspectorUnknownFile')}
                      </span>
                      {task.size > 0 && (
                        <span className="text-[11px] text-[var(--gd-text-secondary)] font-mono shrink-0">
                          ({formatBytes(task.size)})
                        </span>
                      )}
                    </div>

                    {/* Speed + Skip Action */}
                    <div className="flex items-center gap-2 shrink-0">
                      {task.speedBps > 0 && (
                        <span className="text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
                          {formatSpeed(task.speedBps)}
                        </span>
                      )}
                      <span className="font-mono font-bold text-xs tabular-nums text-[var(--gd-text)]">
                        {isHash ? 'SHA-256' : `${pct}%`}
                      </span>
                      {typeof onSkipItem === 'function' && task.driveFileId && (
                        <button
                          type="button"
                          onClick={() => onSkipItem(task.driveFileId)}
                          className="px-2 py-0.5 rounded text-[10px] font-medium bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/20 transition-colors cursor-pointer"
                          title={t('gdriveProcessInspectorBtnSkip')}
                        >
                          {t('gdriveProcessInspectorBtnSkip')}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${barGradient} ${
                        isHash ? 'animate-pulse w-full' : ''
                      }`}
                      style={{ width: isHash ? '100%' : `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
