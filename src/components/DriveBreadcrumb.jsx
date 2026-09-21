import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { ContextMenu } from './ContextMenu';
import { IconFolder } from './DriveIcons';
import { resolveBreadcrumbs } from '../utils/breadcrumb';

export function DriveBreadcrumb({ crumbs = [], onNavigate, showSingle = false }) {
  const { t } = useI18n();
  const [menu, setMenu] = useState(null);

  if (!crumbs || crumbs.length === 0) return null;
  if (crumbs.length <= 1 && !showSingle) return null;

  const { isCollapsed, firstCrumb, collapsedCrumbs, tailCrumbs } = resolveBreadcrumbs(crumbs, 4);

  const handleEllipsisClick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({
      x: rect.left,
      y: rect.bottom + 4,
      items: collapsedCrumbs.map((c) => ({
        label: c.label,
        icon: <IconFolder className="h-4 w-4 shrink-0 text-[var(--gd-text-secondary)]" />,
        action: () => onNavigate(c.path),
      })),
    });
  };

  return (
    <nav aria-label="Breadcrumb" className="flex flex-nowrap items-center gap-1 text-sm select-none min-w-0 overflow-hidden">
      {/* First crumb (Root: My Drive) */}
      {firstCrumb && (
        <span className="flex items-center gap-1 shrink-0">
          {crumbs.length === 1 ? (
            <span
              className="font-semibold text-xs text-[var(--gd-text)] px-1.5 py-0.5 truncate max-w-[130px]"
              title={firstCrumb.label}
            >
              {firstCrumb.label}
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onNavigate(firstCrumb.path)}
              className="rounded px-1.5 py-0.5 text-xs text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-[var(--gd-hover)] transition-colors truncate max-w-[130px] cursor-pointer"
              title={firstCrumb.label}
            >
              {firstCrumb.label}
            </button>
          )}
        </span>
      )}

      {/* Ellipsis button for collapsed intermediate crumbs */}
      {isCollapsed && (
        <span className="flex items-center gap-1 shrink-0">
          <span className="text-[var(--gd-text-secondary)] text-xs opacity-50">›</span>
          <button
            type="button"
            onClick={handleEllipsisClick}
            className="flex items-center justify-center rounded px-1.5 py-0.5 text-xs font-semibold text-[var(--gd-text-secondary)] hover:bg-[var(--gd-hover)] hover:text-[var(--gd-text)] transition-colors cursor-pointer"
            title={t('breadcrumbShowMore')}
          >
            …
          </button>
        </span>
      )}

      {/* Tail crumbs (Parent and Current Folder) */}
      {tailCrumbs.map((crumb, idx) => {
        const isLast = idx === tailCrumbs.length - 1;
        return (
          <span key={crumb.path} className={`flex items-center gap-1 ${isLast ? 'min-w-0 shrink' : 'shrink-0'}`}>
            <span className="text-[var(--gd-text-secondary)] text-xs opacity-50">›</span>
            {isLast ? (
              <span
                className="font-semibold text-xs text-[var(--gd-text)] px-1.5 py-0.5 truncate min-w-0 max-w-[220px]"
                title={crumb.label}
              >
                {crumb.label}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => onNavigate(crumb.path)}
                className="rounded px-1.5 py-0.5 text-xs text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] hover:bg-[var(--gd-hover)] transition-colors truncate max-w-[160px] cursor-pointer"
                title={crumb.label}
              >
                {crumb.label}
              </button>
            )}
          </span>
        );
      })}

      {/* ContextMenu dropdown when ellipsis is clicked */}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menu.items}
          onClose={() => setMenu(null)}
        />
      )}
    </nav>
  );
}
