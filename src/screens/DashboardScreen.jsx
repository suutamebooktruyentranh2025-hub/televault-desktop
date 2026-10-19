import { useState, useEffect, useMemo } from 'react';
import { useI18n } from '../context/I18nContext';
import { useDashboard } from '../hooks/useDashboard';
import { DashboardUploadChart } from '../components/DashboardUploadChart';
import { DashboardRankList } from '../components/DashboardRankList';
import { DashboardDayDetail } from '../components/DashboardDayDetail';
import { IconFolder, IconFile } from '../components/DriveIcons';
import { formatSize, formatDate } from '../utils/format';

export function DashboardScreen({ onOpenFolder, onOpenFile }) {
  const { t } = useI18n();
  const [rangeDays, setRangeDays] = useState(30);
  const [chartMode, setChartMode] = useState('count');
  const [selectedDate, setSelectedDate] = useState(null);
  const [isDetailExpanded, setIsDetailExpanded] = useState(false);
  const [userDismissed, setUserDismissed] = useState(false);
  const { stats, loading, error, reload } = useDashboard({
    enabled: true,
    rangeDays,
    topN: 100,
  });

  useEffect(() => {
    if (!userDismissed && stats?.uploadsPerDay?.length) {
      const currentExists = selectedDate && stats.uploadsPerDay.some((d) => d.date === selectedDate);
      if (!currentExists) {
        const latestWithFiles = [...stats.uploadsPerDay].reverse().find((d) => (d.fileCount ?? 0) > 0);
        const latestDay = stats.uploadsPerDay[stats.uploadsPerDay.length - 1];
        const targetDate = latestWithFiles?.date || latestDay?.date || null;
        if (targetDate) {
          setSelectedDate(targetDate);
          setIsDetailExpanded(false);
        }
      }
    }
  }, [stats?.uploadsPerDay, selectedDate, userDismissed]);

  const handleSelectDate = (date) => {
    setUserDismissed(false);
    if (date === selectedDate) {
      setIsDetailExpanded((prev) => !prev);
    } else {
      setSelectedDate(date);
      setIsDetailExpanded(true);
    }
  };

  const folderColumns = useMemo(
    () => [
      {
        key: 'name',
        label: t('dashboardColName'),
        align: 'left',
        width: 'w-auto',
        getValue: (row) => row.name,
        render: (row) => (
          <div className="flex items-center gap-2 min-w-0">
            <IconFolder className="h-4 w-4 shrink-0 text-amber-500" />
            <div className="min-w-0 truncate">
              <span className="font-medium truncate" title={row.name}>
                {row.name}
              </span>
              {row.subtext && (
                <span className="text-xs text-[var(--gd-text-secondary)] block truncate" title={row.subtext}>
                  {row.subtext}
                </span>
              )}
            </div>
          </div>
        ),
      },
      {
        key: 'size',
        label: t('dashboardColSize'),
        align: 'right',
        width: 'w-28 sm:w-32',
        getValue: (row) => row.bytes,
        render: (row) => formatSize(row.bytes),
      },
      {
        key: 'files',
        label: t('dashboardColFiles'),
        align: 'right',
        width: 'w-24 sm:w-28',
        getValue: (row) => row.fileCount,
        render: (row) => Number(row.fileCount || 0).toLocaleString(),
      },
    ],
    [t]
  );

  const fileColumns = useMemo(
    () => [
      {
        key: 'name',
        label: t('dashboardColName'),
        align: 'left',
        width: 'w-auto',
        getValue: (row) => row.name,
        render: (row) => (
          <div className="flex items-center gap-2 min-w-0">
            <IconFile className="h-4 w-4 shrink-0 text-slate-400" />
            <span className="font-medium truncate" title={row.name}>
              {row.name}
            </span>
          </div>
        ),
      },
      {
        key: 'size',
        label: t('dashboardColSize'),
        align: 'right',
        width: 'w-28 sm:w-32',
        getValue: (row) => row.bytes,
        render: (row) => formatSize(row.bytes),
      },
      {
        key: 'modified',
        label: t('dashboardColModified'),
        align: 'right',
        width: 'w-36 sm:w-44',
        getValue: (row) => row.mtime,
        render: (row) => (
          <span className="text-[var(--gd-text-secondary)]">{formatDate(row.mtime)}</span>
        ),
      },
    ],
    [t]
  );

  const topFolderItems = useMemo(
    () =>
      (stats?.topFolders || []).map((row) => ({
        ...row,
        key: row.path,
        onClick: () => onOpenFolder(row.path),
      })),
    [stats?.topFolders, onOpenFolder]
  );

  const topFileItems = useMemo(
    () =>
      (stats?.topFiles || []).map((row) => ({
        ...row,
        key: String(row.messageId),
        onClick: () => onOpenFile(row),
      })),
    [stats?.topFiles, onOpenFile]
  );

  if (loading && !stats) {
    return (
      <div className="gd-dashboard">
        <p className="gd-dashboard-loading">{t('loading')}</p>
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="gd-dashboard">
        <p className="gd-dashboard-error">{t('dashboardLoadError')}</p>
        <button type="button" className="gd-settings-btn" onClick={() => void reload()}>
          {t('dashboardRetry')}
        </button>
      </div>
    );
  }

  const selectedDayData = selectedDate
    ? (stats?.uploadsPerDay || []).find((d) => d.date === selectedDate)
    : null;

  return (
    <div className="gd-dashboard">
      <div className="gd-dashboard-kpi-row">
        <div className="gd-dashboard-kpi">
          <div className="gd-dashboard-kpi-icon bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div className="gd-dashboard-kpi-info">
            <span className="gd-dashboard-kpi-label">{t('dashboardTotalFiles')}</span>
            <span className="gd-dashboard-kpi-value">{Number(stats?.totalFiles ?? 0).toLocaleString()}</span>
          </div>
        </div>
        <div className="gd-dashboard-kpi">
          <div className="gd-dashboard-kpi-icon bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          </div>
          <div className="gd-dashboard-kpi-info">
            <span className="gd-dashboard-kpi-label">{t('dashboardTotalSize')}</span>
            <span className="gd-dashboard-kpi-value">{formatSize(stats?.totalBytes ?? 0)}</span>
          </div>
        </div>
      </div>

      <div className="gd-dashboard-card gd-dashboard-card--chart">
        <div className="gd-dashboard-card-header">
          <h3 className="gd-dashboard-card-title">{t('dashboardUploadTrend')}</h3>
          <div className="gd-dashboard-toggles">
            <div className="gd-dashboard-toggle-group" role="group" aria-label={t('dashboardUploadTrend')}>
              <button
                type="button"
                className={`gd-dashboard-toggle ${chartMode === 'count' ? 'active' : ''}`}
                onClick={() => setChartMode('count')}
              >
                {t('dashboardModeCount')}
              </button>
              <button
                type="button"
                className={`gd-dashboard-toggle ${chartMode === 'bytes' ? 'active' : ''}`}
                onClick={() => setChartMode('bytes')}
              >
                {t('dashboardModeBytes')}
              </button>
            </div>
            <div className="gd-dashboard-toggle-group" role="group" aria-label={t('dashboardUploadTrend')}>
              <button
                type="button"
                className={`gd-dashboard-toggle ${rangeDays === 7 ? 'active' : ''}`}
                onClick={() => {
                  setRangeDays(7);
                  setUserDismissed(false);
                }}
              >
                {t('dashboardRange7')}
              </button>
              <button
                type="button"
                className={`gd-dashboard-toggle ${rangeDays === 30 ? 'active' : ''}`}
                onClick={() => {
                  setRangeDays(30);
                  setUserDismissed(false);
                }}
              >
                {t('dashboardRange30')}
              </button>
            </div>
          </div>
        </div>
        <DashboardUploadChart
          data={stats?.uploadsPerDay}
          mode={chartMode}
          emptyLabel={t('dashboardEmpty')}
          countLabel={t('dashboardModeCount')}
          bytesLabel={t('dashboardModeBytes')}
          selectedDate={selectedDate}
          onSelectDate={handleSelectDate}
        />
      </div>

      {selectedDayData && (
        <DashboardDayDetail
          dayData={selectedDayData}
          onOpenFile={onOpenFile}
          isExpanded={isDetailExpanded}
          onToggleExpand={setIsDetailExpanded}
        />
      )}

      <div className="gd-dashboard-lists">
        <DashboardRankList
          title={t('dashboardTopFolders')}
          columns={folderColumns}
          data={topFolderItems}
          initialSortKey="size"
          initialSortDirection="desc"
          emptyLabel={t('dashboardEmpty')}
        />
        <DashboardRankList
          title={t('dashboardTopFiles')}
          columns={fileColumns}
          data={topFileItems}
          initialSortKey="size"
          initialSortDirection="desc"
          emptyLabel={t('dashboardEmpty')}
        />
      </div>
    </div>
  );
}
