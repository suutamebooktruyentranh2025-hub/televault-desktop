import { useState, useMemo } from 'react';
import { useI18n } from '../context/I18nContext';
import { SortHeader } from './SortHeader';

export function DashboardRankList({
  title,
  columns = [],
  data = [],
  rows = null,
  emptyLabel,
  initialSortKey = 'size',
  initialSortDirection = 'desc',
  pageSizeOptions = [25, 50, 100],
  defaultPageSize = 25,
}) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDirection, setSortDirection] = useState(initialSortDirection);
  const [pageSize, setPageSize] = useState(defaultPageSize);
  const [page, setPage] = useState(1);

  // If legacy rows prop is provided, adapt it to data
  const rawList = useMemo(() => {
    if (Array.isArray(data) && data.length > 0) return data;
    if (Array.isArray(rows) && rows.length > 0) return rows;
    return [];
  }, [data, rows]);

  const isLegacyRows = !data || data.length === 0;

  function handleToggleSort(key) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      const col = columns.find((c) => c.key === key);
      const defaultDesc = col?.defaultSortDirection === 'desc' || key === 'size' || key === 'files' || key === 'bytes' || key === 'modified';
      setSortDirection(defaultDesc ? 'desc' : 'asc');
    }
    setPage(1);
  }

  const sortedList = useMemo(() => {
    if (!rawList || rawList.length === 0) return [];
    if (isLegacyRows) {
      // Legacy rows mode (already formatted cells)
      return rawList;
    }
    const col = columns.find((c) => c.key === sortKey);
    if (!col || !col.getValue) return rawList;

    const list = [...rawList];
    list.sort((a, b) => {
      const valA = col.getValue(a);
      const valB = col.getValue(b);
      let cmp = 0;
      if (typeof valA === 'number' && typeof valB === 'number') {
        cmp = valA - valB;
      } else if (valA instanceof Date || (typeof valA === 'string' && valA && !isNaN(Date.parse(valA)) && (valA.includes('T') || valA.includes('-')))) {
        cmp = new Date(valA).getTime() - new Date(valB).getTime();
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        cmp = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
      } else {
        cmp = String(valA ?? '').localeCompare(String(valB ?? ''), undefined, { numeric: true, sensitivity: 'base' });
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [rawList, columns, sortKey, sortDirection, isLegacyRows]);

  const totalItems = sortedList.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const paginatedList = sortedList.slice(startIndex, startIndex + pageSize);

  const startRow = totalItems === 0 ? 0 : startIndex + 1;
  const endRow = Math.min(startIndex + pageSize, totalItems);

  return (
    <div className="gd-dashboard-card flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <h3 className="gd-dashboard-card-title">{title}</h3>
            {totalItems > 0 && (
              <span className="gd-dashboard-day-detail-badge">
                {totalItems.toLocaleString()}
              </span>
            )}
          </div>
        </div>

        {totalItems === 0 ? (
          <p className="gd-dashboard-empty">{emptyLabel}</p>
        ) : (
          <div className="gd-dashboard-table-wrap max-h-[520px] overflow-y-auto overflow-x-auto">
            <table className="gd-dashboard-table w-full table-fixed">
              <colgroup>
                {columns.map((col) => (
                  <col key={col.key} className={col.width || (col.align === 'right' ? 'w-28 sm:w-32' : 'w-auto')} />
                ))}
              </colgroup>
              <thead className="sticky top-0 z-10 bg-[var(--gd-surface)] shadow-xs">
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`bg-[var(--gd-surface)] ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                    >
                      {col.sortable !== false ? (
                        <SortHeader
                          active={sortKey === col.key}
                          direction={sortDirection}
                          onClick={() => handleToggleSort(col.key)}
                          label={col.label}
                          align={col.align || 'left'}
                        >
                          {col.label}
                        </SortHeader>
                      ) : (
                        <span>{col.label}</span>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paginatedList.map((item, rowIndex) => {
                  const key = item.key || item.path || item.messageId || rowIndex;
                  const onClick = item.onClick || (item.onRowClick ? () => item.onRowClick(item) : undefined);

                  return (
                    <tr
                      key={key}
                      className={onClick ? 'gd-dashboard-table-clickable' : ''}
                      onClick={onClick}
                      onKeyDown={
                        onClick
                          ? (e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                onClick();
                              }
                            }
                          : undefined
                      }
                      tabIndex={onClick ? 0 : undefined}
                      role={onClick ? 'button' : undefined}
                    >
                      {columns.map((col, colIndex) => {
                        return (
                          <td
                            key={col.key || colIndex}
                            className={`${col.align === 'right' ? 'text-right whitespace-nowrap tabular-nums' : 'overflow-hidden'}`}
                          >
                            {col.render
                              ? col.render(item)
                              : item.cells
                              ? (typeof item.cells[colIndex] === 'object' && item.cells[colIndex] !== null && 'title' in item.cells[colIndex] ? (
                                  <div className="gd-dashboard-cell-with-subtext">
                                    <span className="gd-dashboard-cell-title truncate" title={item.cells[colIndex].title}>
                                      {item.cells[colIndex].title}
                                    </span>
                                    {item.cells[colIndex].subtext && (
                                      <span className="gd-dashboard-cell-subtext truncate" title={item.cells[colIndex].subtext}>
                                        {item.cells[colIndex].subtext}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  item.cells[colIndex]
                                ))
                              : String(item[col.key] ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagination Footer */}
      {totalItems > 0 && (
        <div className="mt-2.5 pt-2 border-t border-[var(--gd-border)] flex items-center justify-between gap-2 text-xs text-[var(--gd-text-secondary)] select-none">
          <div className="flex items-center gap-2 min-w-0">
            <span className="tabular-nums whitespace-nowrap text-[11px] text-[var(--gd-text-secondary)]">
              {startRow}–{endRow} / {totalItems.toLocaleString()}
            </span>
            <div className="inline-flex rounded border border-[var(--gd-border)] bg-[var(--gd-surface)] p-0.5">
              {pageSizeOptions.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    setPageSize(opt);
                    setPage(1);
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                    pageSize === opt
                      ? 'bg-[var(--gd-primary-light)]/50 text-[var(--gd-primary)] font-semibold shadow-2xs'
                      : 'text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)]'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <span className="tabular-nums whitespace-nowrap text-[11px]">
              {safePage} / {totalPages}
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                title={t('dashboardPaginationPrevious')}
                aria-label={t('dashboardPaginationPrevious')}
                className="w-6 h-6 rounded flex items-center justify-center border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] hover:text-[var(--gd-text)] disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                title={t('dashboardPaginationNext')}
                aria-label={t('dashboardPaginationNext')}
                className="w-6 h-6 rounded flex items-center justify-center border border-[var(--gd-border)] bg-[var(--gd-surface)] hover:bg-[var(--gd-surface-hover)] hover:text-[var(--gd-text)] disabled:opacity-25 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
