import React, { useState, useMemo } from 'react';
import { useI18n } from '../../../context/I18nContext';

function formatSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 1)} ${units[i] || 'TB'}`;
}

function getFileIcon(isFolder, name = '') {
  if (isFolder) return { icon: '📁', color: 'text-amber-500' };
  const ext = name.split('.').pop()?.toLowerCase();
  if (['cbz', 'cbr', 'zip', 'rar', '7z', 'tar'].includes(ext)) return { icon: '📦', color: 'text-purple-500' };
  if (['pdf', 'epub', 'mobi'].includes(ext)) return { icon: '📕', color: 'text-red-500' };
  if (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext)) return { icon: '🖼️', color: 'text-emerald-500' };
  if (['mp4', 'mkv', 'avi', 'mov'].includes(ext)) return { icon: '🎬', color: 'text-blue-500' };
  if (['mp3', 'flac', 'm4a', 'wav'].includes(ext)) return { icon: '🎵', color: 'text-pink-500' };
  return { icon: '📄', color: 'text-slate-400' };
}

function formatDate(isoStr, locale) {
  if (!isoStr) return '—';
  try {
    const d = new Date(isoStr);
    return d.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return isoStr;
  }
}

export function GDriveLiveScanFeed({
  t: propT,
  items = [],
  filesFound = 0,
  scanPhase = null,
  onClose,
}) {
  const { t: contextT, locale } = useI18n();
  const t = propT || contextT;
  const [filterQuery, setFilterQuery] = useState('');

  const filteredItems = useMemo(() => {
    if (!filterQuery.trim()) return items;
    const q = filterQuery.toLowerCase();
    return items.filter((item) => (item.name || '').toLowerCase().includes(q));
  }, [items, filterQuery]);

  return (
    <div className="shrink-0 border-b border-[var(--gd-border)] bg-[var(--gd-surface)] shadow-inner transition-all flex flex-col max-h-72 overflow-hidden animate-fadeIn">
      {/* Feed Header */}
      <div className="px-4 py-2 bg-[var(--gd-surface-hover)] border-b border-[var(--gd-border)] flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
          </span>
          <span className="text-xs font-bold text-[var(--gd-text)] flex items-center gap-1.5">
            <span>{t('gdriveLiveFeedTitle')}</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
              LIVE
            </span>
          </span>
          <span className="text-xs text-[var(--gd-text-secondary)]">
            {t('gdriveLiveFeedSummary', { shown: filteredItems.length, total: items.length, filesFound: filesFound.toLocaleString() })}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Search */}
          <div className="relative">
            <input
              type="text"
              placeholder={t('gdriveLiveFeedFilterPlaceholder')}
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              className="text-xs px-2.5 py-1 pl-6 rounded-md border border-[var(--gd-border)] bg-[var(--gd-bg)] text-[var(--gd-text)] focus:outline-none focus:border-[var(--gd-primary)] w-48 transition-all"
            />
            <span className="absolute left-2 top-1.5 text-xs text-[var(--gd-text-secondary)] opacity-60">🔍</span>
            {filterQuery && (
              <button
                type="button"
                onClick={() => setFilterQuery('')}
                className="absolute right-1.5 top-1 text-xs text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] px-1 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-xs px-2 py-1 rounded hover:bg-[var(--gd-surface)] text-[var(--gd-text-secondary)] hover:text-[var(--gd-text)] cursor-pointer"
              title={t('gdriveLiveFeedHideTooltip')}
            >
              {t('gdriveLiveFeedCollapseBtn')}
            </button>
          )}
        </div>
      </div>

      {/* Feed List Table */}
      <div className="flex-1 overflow-y-auto min-h-0 text-xs font-sans">
        {filteredItems.length === 0 ? (
          <div className="p-6 text-center text-[var(--gd-text-secondary)] flex flex-col items-center justify-center gap-1.5">
            {items.length === 0 ? (
              <>
                <svg className="animate-spin h-5 w-5 text-[var(--gd-primary)] opacity-75" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <span className="text-xs mt-1">{t('gdriveLiveFeedLoading')}</span>
              </>
            ) : (
              <span>{t('gdriveLiveFeedEmptyFilter', { query: filterQuery })}</span>
            )}
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="sticky top-0 bg-[var(--gd-surface)] border-b border-[var(--gd-border)] text-[11px] font-semibold text-[var(--gd-text-secondary)] z-10">
              <tr>
                <th className="py-1.5 px-3 w-8 text-center">#</th>
                <th className="py-1.5 px-3">{t('gdriveLiveFeedColItem')}</th>
                <th className="py-1.5 px-3 w-28">{t('gdriveLiveFeedColType')}</th>
                <th className="py-1.5 px-3 w-24 text-right">{t('gdriveLiveFeedColSize')}</th>
                <th className="py-1.5 px-3 w-36">{t('gdriveLiveFeedColMtime')}</th>
                <th className="py-1.5 px-3 w-28 text-center">{t('gdriveLiveFeedColStatus')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--gd-border)]/50">
              {filteredItems.map((item, idx) => {
                const { icon, color } = getFileIcon(item.isFolder, item.name);
                return (
                  <tr
                    key={item.id || idx}
                    className="hover:bg-[var(--gd-surface-hover)] transition-colors group"
                  >
                    <td className="py-1.5 px-3 text-center text-[var(--gd-text-secondary)] opacity-60 font-mono text-[10px]">
                      {idx + 1}
                    </td>
                    <td className="py-1.5 px-3 font-medium text-[var(--gd-text)] truncate max-w-xs md:max-w-md">
                      <div className="flex items-center gap-1.5">
                        <span className={`shrink-0 ${color}`}>{icon}</span>
                        <span className="truncate" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 px-3 text-[var(--gd-text-secondary)] truncate">
                      {item.isFolder ? (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          {t('gdriveLiveFeedTypeFolder')}
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-500/10 text-[var(--gd-text-secondary)] uppercase">
                          {item.name?.split('.').pop() || t('gdriveLiveFeedTypeFile')}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[var(--gd-text-secondary)]">
                      {item.isFolder ? '—' : formatSize(item.size)}
                    </td>
                    <td className="py-1.5 px-3 text-[11px] text-[var(--gd-text-secondary)] truncate">
                      {formatDate(item.modifiedTime, locale)}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {t('gdriveLiveFeedDetected')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
