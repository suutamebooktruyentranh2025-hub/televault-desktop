import { useI18n } from '../../context/I18nContext';

export function UpdateBadge({ updateInfo, onOpenModal, onDismiss }) {
  const { t } = useI18n();

  if (!updateInfo?.hasUpdate) return null;

  return (
    <div className="relative group inline-flex items-center">
      <button
        type="button"
        onClick={onOpenModal}
        className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs font-semibold rounded-full bg-gradient-to-r from-emerald-500/15 via-teal-500/15 to-emerald-500/15 hover:from-emerald-500/25 hover:to-teal-500/25 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 dark:border-emerald-500/40 shadow-xs hover:shadow-sm transition-all duration-200 cursor-pointer"
        aria-label={t('updateBadgeNewVersionTitle', { version: updateInfo.latestVersion })}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <svg
          className="h-3.5 w-3.5 shrink-0"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 19V5" />
          <path d="M5 12l7-7 7 7" />
        </svg>
        <span>v{updateInfo.latestVersion}</span>

        {onDismiss && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                onDismiss();
              }
            }}
            className="p-0.5 ml-0.5 rounded-full hover:bg-emerald-500/20 text-emerald-600/70 dark:text-emerald-400/70 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            title={t('updateBadgeDismissTitle')}
            aria-label={t('updateBadgeDismissTitle')}
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </span>
        )}
      </button>

      {/* Floating Dark Bubble Tooltip */}
      <div className="pointer-events-none absolute right-0 top-full mt-2 hidden group-hover:flex items-center z-50 animate-in fade-in zoom-in-95 duration-150">
        <div className="relative bg-zinc-900/95 dark:bg-zinc-800/95 backdrop-blur-xs text-white text-[11px] leading-tight font-normal px-2.5 py-1.5 rounded-md shadow-lg border border-white/10 whitespace-nowrap">
          {t('updateBadgeNewVersionTitle', { version: updateInfo.latestVersion })}
          <div className="absolute -top-1 right-6 w-2 h-2 bg-zinc-900/95 dark:bg-zinc-800/95 border-t border-l border-white/10 rotate-45" />
        </div>
      </div>
    </div>
  );
}
