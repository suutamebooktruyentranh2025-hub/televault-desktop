import { useState } from 'react';
import { useI18n } from '../context/I18nContext';
import { useDashboard } from '../hooks/useDashboard';
import { DashboardUploadChart } from '../components/DashboardUploadChart';
import { DashboardRankList } from '../components/DashboardRankList';
import { DashboardDayDetail } from '../components/DashboardDayDetail';
import { formatSize, formatDate } from '../utils/format';

export function DashboardScreen({ onOpenFolder, onOpenFile }) {
  const { t } = useI18n();
  const [rangeDays, setRangeDays] = useState(30);
  const [chartMode, setChartMode] = useState('count');
  const [selectedDate, setSelectedDate] = useState(null);
  const { stats, loading, error, reload } = useDashboard({
    enabled: true,
    rangeDays,
  });

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

  const folderRows = (stats?.topFolders || []).map((row) => ({
    key: row.path,
    onClick: () => onOpenFolder(row.path),
    cells: [
      { title: row.name, subtext: row.subtext },
      formatSize(row.bytes),
      String(row.fileCount),
    ],
  }));

  const fileRows = (stats?.topFiles || []).map((row) => ({
    key: String(row.messageId),
    onClick: () => onOpenFile(row),
    cells: [row.name, formatSize(row.bytes), formatDate(row.mtime)],
  }));

  return (
    <div className="gd-dashboard">
      <div className="gd-dashboard-kpi-row">
        <div className="gd-dashboard-kpi">
          <span className="gd-dashboard-kpi-label">{t('dashboardTotalFiles')}</span>
          <span className="gd-dashboard-kpi-value">{stats?.totalFiles ?? 0}</span>
        </div>
        <div className="gd-dashboard-kpi">
          <span className="gd-dashboard-kpi-label">{t('dashboardTotalSize')}</span>
          <span className="gd-dashboard-kpi-value">{formatSize(stats?.totalBytes ?? 0)}</span>
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
                  setSelectedDate(null);
                }}
              >
                {t('dashboardRange7')}
              </button>
              <button
                type="button"
                className={`gd-dashboard-toggle ${rangeDays === 30 ? 'active' : ''}`}
                onClick={() => {
                  setRangeDays(30);
                  setSelectedDate(null);
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
          onSelectDate={setSelectedDate}
        />
      </div>

      {selectedDayData && (
        <DashboardDayDetail
          dayData={selectedDayData}
          onClose={() => setSelectedDate(null)}
          onOpenFile={onOpenFile}
        />
      )}

      <div className="gd-dashboard-lists">
        <DashboardRankList
          title={t('dashboardTopFolders')}
          columns={[
            { key: 'name', label: t('dashboardColName') },
            { key: 'size', label: t('dashboardColSize'), align: 'right' },
            { key: 'files', label: t('dashboardColFiles'), align: 'right' },
          ]}
          rows={folderRows}
          emptyLabel={t('dashboardEmpty')}
        />
        <DashboardRankList
          title={t('dashboardTopFiles')}
          columns={[
            { key: 'name', label: t('dashboardColName') },
            { key: 'size', label: t('dashboardColSize'), align: 'right' },
            { key: 'modified', label: t('dashboardColModified'), align: 'right' },
          ]}
          rows={fileRows}
          emptyLabel={t('dashboardEmpty')}
        />
      </div>
    </div>
  );
}
