import { useI18n } from '../context/I18nContext';

export function SortHeader({ active, direction, onClick, label, align = 'left', children }) {
  const { t } = useI18n();
  const columnTitle = label || (typeof children === 'string' ? children : '');

  const tooltipText = active
    ? (direction === 'asc' ? t('sortHeaderTooltipAsc') : t('sortHeaderTooltipDesc'))
    : t('sortHeaderTooltipDefault', { column: columnTitle });

  return (
    <div className={`relative group/sort flex w-full ${align === 'right' ? 'justify-end text-right' : 'justify-start text-left'}`}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 py-0.5 px-1.5 rounded-md font-medium text-xs transition-all duration-150 cursor-pointer select-none ${
          align === 'right' ? '-mr-1.5' : '-ml-1.5'
        } ${
          active
            ? 'text-[var(--gd-primary)] font-semibold bg-[var(--gd-primary-light)]/40 hover:bg-[var(--gd-primary-light)]/70'
            : 'text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-[var(--gd-hover)]'
        }`}
      >
        <span>{children}</span>
        {active ? (
          <span className="shrink-0 transition-transform duration-200" aria-hidden="true">
            {direction === 'asc' ? (
              <svg className="h-3.5 w-3.5 text-[var(--gd-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            ) : (
              <svg className="h-3.5 w-3.5 text-[var(--gd-primary)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M19 12l-7 7-7-7" />
              </svg>
            )}
          </span>
        ) : (
          <span className="shrink-0 opacity-0 group-hover/sort:opacity-50 transition-opacity duration-150 text-[var(--gd-text-secondary)]" aria-hidden="true">
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
            </svg>
          </span>
        )}
      </button>

      {/* Modern Floating Tooltip */}
      <div
        role="tooltip"
        className={`pointer-events-none absolute top-full mt-1.5 z-40 hidden group-hover/sort:flex flex-col whitespace-nowrap rounded-md bg-zinc-900/95 dark:bg-zinc-800/95 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg border border-white/10 backdrop-blur-xs transition-opacity animate-in fade-in duration-150 ${
          align === 'right' ? 'right-0 items-end' : 'left-0 items-start'
        }`}
      >
        <span
          className={`absolute -top-1 h-2 w-2 rotate-45 bg-zinc-900/95 dark:bg-zinc-800/95 border-t border-l border-white/10 ${
            align === 'right' ? 'right-3.5' : 'left-3.5'
          }`}
        />
        <span className="relative z-10">{tooltipText}</span>
      </div>
    </div>
  );
}
