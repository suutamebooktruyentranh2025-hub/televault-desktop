import { useI18n } from '../context/I18nContext';
import { formatWaitTime } from '../utils/format';


export function StatusBar({ logFooterVisible, onToggleLogFooter, floodWaitSec = 0 }) {
  const { t, locale } = useI18n();

  return (
    <footer className="flex h-8 shrink-0 items-center justify-between border-t border-[var(--gd-border)] bg-[var(--gd-surface)] px-4 text-xs font-medium uppercase tracking-wide text-gray-600 dark:text-zinc-400">
      <div className="flex items-center gap-3">
        <span>TeleVault Desktop</span>
        <span className="text-[var(--gd-border)]">|</span>
        <div className="flex items-center gap-1.5 font-normal normal-case">
          <span
            className={`h-2 w-2 rounded-full shrink-0 ${
              floodWaitSec > 0 ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
            }`}
          />
          <span className={floodWaitSec > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : ''}>
            {floodWaitSec > 0
              ? `${t('telegramRateLimit')}: ${formatWaitTime(floodWaitSec, locale !== 'en')}`
              : t('telegramConnected')}
          </span>
        </div>
      </div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={onToggleLogFooter}
          title={logFooterVisible ? t('hideLogPanel') : t('showLogPanel')}
          className="flex h-6 w-6 cursor-pointer items-center justify-center rounded hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {logFooterVisible ? (
              <>
                <polyline points="4 14 12 22 20 14"></polyline>
                <line x1="12" y1="22" x2="12" y2="2"></line>
              </>
            ) : (
              <>
                <polyline points="4 10 12 2 20 10"></polyline>
                <line x1="12" y1="2" x2="12" y2="22"></line>
              </>
            )}
          </svg>
        </button>
      </div>
    </footer>
  );
}
