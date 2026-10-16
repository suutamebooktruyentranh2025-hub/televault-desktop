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
    <div className="space-y-4">
      {/* Version & Manual Check */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[var(--gd-surface)] border border-[var(--gd-border)] rounded-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm text-[var(--gd-text)]">TeleVault Desktop</span>
            <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              v{currentVersion || '0.3.1'}
            </span>
          </div>
          <p className="text-xs text-[var(--gd-text-secondary)]">
            {t('updateCurrentVersion', { version: currentVersion || '0.3.1' })}
          </p>
        </div>

        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50 shrink-0"
        >
          {checking ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
              <span>{t('updateChecking')}</span>
            </>
          ) : (
            <>
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
              </svg>
              <span>{t('updateCheckBtn')}</span>
            </>
          )}
        </button>
      </div>

      {/* Status Messages */}
      {status === 'up_to_date' && (
        <div className="flex items-center gap-2.5 p-3.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl text-xs font-medium animate-in fade-in">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          <span>{t('updateUpToDate')}</span>
        </div>
      )}

      {status === 'update_available' && updateResult && (
        <div className="flex items-center justify-between p-3.5 bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-500/10 border border-blue-500/25 rounded-xl text-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
            </span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {t('updateAvailable', { version: updateResult.latestVersion })}
            </span>
          </div>
          <button
            type="button"
            onClick={() => onOpenUpdateModal?.(updateResult)}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            {t('updateDownload')}
          </button>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-center gap-2.5 p-3.5 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-xl text-xs font-medium animate-in fade-in">
          <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{t('updateCheckFailed')}</span>
        </div>
      )}

      {/* Auto Check Switch */}
      <div className="flex items-center justify-between p-4 bg-[var(--gd-surface)] border border-[var(--gd-border)] rounded-xl">
        <div className="space-y-0.5">
          <label htmlFor="auto-check-toggle" className="text-sm font-medium text-[var(--gd-text)] cursor-pointer">
            {t('updateAutoCheck')}
          </label>
          <p className="text-xs text-[var(--gd-text-secondary)]">
            {t('updateAutoCheckSub')}
          </p>
        </div>

        <button
          id="auto-check-toggle"
          type="button"
          role="switch"
          aria-checked={autoCheckEnabled}
          onClick={() => onToggleAutoCheck?.(!autoCheckEnabled)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-hidden ${
            autoCheckEnabled ? 'bg-blue-600' : 'bg-zinc-300 dark:bg-zinc-700'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
              autoCheckEnabled ? 'translate-x-5' : 'translate-x-0'
            }`}
          />
        </button>
      </div>
    </div>
  );
}
