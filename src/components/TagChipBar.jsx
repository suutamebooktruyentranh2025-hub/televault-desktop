import { useState } from 'react';
import { IconAdd, IconClose, IconLabel, IconRename, IconTrash } from './DriveIcons';
import { ContextMenu } from './ContextMenu';
import { useI18n } from '../context/I18nContext';

export function TagChipBar({
  tagNames = [],
  activeTags = [],
  activeTag = null,
  onToggleTag,
  foldersByTag = {},
  onClearTags,
  onCreateTag,
  onRenameTag,
  onDeleteTag,
}) {
  const { t } = useI18n();
  const [contextMenu, setContextMenu] = useState(null);

  if (!tagNames || tagNames.length === 0) return null;

  // Backwards-compatible resolution for active list
  const selectedTags =
    Array.isArray(activeTags) && activeTags.length > 0
      ? activeTags
      : activeTag
      ? [activeTag]
      : [];

  const handleChipContextMenu = (e, tag) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      tag,
    });
  };

  const menuItems = contextMenu
    ? [
        {
          label: t('tagRename'),
          icon: <IconRename className="h-4 w-4" />,
          action: () => onRenameTag?.(contextMenu.tag),
        },
        {
          label: t('tagDelete'),
          icon: <IconTrash className="h-4 w-4" />,
          danger: true,
          action: () => onDeleteTag?.(contextMenu.tag),
        },
      ]
    : [];

  return (
    <div className="gd-tag-chip-bar flex items-center gap-1.5 overflow-x-auto px-4 py-2 border-b border-[var(--gd-border)] bg-[var(--gd-bg)]">
      <IconLabel className="h-4 w-4 shrink-0 text-[var(--gd-text-secondary)]" />

      {tagNames.map((tag) => {
        const isActive = selectedTags.includes(tag);
        const count = foldersByTag[tag]?.length || 0;
        return (
          <button
            key={tag}
            type="button"
            onClick={() => onToggleTag?.(tag)}
            onContextMenu={(e) => handleChipContextMenu(e, tag)}
            className={`shrink-0 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer select-none ${
              isActive
                ? 'border-[var(--gd-primary)] bg-[var(--gd-primary-light)] text-[var(--gd-primary)] font-semibold shadow-xs'
                : 'border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text-secondary)] hover:border-[var(--gd-primary)] hover:text-[var(--gd-primary)]'
            }`}
            title={t('tagChipTooltip', { tag, count })}
          >
            <span className="truncate max-w-[130px]">{tag}</span>
            <span
              className={`text-[10px] ${
                isActive
                  ? 'text-[var(--gd-primary)]'
                  : 'text-[var(--gd-text-secondary)] opacity-60'
              }`}
            >
              {count}
            </span>
          </button>
        );
      })}

      {(selectedTags.length > 0 || onCreateTag) && (
        <div className="h-3.5 w-px bg-[var(--gd-border)] shrink-0 self-center mx-0.5" />
      )}

      {selectedTags.length > 0 && onClearTags && (
        <button
          type="button"
          onClick={onClearTags}
          className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full border border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 text-red-500 dark:text-red-400 hover:bg-red-100 hover:border-red-300 hover:text-red-600 dark:hover:bg-red-900/50 dark:hover:border-red-700 transition-all cursor-pointer select-none"
          title={t('clearAllTags')}
          aria-label={t('clearAllTags')}
        >
          <IconClose className="h-3.5 w-3.5" />
        </button>
      )}

      {onCreateTag && (
        <button
          type="button"
          onClick={onCreateTag}
          className="shrink-0 inline-flex items-center justify-center h-6 w-6 rounded-full border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text-secondary)] hover:border-[var(--gd-primary)] hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-primary)] transition-all cursor-pointer select-none"
          title={t('tagCreateTitle')}
          aria-label={t('tagCreateTitle')}
        >
          <IconAdd className="h-3.5 w-3.5" />
        </button>
      )}

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={menuItems}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
