import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';
import { formatWaitTime } from '../utils/format';

export function TelegramRateLimitBadge({ floodWaitSec = 0 }) {
  const { t, locale } = useI18n();
  const isVi = locale !== 'en';
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  if (!floodWaitSec || floodWaitSec <= 0) return null;

  const formattedTime = formatWaitTime(floodWaitSec, isVi);

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex h-8 items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2.5 text-xs font-medium text-amber-700 dark:text-amber-400 transition-all hover:bg-amber-500/20 hover:border-amber-500/60 cursor-pointer shadow-sm"
        title={t('telegramFloodWaitTooltip', { n: formattedTime })}
        aria-expanded={isOpen}
      >
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-500 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500" />
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
        <span className="font-semibold whitespace-nowrap">
          {t('telegramFloodWaitBadge', { n: formattedTime })}
        </span>
      </button>

      {isOpen && (
        <div className="absolute right-0 top-10 z-50 mt-1 w-80 rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] p-3.5 shadow-xl backdrop-blur-md">
          <div className="flex items-start justify-between gap-2 border-b border-[var(--gd-border)] pb-2.5">
            <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 font-semibold text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <span>{t('telegramRateLimit')}</span>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="rounded p-0.5 text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)] hover:text-[var(--gd-text)] cursor-pointer"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          <div className="mt-2.5 space-y-2 text-xs text-[var(--gd-text-secondary)]">
            <p>
              {t('telegramFloodWaitTooltip', { n: formattedTime })}
            </p>
            <div className="rounded-lg bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
              ⏱️ {t('accountStatusFlood', { n: formattedTime })}
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-[var(--gd-border)] flex items-center justify-between">
            <span className="text-[11px] text-[var(--gd-text-secondary)]">SpamBot check</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                window.televault?.shell?.openExternal?.('https://t.me/Spambot');
              }}
              className="text-xs font-semibold text-[var(--gd-primary)] hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{t('checkSpamBot')}</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
