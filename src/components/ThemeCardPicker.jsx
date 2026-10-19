import { useTheme } from '../context/ThemeContext';
import { useI18n } from '../context/I18nContext';

export function ThemeCardPicker() {
  const { presetTheme, setPresetTheme, availableThemes = [], darkMode, setTheme } = useTheme();
  const { t } = useI18n();

  const handleSelectTheme = (theme) => {
    setPresetTheme(theme.id);
    if (theme.mode && theme.mode !== (darkMode ? 'dark' : 'light')) {
      setTheme(theme.mode);
    }
  };

  return (
    <div className="pt-1">
      {/* 12 Theme Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
        {availableThemes.map((theme) => {
          const isSelected = presetTheme === theme.id;
          const currentSwatches =
            theme.swatches?.[darkMode ? 'dark' : 'light'] ||
            theme.swatches?.light ||
            [];

          return (
            <button
              key={theme.id}
              type="button"
              data-testid={`theme-card-${theme.id}`}
              onClick={() => handleSelectTheme(theme)}
              className={`relative flex flex-col justify-between min-w-0 w-full p-3.5 rounded-2xl border text-left cursor-pointer transition-all duration-150 select-none overflow-hidden ${
                isSelected
                  ? 'border-[var(--gd-primary)] ring-2 ring-[var(--gd-primary)]/30 bg-[var(--gd-primary)]/10 shadow-xs'
                  : 'border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-hover)] hover:border-[var(--gd-border)]'
              }`}
              aria-pressed={isSelected}
            >
              {/* Header row: Color swatches & Active check badge */}
              <div className="flex items-center justify-between gap-2 mb-2 w-full min-w-0">
                <div className="flex items-center -space-x-1.5 p-1 rounded-full bg-[var(--gd-surface-elevated)] border border-[var(--gd-border)] shadow-2xs shrink-0">
                  {currentSwatches.map((color, idx) => (
                    <span
                      key={idx}
                      className="w-3.5 h-3.5 rounded-full border border-black/10 dark:border-white/10 shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>

                {isSelected ? (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-[var(--gd-primary)] text-white shrink-0 shadow-2xs">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </span>
                ) : (
                  <span className="w-5 h-5 rounded-full border border-[var(--gd-border)] shrink-0" />
                )}
              </div>

              {/* Title and description */}
              <div className="w-full min-w-0 flex-1 flex flex-col justify-start">
                <div
                  className={`text-sm font-semibold tracking-tight truncate w-full ${
                    isSelected ? 'text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'
                  }`}
                  title={t(theme.nameKey) || theme.id}
                >
                  {t(theme.nameKey) || theme.id}
                </div>
                <div
                  className="text-[11px] text-[var(--gd-text-secondary)] line-clamp-2 leading-relaxed mt-0.5 break-words w-full"
                  title={t(theme.descKey) || ''}
                >
                  {t(theme.descKey) || ''}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default ThemeCardPicker;
