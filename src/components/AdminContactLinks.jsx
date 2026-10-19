import { useCallback } from 'react';
import { useI18n } from '../context/I18nContext';

export const ADMIN_EMAIL = 'suutamebooktruyentranh@gmail.com';
export const ADMIN_TELEGRAM_ALEX = 'https://t.me/alexdandan';
export const ADMIN_TELEGRAM_CHANNEL = 'https://t.me/suutamebooktruyentranh';

function useOpenExternal() {
  return useCallback((url) => {
    const u = String(url || '').trim();
    if (!u) return;
    const api = window.televault?.shell;
    if (api?.openExternal) {
      void api.openExternal(u);
    } else {
      window.open(u, '_blank', 'noopener,noreferrer');
    }
  }, []);
}

export function AdminContactLinks({ className = '' }) {
  const { t } = useI18n();
  const openExternal = useOpenExternal();
  const mailto = `mailto:${ADMIN_EMAIL}`;

  return (
    <div className={`gd-settings-card ${className}`}>
      {/* 1. Email */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm text-[var(--gd-text)]">
              {t('contactEmailTitle')}
            </div>
            <div className="truncate text-xs text-[var(--gd-text-secondary)] mt-0.5">
              {ADMIN_EMAIL}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openExternal(mailto)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[var(--gd-text)] hover:bg-[var(--gd-hover)] border border-[var(--gd-border)] rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
          <span>{t('contactBtnEmail')}</span>
        </button>
      </div>

      {/* 2. Telegram Alex */}
      <div className="border-t border-[var(--gd-border)] flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm text-[var(--gd-text)]">
              {t('contactAlexTitle')}
            </div>
            <div className="truncate text-xs text-[var(--gd-text-secondary)] mt-0.5">
              @alexdandan
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openExternal(ADMIN_TELEGRAM_ALEX)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:bg-sky-500/10 border border-sky-500/30 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
          </svg>
          <span>{t('contactBtnAlex')}</span>
        </button>
      </div>

      {/* 3. Telegram Channel */}
      <div className="border-t border-[var(--gd-border)] flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-sm text-[var(--gd-text)]">
              {t('contactChannelTitle')}
            </div>
            <div className="truncate text-xs text-[var(--gd-text-secondary)] mt-0.5">
              @suutamebooktruyentranh
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openExternal(ADMIN_TELEGRAM_CHANNEL)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/10 border border-indigo-500/30 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          <span>{t('contactBtnChannel')}</span>
        </button>
      </div>
    </div>
  );
}
