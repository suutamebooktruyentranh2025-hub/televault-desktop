import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../context/I18nContext';
import { IconFolder, IconFile, IconClose, IconChevronRight } from './DriveIcons';

export function GDriveFilePicker({ onConfirm, onCancel }) {
  const { t } = useI18n();
  const [currentFolderId, setCurrentFolderId] = useState('root');
  const [breadcrumbs, setBreadcrumbs] = useState([{ id: 'root', name: 'My Drive' }]);
  const [items, setItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState({}); // key: id, value: { id, name, isFolder }
  const [baseVaultPath, setBaseVaultPath] = useState('/GDrive');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadFolder = useCallback(async (folderId) => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.televault.gdrive.listFolder(folderId);
      if (result.ok) {
        setItems(result.files || []);
      } else {
        setError(result.error || 'Failed to load Google Drive folder');
      }
    } catch (err) {
      setError(err.message || 'An error occurred while loading folders');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFolder(currentFolderId);
  }, [currentFolderId, loadFolder]);

  function handleNavigate(folder) {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => {
      const idx = prev.findIndex((b) => b.id === folder.id);
      if (idx !== -1) {
        return prev.slice(0, idx + 1);
      }
      return [...prev, { id: folder.id, name: folder.name }];
    });
  }

  function handleBreadcrumbClick(idx) {
    const target = breadcrumbs[idx];
    setCurrentFolderId(target.id);
    setBreadcrumbs(breadcrumbs.slice(0, idx + 1));
  }

  function handleToggleSelect(item) {
    setSelectedItems((prev) => {
      const next = { ...prev };
      if (next[item.id]) {
        delete next[item.id];
      } else {
        next[item.id] = {
          id: item.id,
          name: item.name,
          isFolder: item.isFolder,
        };
      }
      return next;
    });
  }

  function handleConfirm() {
    let base = baseVaultPath.trim() || '/GDrive';
    if (!base.startsWith('/')) base = '/' + base;
    if (base.endsWith('/')) base = base.slice(0, -1);

    const selectedList = Object.values(selectedItems).map((item) => {
      const vaultPath = item.isFolder
        ? `${base}/${item.name}/`
        : `${base}/${item.name}`;
      return {
        driveId: item.id,
        drivePath: item.name,
        vaultPath,
        isFolder: item.isFolder,
      };
    });
    onConfirm(selectedList);
  }

  return createPortal(
    <div className="gd-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="gd-dialog gd-gdrive-picker"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="gd-gdrive-picker-header">
          <h3 className="gd-gdrive-picker-title">{t('gdrivePickerTitle')}</h3>
          <button type="button" className="gd-gdrive-picker-close" onClick={onCancel} aria-label={t('close')}>
            <IconClose className="h-5 w-5" />
          </button>
        </div>

        {/* Destination Vault Path Config */}
        <div className="px-5 py-3 border-b border-gray-100 dark:border-zinc-800 flex items-center gap-3">
          <label className="text-xs font-semibold whitespace-nowrap opacity-80 text-[var(--gd-text)]">
            {t('saveToVault')}
          </label>
          <input
            type="text"
            className="flex-1 h-8 px-3 text-xs border border-gray-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 rounded outline-none focus:border-[var(--gd-primary)] transition-colors text-[var(--gd-text)]"
            value={baseVaultPath}
            onChange={(e) => setBaseVaultPath(e.target.value)}
            placeholder="/GDrive"
          />
        </div>

        {/* Tab selection for My Drive vs Shared with me (only at root) */}
        {breadcrumbs.length === 1 && (
          <div className="flex border-b border-gray-100 dark:border-zinc-800 bg-gray-50/50 dark:bg-zinc-900/10 px-5">
            <button
              type="button"
              className={`py-3 px-4 border-b-2 font-medium text-xs cursor-pointer outline-none transition-all ${
                currentFolderId === 'root'
                  ? 'border-[#0066cc] text-[#0066cc]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => {
                setCurrentFolderId('root');
                setBreadcrumbs([{ id: 'root', name: 'My Drive' }]);
              }}
            >
              {t('myDrive')}
            </button>
            <button
              type="button"
              className={`py-3 px-4 border-b-2 font-medium text-xs cursor-pointer outline-none transition-all ${
                currentFolderId === 'sharedWithMe'
                  ? 'border-[#0066cc] text-[#0066cc]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
              onClick={() => {
                setCurrentFolderId('sharedWithMe');
                setBreadcrumbs([{ id: 'sharedWithMe', name: 'Shared with me' }]);
              }}
            >
              {t('gdriveSharedWithMe')}
            </button>
          </div>
        )}

        {/* Breadcrumbs */}
        <div className="gd-gdrive-picker-breadcrumb">
          {breadcrumbs.map((crumb, idx) => (
            <span key={crumb.id} className="flex items-center">
              {idx > 0 && <IconChevronRight className="h-4 w-4 mx-1 opacity-50" />}
              <button
                type="button"
                className={`hover:underline ${idx === breadcrumbs.length - 1 ? 'font-medium opacity-100' : 'opacity-70'}`}
                onClick={() => handleBreadcrumbClick(idx)}
              >
                {crumb.id === 'root' ? t('myDrive') : (crumb.id === 'sharedWithMe' ? t('gdriveSharedWithMe') : crumb.name)}
              </button>
            </span>
          ))}
        </div>

        {/* Files/Folders List */}
        <div className="gd-gdrive-picker-body">
          {loading ? (
            <div className="gd-gdrive-picker-loading">{t('loading')}...</div>
          ) : error ? (
            <div className="gd-gdrive-picker-error">{error}</div>
          ) : items.length === 0 ? (
            <div className="gd-gdrive-picker-empty">{t('folderEmpty')}</div>
          ) : (
            <div className="gd-gdrive-picker-list">
              {items.map((item) => {
                const isSelected = Boolean(selectedItems[item.id]);
                return (
                  <div key={item.id} className="gd-gdrive-picker-item">
                    <label className="flex items-center flex-1 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelect(item)}
                        className="mr-3 h-4 w-4 rounded border-gray-300 text-[#0066cc] focus:ring-[#0066cc]"
                      />
                      <span className="mr-2">
                        {item.isFolder ? (
                          <IconFolder className="h-5 w-5 text-yellow-500 fill-current" />
                        ) : (
                          <IconFile className="h-5 w-5 text-gray-500" />
                        )}
                      </span>
                      <span className="font-normal truncate text-sm flex-1">{item.name}</span>
                    </label>

                    {item.isFolder && (
                      <button
                        type="button"
                        className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded ml-2"
                        onClick={() => handleNavigate(item)}
                        title={t('open')}
                      >
                        <IconChevronRight className="h-5 w-5 opacity-60" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="gd-gdrive-picker-actions">
          <button type="button" className="gd-dialog-btn" onClick={onCancel}>
            {t('gdrivePickerCancel')}
          </button>
          <button
            type="button"
            className="gd-dialog-btn gd-dialog-btn--primary"
            onClick={handleConfirm}
            disabled={Object.keys(selectedItems).length === 0}
          >
            {t('gdrivePickerConfirm')} ({Object.keys(selectedItems).length})
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
