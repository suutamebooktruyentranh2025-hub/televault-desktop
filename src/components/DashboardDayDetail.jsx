import { useState, useEffect, useMemo, useRef } from 'react';
import { useI18n } from '../context/I18nContext';
import { IconFile } from './DriveIcons';
import { formatSize, formatDate } from '../utils/format';
import { SortHeader } from './SortHeader';

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function DashboardDayDetail({
  dayData,
  onClose,
  onOpenFile,
  isExpanded: controlledIsExpanded,
  onToggleExpand,
}) {
  const { t } = useI18n();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(dayData?.fileCount ?? 0);
  const [totalBytes, setTotalBytes] = useState(dayData?.bytes ?? 0);
  const [sortField, setSortField] = useState('bytes');
  const [sortDirection, setSortDirection] = useState('desc');
  const [internalExpanded, setInternalExpanded] = useState(false);

  const isExpanded = controlledIsExpanded !== undefined ? controlledIsExpanded : internalExpanded;

  const handleToggleExpand = () => {
    if (onToggleExpand) {
      onToggleExpand(!isExpanded);
    } else {
      setInternalExpanded((prev) => !prev);
    }
  };

  const prevDateRef = useRef(dayData?.date);
  useEffect(() => {
    if (dayData?.date && prevDateRef.current && dayData.date !== prevDateRef.current) {
      if (onToggleExpand) {
        onToggleExpand(true);
      } else {
        setInternalExpanded(true);
      }
    }
    prevDateRef.current = dayData?.date;
  }, [dayData?.date, onToggleExpand]);

  function handleToggleSort(field) {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection(field === 'name' ? 'asc' : 'desc');
    }
  }

  const sortedFiles = useMemo(() => {
    if (!files || files.length === 0) return [];
    const list = [...files];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortField === 'name') {
        cmp = (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' });
      } else if (sortField === 'bytes') {
        cmp = (a.bytes || 0) - (b.bytes || 0);
      } else if (sortField === 'mtime') {
        const timeA = new Date(a.mtime).getTime() || 0;
        const timeB = new Date(b.mtime).getTime() || 0;
        cmp = timeA - timeB;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [files, sortField, sortDirection]);

  useEffect(() => {
    if (!dayData?.date) {
      setFiles([]);
      return;
    }
    setTotalCount(dayData.fileCount ?? 0);
    setTotalBytes(dayData.bytes ?? 0);

    if (Array.isArray(dayData.files) && dayData.files.length > 0) {
      setFiles(dayData.files);
      return;
    }

    if ((dayData.fileCount ?? 0) === 0 || !window.televault?.vault?.getDayFiles) {
      setFiles([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    window.televault.vault
      .getDayFiles(dayData.date, 100)
      .then((res) => {
        if (cancelled) return;
        if (res?.ok) {
          setFiles(res.files || []);
          if (typeof res.totalCount === 'number') setTotalCount(res.totalCount);
          if (typeof res.totalBytes === 'number') setTotalBytes(res.totalBytes);
        } else {
          setFiles([]);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.error('[DashboardDayDetail] error loading day files', e);
          setFiles([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [dayData?.date, dayData?.fileCount, dayData?.bytes, dayData?.files]);

  if (!dayData) return null;

  const dateLabel = formatFullDate(dayData.date);
  const title = t('dashboardDayDetailTitle').replace('{date}', dateLabel);
  const subtitle = t('dashboardDayDetailSubtitle')
    .replace('{count}', String(totalCount))
    .replace('{size}', formatSize(totalBytes));

  const isTruncated = totalCount > files.length;
  const showingTopText = isTruncated
    ? t('dashboardDayDetailShowingTop')
        .replace('{shown}', String(files.length))
        .replace('{total}', String(totalCount))
    : null;

  return (
    <div className={`gd-dashboard-card gd-dashboard-day-detail transition-all ${!isExpanded ? '!pb-3' : ''}`}>
      <div className={`gd-dashboard-day-detail-header ${!isExpanded ? '!mb-0' : ''}`}>
        <div
          className="gd-dashboard-day-detail-title-group flex-1 cursor-pointer select-none group/toggle outline-none focus:outline-none"
          onClick={handleToggleExpand}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleToggleExpand();
            }
          }}
          aria-expanded={isExpanded}
        >
          <div className="flex items-center gap-2">
            <span className="text-[var(--gd-text-secondary)] group-hover/toggle:text-[var(--gd-primary)] transition-colors">
              <svg
                className={`w-4 h-4 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </span>
            <h3 className="gd-dashboard-card-title group-hover/toggle:text-[var(--gd-primary)] transition-colors">
              {title}
            </h3>
            <span className="gd-dashboard-day-detail-badge">{subtitle}</span>
          </div>
          {isExpanded && showingTopText && (
            <p className="gd-dashboard-chart-hint mt-1 text-xs">{showingTopText}</p>
          )}
        </div>
      </div>

      {isExpanded && (
        loading ? (
          <p className="gd-dashboard-loading">{t('dashboardDayDetailLoading')}</p>
        ) : sortedFiles.length === 0 ? (
          <p className="gd-dashboard-empty">{t('dashboardNoUploadsOnDay')}</p>
        ) : (
          <div className="gd-dashboard-table-wrap max-h-[320px] overflow-y-auto">
          <table className="gd-dashboard-table w-full table-fixed">
            <colgroup>
              <col className="w-auto" />
              <col className="w-28 sm:w-32" />
              <col className="w-44 sm:w-48" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-[var(--gd-surface)] shadow-xs">
              <tr>
                <th className="bg-[var(--gd-surface)] text-left">
                  <SortHeader
                    active={sortField === 'name'}
                    direction={sortDirection}
                    onClick={() => handleToggleSort('name')}
                    label={t('dashboardColName')}
                    align="left"
                  >
                    {t('dashboardColName')}
                  </SortHeader>
                </th>
                <th className="bg-[var(--gd-surface)] text-right">
                  <SortHeader
                    active={sortField === 'bytes'}
                    direction={sortDirection}
                    onClick={() => handleToggleSort('bytes')}
                    label={t('dashboardColSize')}
                    align="right"
                  >
                    {t('dashboardColSize')}
                  </SortHeader>
                </th>
                <th className="bg-[var(--gd-surface)] text-right">
                  <SortHeader
                    active={sortField === 'mtime'}
                    direction={sortDirection}
                    onClick={() => handleToggleSort('mtime')}
                    label={t('dashboardColModified')}
                    align="right"
                  >
                    {t('dashboardColModified')}
                  </SortHeader>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFiles.map((file) => (
                <tr
                  key={file.messageId || file.path}
                  className={onOpenFile ? 'gd-dashboard-table-clickable' : ''}
                  onClick={() => onOpenFile?.(file)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onOpenFile?.(file);
                    }
                  }}
                  tabIndex={onOpenFile ? 0 : undefined}
                  role={onOpenFile ? 'button' : undefined}
                >
                  <td className="overflow-hidden">
                    <div className="flex items-center gap-2 min-w-0">
                      <IconFile className="h-4 w-4 shrink-0 text-slate-400" />
                      <span className="truncate" title={file.name}>{file.name}</span>
                    </div>
                  </td>
                  <td className="text-right whitespace-nowrap tabular-nums">{formatSize(file.bytes)}</td>
                  <td className="text-right whitespace-nowrap text-[var(--gd-text-secondary)]">{formatDate(file.mtime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )
      )}
    </div>
  );
}
