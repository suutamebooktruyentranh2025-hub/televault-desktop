import { useState, useRef } from 'react';
import { useI18n } from '../context/I18nContext';
import { formatSize } from '../utils/format';

function formatAxisValue(value, mode) {
  if (mode === 'bytes') {
    if (value >= 1024 * 1024 * 1024) return `${(value / 1024 / 1024 / 1024).toFixed(1)}G`;
    if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(0)}M`;
    if (value >= 1024) return `${(value / 1024).toFixed(0)}K`;
    return String(Math.round(value));
  }
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return dateStr;
}

function formatFullDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

export function DashboardUploadChart({
  data,
  mode,
  emptyLabel,
  countLabel,
  bytesLabel,
  selectedDate,
  onSelectDate,
}) {
  const { t } = useI18n();
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const containerRef = useRef(null);

  const points = data || [];
  const values = points.map((d) => (mode === 'bytes' ? d.bytes : d.fileCount));
  const max = Math.max(1, ...values);
  const hasData = values.some((v) => v > 0);

  const width = 640;
  const height = 220;
  const padLeft = 48;
  const padRight = 16;
  const padTop = 20;
  const padBottom = 32;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  const coords = values.map((v, i) => {
    const x = padLeft + (i / Math.max(1, values.length - 1)) * chartW;
    const y = padTop + chartH - (v / max) * chartH;
    return { x, y, v, data: points[i] };
  });

  const polyline = coords.map((c) => `${c.x},${c.y}`).join(' ');
  const areaPolygon = coords.length > 0
    ? `${padLeft},${padTop + chartH} ${polyline} ${width - padRight},${padTop + chartH}`
    : '';

  const yAxisLabel = mode === 'bytes' ? bytesLabel : countLabel;
  const firstDate = points[0]?.date;
  const lastDate = points.at(-1)?.date;

  const selectedIndex = selectedDate ? points.findIndex((p) => p.date === selectedDate) : -1;
  const activeIndex = hoveredIndex !== null ? hoveredIndex : (selectedIndex >= 0 ? selectedIndex : null);
  const activeCoord = activeIndex !== null && coords[activeIndex] ? coords[activeIndex] : null;

  return (
    <div
      ref={containerRef}
      className="gd-dashboard-chart"
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {!hasData ? (
        <p className="gd-dashboard-empty">{emptyLabel}</p>
      ) : (
        <div className="gd-dashboard-chart-wrap">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="gd-dashboard-chart-svg"
            role="img"
            aria-label={yAxisLabel}
          >
            <defs>
              <linearGradient id="gd-chart-fill-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--gd-primary, #6366f1)" stopOpacity="0.25" />
                <stop offset="100%" stopColor="var(--gd-primary, #6366f1)" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Grid & Y Axis */}
            {[0, 0.5, 1].map((step) => {
              const y = padTop + chartH * (1 - step);
              const val = max * step;
              return (
                <g key={step}>
                  <line
                    x1={padLeft}
                    y1={y}
                    x2={width - padRight}
                    y2={y}
                    className="gd-dashboard-chart-grid"
                  />
                  <text
                    x={padLeft - 8}
                    y={y + 4}
                    textAnchor="end"
                    className="gd-dashboard-chart-axis"
                  >
                    {formatAxisValue(val, mode)}
                  </text>
                </g>
              );
            })}

            {/* Area Fill */}
            {areaPolygon && (
              <polygon points={areaPolygon} fill="url(#gd-chart-fill-gradient)" />
            )}

            {/* Main Polyline */}
            <polyline points={polyline} className="gd-dashboard-chart-line" fill="none" />

            {/* Crosshair indicator */}
            {activeCoord && (
              <line
                x1={activeCoord.x}
                y1={padTop}
                x2={activeCoord.x}
                y2={padTop + chartH}
                className="gd-dashboard-chart-crosshair"
              />
            )}

            {/* Standard Dots */}
            {coords.map((c, i) => {
              const isSelected = selectedIndex === i;
              const isHovered = hoveredIndex === i;
              return (
                <circle
                  key={i}
                  cx={c.x}
                  cy={c.y}
                  r={isSelected ? 5 : 3}
                  className={`gd-dashboard-chart-dot ${isSelected ? 'is-selected' : ''} ${isHovered ? 'is-hovered' : ''}`}
                />
              );
            })}

            {/* Active Dot Highlighting */}
            {activeCoord && (
              <g className="gd-dashboard-chart-active-marker">
                <circle
                  cx={activeCoord.x}
                  cy={activeCoord.y}
                  r={9}
                  className="gd-dashboard-chart-dot-pulse"
                />
                <circle
                  cx={activeCoord.x}
                  cy={activeCoord.y}
                  r={5}
                  className="gd-dashboard-chart-dot-active"
                />
              </g>
            )}

            {/* X-axis date labels */}
            {firstDate && (
              <text x={padLeft} y={height - 8} className="gd-dashboard-chart-axis">
                {formatShortDate(firstDate)}
              </text>
            )}
            {lastDate && lastDate !== firstDate && (
              <text x={width - padRight} y={height - 8} textAnchor="end" className="gd-dashboard-chart-axis">
                {formatShortDate(lastDate)}
              </text>
            )}

            {/* Interactive Hitbox Columns for each day */}
            {coords.map((c, i) => {
              const colW = Math.max(12, chartW / Math.max(1, coords.length));
              const dayDate = points[i]?.date;
              return (
                <rect
                  key={`hitbox-${i}`}
                  x={c.x - colW / 2}
                  y={padTop}
                  width={colW}
                  height={chartH + 20}
                  fill="transparent"
                  className="gd-dashboard-chart-hitbox"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onClick={() => {
                    if (onSelectDate) {
                      onSelectDate(selectedDate === dayDate ? null : dayDate);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${formatFullDate(dayDate)}: ${points[i]?.fileCount ?? 0} files, ${formatSize(points[i]?.bytes ?? 0)}`}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      if (onSelectDate) {
                        onSelectDate(selectedDate === dayDate ? null : dayDate);
                      }
                    }
                  }}
                />
              );
            })}
          </svg>

          {/* Floating Tooltip */}
          {activeCoord && activeCoord.data && (
            <div
              className="gd-dashboard-tooltip"
              style={{
                left: `${(activeCoord.x / width) * 100}%`,
                top: `${(Math.max(padTop, activeCoord.y - 14) / height) * 100}%`,
              }}
            >
              <div className="gd-dashboard-tooltip-header">
                <span className="gd-dashboard-tooltip-date">
                  {formatFullDate(activeCoord.data.date)}
                </span>
              </div>
              <div className="gd-dashboard-tooltip-row">
                <span className="gd-dashboard-tooltip-label">{t('dashboardTooltipFiles')}:</span>
                <span className="gd-dashboard-tooltip-val">
                  {activeCoord.data.fileCount}
                </span>
              </div>
              <div className="gd-dashboard-tooltip-row">
                <span className="gd-dashboard-tooltip-label">{t('dashboardTooltipSize')}:</span>
                <span className="gd-dashboard-tooltip-val">
                  {formatSize(activeCoord.data.bytes)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="gd-dashboard-chart-footer">
        <span className="gd-dashboard-chart-caption">{yAxisLabel}</span>
        <span className="gd-dashboard-chart-hint">{t('dashboardClickToInspectDay')}</span>
      </div>
    </div>
  );
}
