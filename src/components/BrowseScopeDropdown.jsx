import React, { useState, useRef, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';

export function BrowseScopeDropdown({ scope = 'folders', onSelectScope }) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
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
  }, []);

  const options = [
    {
      id: 'folders',
      label: t('scopeFolders'),
      hint: t('scopeFoldersHint'),
      icon: (
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
      ),
    },
    {
      id: 'stories',
      label: t('scopeStories'),
      hint: t('scopeStoriesHint'),
      icon: (
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      ),
    },
    {
      id: 'files',
      label: t('scopeFiles'),
      hint: t('scopeFilesHint'),
      icon: (
        <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      ),
    },
  ];

  const currentOption = options.find((o) => o.id === scope) || options[0];
  const isCustomScope = scope !== 'folders';

  return (
    <div className="relative inline-block group/scope" ref={dropdownRef}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors cursor-pointer select-none ${
          isCustomScope
            ? 'border-[var(--gd-primary)] bg-[var(--gd-primary-light)] text-[var(--gd-primary)] font-semibold shadow-xs'
            : 'border-[var(--gd-border)] text-[var(--gd-text-secondary)] hover:border-[var(--gd-primary)] hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)]'
        }`}
      >
        {currentOption.icon}
        <span>{currentOption.label}</span>
        <svg
          className={`h-3 w-3 shrink-0 opacity-70 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Modern Floating Dark Tooltip on hover (hidden when menu open) */}
      {!isOpen && (
        <div
          role="tooltip"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-40 hidden group-hover/scope:flex flex-col items-center whitespace-nowrap rounded-md bg-zinc-900/95 dark:bg-zinc-800/95 px-2.5 py-1 text-[11px] font-medium text-white shadow-lg border border-white/10 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
        >
          <span className="absolute -top-1 left-1/2 -translate-x-1/2 h-2 w-2 rotate-45 bg-zinc-900/95 dark:bg-zinc-800/95 border-t border-l border-white/10" />
          <span className="relative z-10">{t('scopeDropdownTooltip')}</span>
        </div>
      )}

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div
          className="absolute left-0 top-full mt-1.5 w-64 rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface-elevated)] p-1.5 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[var(--gd-text-secondary)] border-b border-[var(--gd-border)]/50 mb-1">
            {t('scopeDropdownTitle')}
          </div>
          <div className="space-y-0.5">
            {options.map((opt) => {
              const isSelected = opt.id === scope;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    onSelectScope(opt.id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)] font-semibold'
                      : 'hover:bg-[var(--gd-hover)] text-[var(--gd-text)]'
                  }`}
                >
                  <span className={`mt-0.5 ${isSelected ? 'text-[var(--gd-primary)]' : 'text-[var(--gd-text-secondary)]'}`}>
                    {opt.icon}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs leading-tight flex items-center justify-between">
                      <span>{opt.label}</span>
                      {isSelected && (
                        <span className="text-[var(--gd-primary)] text-xs">✓</span>
                      )}
                    </div>
                    <div className="text-[10px] text-[var(--gd-text-secondary)] font-normal leading-normal mt-0.5 truncate">
                      {opt.hint}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
