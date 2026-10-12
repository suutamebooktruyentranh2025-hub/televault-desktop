import { useI18n } from '../context/I18nContext';
import { formatWaitTime } from '../utils/format';


export function StatusBar({ floodWaitSec = 0 }) {
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
    </footer>
  );
}
