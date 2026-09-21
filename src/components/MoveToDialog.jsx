import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../context/I18nContext';
import {
  buildSuggestedFolders,
  folderDisplayName,
  isExcludedMoveFolder,
  isInvalidMoveDestination,
  joinFolderPath,
} from '../utils/moveTargets';
import { IconChevronRight, IconFolder, IconSearch } from './DriveIcons';

const vaultApi = window.televault?.vault;

export function MoveToDialog({
  title,
  currentFolder,
  currentLocationLabel,
  folders,
  sourceFolders,
  onCancel,
  onConfirm,
}) {
  const { t } = useI18n();
  const [tab, setTab] = useState('suggested');
  const [query, setQuery] = useState('');
  const [browsePath, setBrowsePath] = useState('/');
  const [childFolders, setChildFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (tab !== 'all' || query.trim()) return undefined;
    let cancelled = false;

    async function loadChildren() {
      setLoading(true);
      try {
        const result = await vaultApi?.getListing(browsePath, 'name', 'asc');
        if (cancelled || !result?.ok || !Array.isArray(result?.folders)) {
          if (!cancelled) setChildFolders([]);
          return;
        }
        const next = result.folders
          .map((item) => joinFolderPath(browsePath, item))
          .filter((path) => Boolean(path) && !isExcludedMoveFolder(path, sourceFolders));
        if (!cancelled) setChildFolders(next);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadChildren();
    return () => {
      cancelled = true;
    };
  }, [tab, browsePath, query, sourceFolders]);

  const suggestedRows = useMemo(
    () =>
      buildSuggestedFolders(folders, sourceFolders, currentFolder).map((path) => ({
        path,
        name: folderDisplayName(path, t('myDrive')),
      })),
    [folders, sourceFolders, currentFolder, t],
  );

  const searchRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return folders
      .filter((path) => {
        if (isExcludedMoveFolder(path, sourceFolders)) return false;
        const name = folderDisplayName(path, t('myDrive')).toLowerCase();
        return path.toLowerCase().includes(q) || name.includes(q);
      })
      .map((path) => ({
        path,
        name: folderDisplayName(path, t('myDrive')),
      }));
  }, [folders, query, sourceFolders, t]);

  const browseRows = useMemo(
    () =>
      childFolders.map((path) => ({
        path,
        name: folderDisplayName(path, t('myDrive')),
      })),
    [childFolders, t],
  );

  const rows = query.trim() ? searchRows : tab === 'suggested' ? suggestedRows : browseRows;
  const disabled = isInvalidMoveDestination(selectedPath, currentFolder, sourceFolders);
  const selectedLabel = selectedPath
    ? folderDisplayName(selectedPath, t('myDrive')) === t('myDrive')
      ? t('myDrive')
      : selectedPath
    : t('moveDialogSelectHint');

  function openFolder(path) {
    setTab('all');
    setQuery('');
    setBrowsePath(path);
    if (!isExcludedMoveFolder(path, sourceFolders)) {
      setSelectedPath(path);
    } else {
      setSelectedPath(null);
    }
  }

  function selectFolder(path) {
    if (isExcludedMoveFolder(path, sourceFolders)) return;
    setSelectedPath(path);
  }

  return createPortal(
    <div className="gd-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="gd-move-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="gd-move-title">{title}</h2>

        <div className="gd-move-current">
          <span className="gd-move-current-label">{t('moveDialogCurrentLocation')}</span>
          <span className="gd-move-current-chip">
            <IconFolder className="h-5 w-5 shrink-0" />
            <span className="truncate">{currentLocationLabel}</span>
          </span>
        </div>

        <div className="gd-move-tabs">
          <button
            type="button"
            className={`gd-move-tab ${tab === 'suggested' && !query.trim() ? 'active' : ''}`}
            onClick={() => {
              setTab('suggested');
              setQuery('');
            }}
          >
            {t('moveDialogTabSuggested')}
          </button>
          <button
            type="button"
            className={`gd-move-tab ${tab === 'all' && !query.trim() ? 'active' : ''}`}
            onClick={() => {
              setTab('all');
              setQuery('');
              setBrowsePath('/');
              setSelectedPath(null);
            }}
          >
            {t('moveDialogTabAll')}
          </button>
          <label className="gd-move-search-inline">
            <IconSearch className="h-5 w-5 shrink-0 text-[var(--gd-text-secondary)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelectedPath(null);
              }}
              placeholder={t('moveDialogSearch')}
              className="w-full bg-transparent text-sm text-[var(--gd-text)] outline-none placeholder:text-[var(--gd-text-secondary)]"
            />
          </label>
        </div>

        {tab === 'all' && !query.trim() && browsePath !== '/' && (
          <div className="gd-move-breadcrumb">
            <button type="button" className="gd-move-breadcrumb-btn" onClick={() => openFolder('/')}>
              {t('myDrive')}
            </button>
            {browsePath
              .split('/')
              .filter(Boolean)
              .map((part, index, parts) => {
                const path = `/${parts.slice(0, index + 1).join('/')}/`;
                return (
                  <span key={path} className="gd-move-breadcrumb-part">
                    <IconChevronRight className="h-4 w-4 shrink-0 text-[var(--gd-text-secondary)]" />
                    <button type="button" className="gd-move-breadcrumb-btn" onClick={() => openFolder(path)}>
                      {part}
                    </button>
                  </span>
                );
              })}
          </div>
        )}

        <div className="gd-move-list" role="listbox" aria-label={t('moveTo')}>
          {loading && !query.trim() && tab === 'all' ? (
            <div className="gd-move-empty">{t('loading')}</div>
          ) : (
            <>
              {tab === 'all' && !query.trim() && (
                <div className={`gd-move-row-wrap ${selectedPath === browsePath ? 'selected' : ''}`}>
                  <button type="button" className="gd-move-row-main" onClick={() => selectFolder(browsePath)}>
                    <IconFolder className="h-5 w-5 shrink-0" />
                    <span className="truncate">{folderDisplayName(browsePath, t('myDrive'))}</span>
                  </button>
                </div>
              )}
              {rows.map((row) => {
              const selected = selectedPath === row.path;
              const canOpen = tab === 'all' && !query.trim();
              return (
                <div key={row.path} className={`gd-move-row-wrap ${selected ? 'selected' : ''}`}>
                  <button
                    type="button"
                    className="gd-move-row-main"
                    onClick={() => selectFolder(row.path)}
                    onDoubleClick={canOpen ? () => openFolder(row.path) : undefined}
                  >
                    <IconFolder className="h-5 w-5 shrink-0" />
                    <span className="truncate">{row.name}</span>
                  </button>
                  {canOpen && (
                    <button
                      type="button"
                      className="gd-move-row-open"
                      aria-label={t('open')}
                      onClick={() => openFolder(row.path)}
                    >
                      <IconChevronRight className="h-5 w-5" />
                    </button>
                  )}
                </div>
              );
            })}
            </>
          )}
          {!loading && rows.length === 0 && !(tab === 'all' && !query.trim()) && (
            <div className="gd-move-empty">{t('emptySearch')}</div>
          )}
        </div>

        <div className="gd-move-footer">
          <div className="gd-move-selected-path">{selectedLabel}</div>
          <div className="gd-dialog-actions">
            <button type="button" className="gd-dialog-btn" disabled={submitting} onClick={onCancel}>
              {t('cancel')}
            </button>
            <button
              type="button"
              className="gd-dialog-btn gd-dialog-btn--primary"
              disabled={disabled || submitting}
              onClick={async () => {
                if (!selectedPath || disabled || submitting) return;
                setSubmitting(true);
                try {
                  await onConfirm(selectedPath);
                } finally {
                  setSubmitting(false);
                }
              }}
            >
              {submitting ? (
                <span className="flex items-center gap-1.5">
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>{t('moving')}</span>
                </span>
              ) : (
                t('move')
              )}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
