import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';
import { IconLabel } from './DriveIcons';

export function TagSelectDropdown({ tagFilter, onCreateTag }) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef(null);

  const tagNames = tagFilter?.tagNames || [];
  const activeTags = tagFilter?.activeTags || [];
  const foldersByTag = tagFilter?.foldersByTag || {};
  const activeCount = activeTags.length;

  useEffect(() => {
    if (!isOpen) {
      setSearch('');
      return undefined;
    }

    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('pointerdown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const filteredTags = search.trim()
    ? tagNames.filter((name) => name.toLowerCase().includes(search.trim().toLowerCase()))
    : tagNames;

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title={activeCount > 0 ? `${t('tagsTitle')}: ${activeTags.join(', ')}` : t('tagFilterSelect')}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${
          activeCount > 0
            ? 'border-[var(--gd-primary)] bg-[var(--gd-primary-light)] text-[var(--gd-primary)] font-semibold shadow-xs'
            : 'border-[var(--gd-border)] text-[var(--gd-text-secondary)] hover:border-[var(--gd-primary)] hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)]'
        }`}
      >
        <IconLabel className="h-4 w-4 shrink-0" />
        <span>{t('tagsTitle')}</span>
        {activeCount > 0 && (
          <span className="inline-flex items-center justify-center rounded-full bg-[var(--gd-primary)] text-white text-[10px] h-4 min-w-[16px] px-1 font-bold">
            {activeCount}
          </span>
        )}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform duration-150 ${isOpen ? 'rotate-180' : ''} opacity-60`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 min-w-[220px] max-w-[280px] rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-lg py-2 select-none">
          {/* Header */}
          <div className="flex items-center justify-between px-3 pb-2 border-b border-[var(--gd-border)]">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-[var(--gd-text)]">
              <IconLabel className="h-3.5 w-3.5 text-[var(--gd-primary)]" />
              <span>{t('tagFilterSelect')}</span>
            </div>
            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => tagFilter?.clearTags?.()}
                className="text-[11px] font-medium text-[var(--gd-primary)] hover:underline cursor-pointer"
              >
                {t('clearFilter')}
              </button>
            )}
          </div>

          {/* Search input if more than 5 tags */}
          {tagNames.length > 5 && (
            <div className="px-2 pt-2 pb-1">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('tagSearchPlaceholder')}
                className="w-full text-xs rounded-md bg-[var(--gd-surface-container)] border border-[var(--gd-border)] px-2.5 py-1 text-[var(--gd-text)] placeholder:text-[var(--gd-text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--gd-primary)]"
              />
            </div>
          )}

          {/* Tag items list */}
          <div className="max-h-56 overflow-y-auto px-1 py-1">
            {tagNames.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-[var(--gd-text-secondary)]">
                {t('tagsEmpty')}
              </div>
            ) : filteredTags.length === 0 ? (
              <div className="px-3 py-3 text-center text-xs text-[var(--gd-text-secondary)]">
                {t('tagNotFound')}
              </div>
            ) : (
              filteredTags.map((tag) => {
                const isSelected = activeTags.includes(tag);
                const count = foldersByTag[tag]?.length || 0;
                return (
                  <label
                    key={tag}
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-xs cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-[var(--gd-primary-light)]/70 text-[var(--gd-primary)]'
                        : 'hover:bg-[var(--gd-hover)] text-[var(--gd-text)]'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => tagFilter?.toggleTag?.(tag)}
                        className="rounded border-[var(--gd-border)] text-[var(--gd-primary)] focus:ring-[var(--gd-primary)] h-3.5 w-3.5 cursor-pointer accent-[var(--gd-primary)]"
                      />
                      <span className={`truncate ${isSelected ? 'font-semibold' : 'font-medium'}`} title={tag}>
                        {tag}
                      </span>
                    </div>
                    <span className="shrink-0 text-[10px] rounded-full bg-[var(--gd-surface-container)] px-1.5 py-0.5 text-[var(--gd-text-secondary)]">
                      {count}
                    </span>
                  </label>
                );
              })
            )}
          </div>

          {/* Create tag footer action if provided */}
          {onCreateTag && (
            <div className="border-t border-[var(--gd-border)] px-2 pt-1.5 mt-1">
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  onCreateTag();
                }}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg py-1 text-xs font-medium text-[var(--gd-primary)] hover:bg-[var(--gd-primary-light)] transition-colors cursor-pointer"
              >
                <span>+</span>
                <span>{t('addTags')}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
