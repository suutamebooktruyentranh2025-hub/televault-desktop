import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../context/I18nContext';
import {
  IconCheck,
  IconChevronDown,
  IconClose,
  IconFolder,
  IconLabel,
  IconSearch,
} from './DriveIcons';

const api = window.televault?.vault;

function FolderSelect2({
  folders,
  selectedFolder,
  onSelectFolder,
  t,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      // Auto-focus search input when opened
      const timer = setTimeout(() => searchInputRef.current?.focus(), 50);
      return () => {
        clearTimeout(timer);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open]);

  const filteredFolders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return folders;
    return folders.filter((f) => f.toLowerCase().includes(q));
  }, [folders, search]);

  const selectedName = selectedFolder
    ? selectedFolder.split('/').filter(Boolean).at(-1) || selectedFolder
    : '';

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger button (Select2 look) */}
      <button
        type="button"
        onClick={() => {
          setOpen((prev) => !prev);
          setSearch('');
        }}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-[var(--gd-surface)] px-3 py-2 text-sm transition-colors cursor-pointer select-none text-left ${
          open
            ? 'border-[var(--gd-primary)] ring-2 ring-[var(--gd-primary)]/20'
            : 'border-[var(--gd-border)] hover:border-[var(--gd-primary)]'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <IconFolder className="h-4 w-4 shrink-0 text-[var(--gd-primary)]" />
          <div className="min-w-0">
            <span className="block truncate font-medium text-[var(--gd-text)]">
              {selectedFolder ? `${selectedName}` : t('tagCreateFolder')}
            </span>
            {selectedFolder && (
              <span className="block truncate text-[10px] text-[var(--gd-text-secondary)]">
                {selectedFolder}
              </span>
            )}
          </div>
        </div>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--gd-text-secondary)] transition-transform duration-200 ${
            open ? 'rotate-180 text-[var(--gd-primary)]' : ''
          }`}
        />
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-50 flex flex-col rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-2xl overflow-hidden max-h-72">
          {/* Search box header */}
          <div className="flex items-center gap-2 border-b border-[var(--gd-border)] bg-[var(--gd-bg)] px-3 py-2">
            <IconSearch className="h-4 w-4 shrink-0 text-[var(--gd-text-secondary)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('moveDialogSearch')}
              className="w-full bg-transparent text-xs text-[var(--gd-text)] outline-none placeholder:text-[var(--gd-text-secondary)]"
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setOpen(false);
                } else if (e.key === 'Enter' && filteredFolders.length > 0) {
                  e.preventDefault();
                  onSelectFolder(filteredFolders[0]);
                  setOpen(false);
                }
              }}
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                className="text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] cursor-pointer"
              >
                <IconClose className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Results count header */}
          <div className="flex items-center justify-between border-b border-[var(--gd-border)]/60 bg-[var(--gd-bg)]/50 px-3 py-1 text-[10px] text-[var(--gd-text-secondary)]">
            <span>{t('tagFolderCount', { n: folders.length })}</span>
            {search && <span>{t('tagFolderMatched', { n: filteredFolders.length })}</span>}
          </div>

          {/* Scrollable list */}
          <div className="overflow-y-auto flex-1 divide-y divide-[var(--gd-border)]/40 py-0.5">
            {filteredFolders.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-[var(--gd-text-secondary)]">
                {t('searchNoResults')}
              </div>
            ) : (
              filteredFolders.map((f) => {
                const isSelected = f === selectedFolder;
                const name = f.split('/').filter(Boolean).at(-1) || f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      onSelectFolder(f);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[var(--gd-primary-light)] text-[var(--gd-primary)] font-medium'
                        : 'hover:bg-[var(--gd-hover)] text-[var(--gd-text)]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <IconFolder
                        className={`h-4 w-4 shrink-0 ${
                          isSelected ? 'text-[var(--gd-primary)]' : 'text-[var(--gd-text-secondary)]'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[var(--gd-text)]">
                          {name}
                        </div>
                        <div className="truncate text-[10px] text-[var(--gd-text-secondary)] opacity-75">
                          {f}
                        </div>
                      </div>
                    </div>
                    {isSelected && (
                      <IconCheck className="h-4 w-4 shrink-0 text-[var(--gd-primary)]" />
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CreateTagDialog({
  initialFolder = '',
  onCancel,
  onSave,
}) {
  const { t } = useI18n();
  const [tagName, setTagName] = useState('');
  const [selectedFolder, setSelectedFolder] = useState(initialFolder || '');
  const [folders, setFolders] = useState([]);
  const [loadingFolders, setLoadingFolders] = useState(true);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();

    async function loadFolders() {
      try {
        const res = await api?.allFolders?.();
        if (res?.ok && Array.isArray(res.folders)) {
          const list = res.folders.filter(Boolean);
          setFolders(list);
          if (!selectedFolder && list.length > 0) {
            setSelectedFolder(
              initialFolder && list.includes(initialFolder)
                ? initialFolder
                : list[0],
            );
          }
        }
      } finally {
        setLoadingFolders(false);
      }
    }

    void loadFolders();
  }, [initialFolder, selectedFolder]);

  async function handleFormSubmit(e) {
    e?.preventDefault();
    const cleanTag = tagName.trim();
    if (!cleanTag || !selectedFolder) return;

    setSaving(true);
    try {
      const ok = await onSave(cleanTag, selectedFolder);
      if (ok !== false) onCancel();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="gd-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="gd-dialog min-w-[360px] max-w-[460px]"
        role="dialog"
        aria-modal="true"
        aria-label={t('tagCreateTitle')}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 mb-3">
          <IconLabel className="h-5 w-5 text-[var(--gd-primary)]" />
          <h2 className="text-base font-semibold text-[var(--gd-text)]">
            {t('tagCreateTitle')}
          </h2>
        </div>

        <form onSubmit={(e) => void handleFormSubmit(e)} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--gd-text-secondary)] mb-1">
              {t('tagCreateName')}
            </label>
            <input
              ref={inputRef}
              type="text"
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder={t('tagCreateNamePlaceholder')}
              className="gd-dialog-input w-full"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--gd-text-secondary)] mb-1">
              {t('tagCreateFolder')}
            </label>
            {loadingFolders ? (
              <div className="text-xs text-[var(--gd-text-secondary)] py-2">
                {t('loading')}
              </div>
            ) : folders.length === 0 ? (
              <p className="text-xs text-amber-600 dark:text-amber-400 py-1">
                {t('tagCreateNoFolders')}
              </p>
            ) : (
              <FolderSelect2
                folders={folders}
                selectedFolder={selectedFolder}
                onSelectFolder={setSelectedFolder}
                t={t}
              />
            )}
          </div>

          <div className="gd-dialog-actions pt-2">
            <button
              type="button"
              className="gd-dialog-btn"
              onClick={onCancel}
              disabled={saving}
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="gd-dialog-btn gd-dialog-btn--primary"
              disabled={saving || !tagName.trim() || !selectedFolder}
            >
              {t('tagCreateAction')}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
