import { useState, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';
import { IconClose, IconFile } from './DriveIcons';
import { formatSize, formatDate } from '../utils/format';

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function DashboardDayDetail({ dayData, onClose, onOpenFile }) {
  const { t } = useI18n();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(dayData?.fileCount ?? 0);
  const [totalBytes, setTotalBytes] = useState(dayData?.bytes ?? 0);

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
    <div className="gd-dashboard-card gd-dashboard-day-detail">
      <div className="gd-dashboard-day-detail-header">
        <div className="gd-dashboard-day-detail-title-group">
          <div className="flex items-center gap-2">
            <h3 className="gd-dashboard-card-title">{title}</h3>
            <span className="gd-dashboard-day-detail-badge">{subtitle}</span>
          </div>
          {showingTopText && (
            <p className="gd-dashboard-chart-hint mt-1 text-xs">{showingTopText}</p>
          )}
        </div>
        <button
          type="button"
          className="gd-dashboard-close-btn"
          onClick={onClose}
          aria-label={t('dashboardCloseDayDetail')}
          title={t('dashboardCloseDayDetail')}
        >
          <IconClose className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <p className="gd-dashboard-loading">{t('dashboardDayDetailLoading')}</p>
      ) : files.length === 0 ? (
        <p className="gd-dashboard-empty">{t('dashboardNoUploadsOnDay')}</p>
      ) : (
        <div className="gd-dashboard-table-wrap">
          <table className="gd-dashboard-table">
            <thead>
              <tr>
                <th>{t('dashboardColName')}</th>
                <th className="text-right">{t('dashboardColSize')}</th>
                <th className="text-right">{t('dashboardColModified')}</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
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
                  <td className="gd-dashboard-file-cell">
                    <IconFile className="h-4 w-4 shrink-0 text-slate-400" />
                    <span className="truncate" title={file.name}>{file.name}</span>
                  </td>
                  <td className="text-right whitespace-nowrap">{formatSize(file.bytes)}</td>
                  <td className="text-right whitespace-nowrap">{formatDate(file.mtime)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
