import { useState, useEffect } from 'react';
import { useI18n } from '../../context/I18nContext';

export function UpdateChecker({ currentVersion, onOpenUpdateModal, autoCheckEnabled, onToggleAutoCheck }) {
  const { t } = useI18n();
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState(null); // null | 'up_to_date' | 'update_available' | 'error'
  const [updateResult, setUpdateResult] = useState(null);

  async function handleCheck() {
    setChecking(true);
    setStatus(null);
    try {
      const res = await window.televault?.updater?.checkUpdate();
      if (res?.ok && res.update) {
        setUpdateResult(res.update);
        if (res.update.hasUpdate) {
          setStatus('update_available');
        } else {
          setStatus('up_to_date');
        }
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="gd-settings-card">
      {/* 1-Line Row: App Icon & Version on Left, Control Pill & Action Button on Right */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
        {/* Left: App icon & Version info */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-[var(--gd-primary)]/10 text-[var(--gd-primary)] border border-[var(--gd-primary)]/20 flex items-center justify-center shrink-0 shadow-2xs">
            <svg className="w-4.5 h-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-[var(--gd-text)]">TeleVault Desktop</span>
              <span className="px-2 py-0.5 text-[11px] font-mono font-medium rounded-full bg-[var(--gd-primary)]/10 text-[var(--gd-primary)] border border-[var(--gd-primary)]/20">
                v{currentVersion || (typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '')}
              </span>
            </div>
            <span className="text-xs text-[var(--gd-text-secondary)] mt-0.5 truncate">
              {t('updateAutoCheckSub')}
            </span>
          </div>
        </div>

        {/* Right: Auto-check Toggle Chip & Check Button */}
        <div className="flex items-center gap-2.5 sm:gap-3 shrink-0">
          <label
            htmlFor="auto-check-toggle"
            className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[var(--gd-surface-elevated)] border border-[var(--gd-border)] hover:border-[var(--gd-primary)]/40 transition-colors cursor-pointer select-none shadow-2xs"
          >
            <span className="text-xs font-medium text-[var(--gd-text-secondary)]">
              {t('updateAutoCheck')}
            </span>
            <button
              id="auto-check-toggle"
              type="button"
              role="switch"
              aria-checked={autoCheckEnabled}
              aria-label={t('updateAutoCheck')}
              onClick={() => onToggleAutoCheck?.(!autoCheckEnabled)}
              className={`relative inline-flex h-4.5 w-8 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden ${
                autoCheckEnabled ? 'bg-[var(--gd-primary)]' : 'bg-zinc-300 dark:bg-zinc-600'
              }`}
            >
              <span
                aria-hidden="true"
                className={`pointer-events-none inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform duration-200 ease-in-out ${
                  autoCheckEnabled ? 'translate-x-[16px]' : 'translate-x-[2px]'
                }`}
              />
            </button>
          </label>

          <button
            type="button"
            onClick={handleCheck}
            disabled={checking}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[var(--gd-primary)] hover:opacity-90 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50 shrink-0"
          >
            {checking ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>{t('updateChecking')}</span>
              </>
            ) : (
              <>
                <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                <span>{t('updateCheckBtn')}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {status === 'up_to_date' && (
        <div className="border-t border-[var(--gd-border)] flex items-center gap-2.5 p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs font-medium animate-in fade-in">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{t('updateUpToDate')}</span>
        </div>
      )}

      {status === 'update_available' && updateResult && (
        <div className="border-t border-[var(--gd-border)] flex items-center justify-between p-3 bg-gradient-to-r from-[var(--gd-primary)]/10 via-[var(--gd-primary)]/5 to-[var(--gd-primary)]/10 text-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--gd-primary)] opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[var(--gd-primary)]" />
            </span>
            <span className="font-medium text-[var(--gd-primary)]">
              {t('updateAvailable', { version: updateResult.latestVersion })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenUpdateModal?.(updateResult)}
            className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[var(--gd-primary)] hover:opacity-90 active:scale-95 rounded-xl shadow-xs transition-all cursor-pointer"
          >
            {t('updateDownload')}
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="border-t border-[var(--gd-border)] flex items-center gap-2.5 p-3 bg-red-500/10 text-red-600 dark:text-red-400 text-xs font-medium animate-in fade-in">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{t('updateCheckFailed')}</span>
        </div>
      )}
    </div>
  );
}
