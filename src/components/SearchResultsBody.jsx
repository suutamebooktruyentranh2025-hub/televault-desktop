import { useState } from 'react';
import { formatDate, formatSize } from '../utils/format';
import { useI18n } from '../context/I18nContext';
import { RowQuickActions } from './BrowserScreen';
import { ContextMenu } from './ContextMenu';
import {
  fileTypeIcon,
  IconDownload,
  IconRename,
  IconMoveTo,
  IconTrash,
  IconOpen,
  IconPreview,
  IconSaveAs,
  IconMoreVert,
} from './DriveIcons';

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']);

function openMenu(setMenu, e, items, anchor = null) {
  setMenu({
    x: e.clientX,
    y: e.clientY,
    anchor,
    items,
  });
}

export function SearchResultsBody({
  files,
  loading,
  selectedIds,
  onToggleSelect,
  onOpenFile,
  onApplyItemSelection,
  onDownload,
  onRenameFile,
  onMoveFile,
  onTrashFile,
  onSaveAs,
  onPreview,
  viewMode = 'list',
}) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(null);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--gd-text-secondary)]">
        {t('loading')}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-[var(--gd-text-secondary)]">
        {t('emptySearch')}
      </div>
    );
  }

  const orderedKeys = files.map((file) => `file:${file.messageId}`);

  function handleItemMouseDown(e) {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  }

  function handleItemClick(e, key) {
    const additive = e.ctrlKey || e.metaKey;
    const range = e.shiftKey;
    const modifiers = { additive, range };

    if (additive || range) {
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      onApplyItemSelection?.(key, modifiers, orderedKeys);
      return;
    }

    onApplyItemSelection?.(key, { additive: false, range: false }, orderedKeys);
  }

  function showFileMenu(e, file, anchor = null) {
    e.preventDefault();
    e.stopPropagation();
    const items = [
      {
        label: t('download'),
        icon: <IconDownload className="h-5 w-5" />,
        action: () => onDownload?.(file),
      },
      {
        label: t('rename'),
        icon: <IconRename className="h-5 w-5" />,
        action: () => onRenameFile?.(file),
      },
      {
        label: t('move'),
        icon: <IconMoveTo className="h-5 w-5" />,
        action: () => onMoveFile?.(file),
      },
      {
        label: t('trash'),
        icon: <IconTrash className="h-5 w-5" />,
        action: () => onTrashFile?.(file),
        danger: true,
      },
    ];
    openMenu(setMenu, e, items, anchor);
  }

  function handleOpenFolder(file) {
    const vaultDir = file.path.substring(0, file.path.lastIndexOf('/'));
    window.dispatchEvent(new CustomEvent('gd-navigate', { detail: vaultDir + '/' }));
  }

  return (
    <div className={`min-h-0 flex-1 overflow-auto ${viewMode === 'grid' ? '' : 'px-2 pb-4'} ${selectedIds.size > 0 ? 'gd-list-has-selection' : ''}`}>
      {viewMode === 'grid' ? (
        <div className="gd-grid flex-1 overflow-auto px-6 pt-4 pb-6">
          {files.map((file) => {
            const selected = selectedIds.has(file.messageId);
            const ext = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
            const isImage = IMAGE_EXT.has(ext || '');
            const thumbSrc = isImage && file.localPath ? `file://${file.localPath}` : null;
            return (
              <div
                id={`vault-file-${file.messageId}`}
                key={file.messageId}
                role="button"
                tabIndex={0}
                className={`gd-grid-file ${selected ? 'selected' : ''}`}
                onMouseDown={handleItemMouseDown}
                onClick={(e) => handleItemClick(e, `file:${file.messageId}`)}
                onDoubleClick={() => onOpenFile?.(file)}
                onContextMenu={(e) => showFileMenu(e, file)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleItemClick(e, `file:${file.messageId}`);
                  }
                }}
              >
                <div className="gd-grid-file-header">
                  {fileTypeIcon(file.name, 'h-5 w-5 shrink-0')}
                  <span
                    className={`min-w-0 flex-1 truncate text-sm ${selected ? 'font-medium text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'}`}
                  >
                    {file.name}
                  </span>
                  <button
                    type="button"
                    className="gd-grid-menu"
                    aria-label={t('moreActions')}
                    onClick={(e) => {
                      e.stopPropagation();
                      showFileMenu(e, file, e.currentTarget);
                    }}
                  >
                    <IconMoreVert className="h-5 w-5" />
                  </button>
                </div>
                {thumbSrc ? (
                  <div className="gd-grid-file-preview">
                    <img src={thumbSrc} alt="" loading="lazy" />
                  </div>
                ) : (
                  <div className="gd-grid-file-preview gd-grid-file-preview--placeholder">
                    {fileTypeIcon(file.name, 'h-12 w-12 opacity-80')}
                  </div>
                )}
                <div className="flex items-center justify-between px-3 py-1.5 text-[11px] text-[var(--gd-text-secondary)] border-t border-[var(--gd-border)] bg-[var(--gd-surface)]">
                  <span className="truncate">{file.path}</span>
                  <span className="shrink-0 ml-2">{formatSize(file.size)}</span>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--gd-border)] text-left text-xs font-medium text-[var(--gd-text-secondary)]">
              <th className="w-12 px-3 py-2" />
              <th className="px-3 py-2">{t('colName')}</th>
              <th className="hidden w-52 px-3 py-2 md:table-cell whitespace-nowrap">{t('colModified')}</th>
              <th className="hidden w-28 px-3 py-2 sm:table-cell whitespace-nowrap">{t('colSize')}</th>
              <th className="w-48 px-2 py-2" aria-hidden />
            </tr>
          </thead>
          <tbody>
            {files.map((file) => {
              const selected = selectedIds.has(file.messageId);
              return (
                <tr
                  key={file.messageId}
                  className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${selected ? 'selected' : ''}`}
                  onMouseDown={handleItemMouseDown}
                  onClick={(e) => handleItemClick(e, `file:${file.messageId}`)}
                  onDoubleClick={() => onOpenFile?.(file)}
                  onContextMenu={(e) => showFileMenu(e, file)}
                >
                  <td className="w-12 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="gd-row-checkbox"
                      checked={selected}
                      onChange={() => onToggleSelect?.(file.messageId)}
                    />
                  </td>
                  <td className="px-3 py-2.5 min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      {fileTypeIcon(file.name, 'h-6 w-6 shrink-0')}
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-normal text-[var(--gd-text)]">{file.name}</div>
                        <div className="truncate text-xs text-[var(--gd-text-secondary)]">{file.path}</div>
                        {file.tags?.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {file.tags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-[var(--gd-primary-light)] px-2 py-0.5 text-xs text-[var(--gd-primary)]"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden w-52 px-3 py-2.5 text-[var(--gd-text-secondary)] md:table-cell whitespace-nowrap">
                    {formatDate(file.mtime)}
                  </td>
                  <td className="hidden w-28 px-3 py-2.5 text-[var(--gd-text-secondary)] sm:table-cell whitespace-nowrap">
                    {formatSize(file.size)}
                  </td>
                  <td className="w-48 px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <RowQuickActions
                      onOpenFolder={() => handleOpenFolder(file)}
                      onDownload={() => onDownload?.(file)}
                      onRename={() => onRenameFile?.(file)}
                      onMore={(e) => showFileMenu(e, file, e.currentTarget)}
                      showDownload={true}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          anchor={menu.anchor}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}
