import { useI18n } from '../context/I18nContext';
import { IconSearch } from './DriveIcons';
import { TelegramRateLimitBadge } from './TelegramRateLimitBadge';

export function DriveTopBar({
  searchQuery,
  onSearchChange,
  title,
  icon,
  showSearch = true,
  helpAction,
  leftContent,
  centerContent,
  rightContent,
  selectionBar,
  floodWaitSec = 0,
}) {
  const { t } = useI18n();

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[var(--gd-border)] bg-[var(--gd-surface)] px-4">
      {selectionBar ? (
        <div className="flex min-w-0 flex-1 items-center justify-between gap-4">
          <div className="min-w-0 flex-1">{selectionBar}</div>
          <div className="shrink-0 flex items-center gap-2">
            <TelegramRateLimitBadge floodWaitSec={floodWaitSec} />
          </div>
        </div>
      ) : (
        <>
          {/* Left Slot: Breadcrumb / Title / Custom */}
          <div className="flex min-w-0 items-center gap-2 shrink-0 max-w-[55%]">
            {leftContent ? (
              leftContent
            ) : (
              <div className="flex items-center gap-2.5 min-w-0">
                {icon && <span className="shrink-0 text-[var(--gd-primary)]">{icon}</span>}
                {title && (
                  <h1 className="min-w-0 truncate text-base font-medium text-[var(--gd-text)]">{title}</h1>
                )}
              </div>
            )}
          </div>

          {/* Center Slot: Search or custom */}
          <div className="flex flex-1 items-center justify-center min-w-0 px-2">
            {centerContent !== undefined ? (
              centerContent
            ) : showSearch ? (
              <div className="gd-search flex h-9 w-full max-w-[420px] items-center gap-2.5 rounded-full bg-[var(--gd-surface-container)] px-3.5 transition-all focus-within:bg-[var(--gd-surface)] focus-within:ring-2 focus-within:ring-[var(--gd-primary)]/30 focus-within:shadow-sm">
                <IconSearch className="h-4 w-4 shrink-0 text-[var(--gd-text-secondary)]" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder={t('searchHint')}
                  className="w-full bg-transparent text-xs text-[var(--gd-text)] outline-none placeholder:text-[var(--gd-text-secondary)]"
                />
              </div>
            ) : null}
          </div>

          {/* Right Slot: Action buttons (Trùng lặp, List/Grid, Help) */}
          <div className="flex shrink-0 items-center gap-2">
            <TelegramRateLimitBadge floodWaitSec={floodWaitSec} />
            {rightContent}

            {helpAction ? (
              <button
                type="button"
                onClick={helpAction}
                title={t('helpButtonTooltip')}
                className="rounded-full p-1.5 text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)] hover:text-[var(--gd-text)] transition-colors cursor-pointer"
                aria-label={t('helpButtonTooltip')}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                  <line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </button>
            ) : null}
          </div>
        </>
      )}
    </header>
  );
}
