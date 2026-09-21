import React, { memo } from 'react';
import { useI18n } from '../../../context/I18nContext';
import { formatSpeed } from '../../../utils/format';
import { IconClose } from '../../../components/DriveIcons';

function IconDriveMini({ className = 'h-3 w-3 shrink-0 text-blue-500' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M7.71 3.5 1.15 15l3.43 6 6.55-11.5z" opacity="0.8" />
      <path d="m22.85 15-3.43 6H6.57l3.43-6z" opacity="0.9" />
      <path d="M12 9.5 15.43 3.5h6.86L15.72 15z" />
    </svg>
  );
}

function IconTelegramMini({ className = 'h-3 w-3 shrink-0 text-[#2AABEE]' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
    </svg>
  );
}

function IconFolderAction({ className = 'h-4 w-4 shrink-0' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

export const GDriveQueueRow = memo(({
  item,
  isSelected,
  onToggle,
  onClick,
  isCurrentSync = false,
  syncPhase = null,
  downloadProgress = 0,
  uploadProgress = 0,
  speedBps = 0,
}) => {
  const { t } = useI18n();

  const speedText = formatSpeed(speedBps);
  const downloadPct = Math.round(Math.min(1, Math.max(0, downloadProgress || 0)) * 100);
  const uploadPct = Math.round(Math.min(1, Math.max(0, uploadProgress || 0)) * 100);

  // Determine Drive Status & Bar
  let driveText = t('gdriveSyncWaiting');
  let driveBarPct = 0;
  let driveBarColor = 'bg-zinc-200 dark:bg-zinc-700';

  // Determine Telegram Status & Bar
  let telegramText = t('gdriveSyncWaiting');
  let telegramBarPct = 0;
  let telegramBarColor = 'bg-zinc-200 dark:bg-zinc-700';

  if (isCurrentSync) {
    if (syncPhase === 'download') {
      driveText = speedText ? `${downloadPct}% · ${speedText}` : `${downloadPct}%`;
      driveBarPct = downloadPct;
      driveBarColor = 'bg-blue-500';

      telegramText = t('gdriveSyncWaiting');
      telegramBarPct = 0;
    } else if (syncPhase === 'hash') {
      driveText = `100% · ${t('gdriveSyncDone')}`;
      driveBarPct = 100;
      driveBarColor = 'bg-emerald-500';

      telegramText = t('gdriveSyncHashing');
      telegramBarPct = 100;
      telegramBarColor = 'bg-amber-400 animate-pulse';
    } else if (syncPhase === 'upload') {
      driveText = `100% · ${t('gdriveSyncDone')}`;
      driveBarPct = 100;
      driveBarColor = 'bg-emerald-500';

      telegramText = speedText ? `${uploadPct}% · ${speedText}` : `${uploadPct}%`;
      telegramBarPct = uploadPct;
      telegramBarColor = 'bg-emerald-500';
    } else {
      driveText = `${downloadPct}%`;
      driveBarPct = downloadPct;
      driveBarColor = downloadPct === 100 ? 'bg-emerald-500' : 'bg-blue-500';

      telegramText = `${uploadPct}%`;
      telegramBarPct = uploadPct;
      telegramBarColor = 'bg-emerald-500';
    }
  }

  return (
    <tr
      className={`gd-row cursor-pointer border-b border-[var(--gd-border)] ${isSelected ? 'selected' : ''}`}
      onMouseDown={(e) => {
        if (e.shiftKey || e.ctrlKey || e.metaKey) {
          e.preventDefault();
        }
      }}
      onClick={onClick}
    >
      <td className="w-10 px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
        <input
          type="checkbox"
          className="gd-row-checkbox"
          checked={isSelected}
          onChange={() => onToggle(item.driveFileId, { additive: true, range: false })}
        />
      </td>
      <td className="px-3 py-2.5 min-w-0">
        <div className="min-w-0 flex flex-col justify-center">
          <span
            className={`text-xs font-medium break-words line-clamp-2 ${
              isSelected ? 'text-[var(--gd-primary)]' : 'text-[var(--gd-text)]'
            }`}
            title={item.fileName}
          >
            {item.fileName}
          </span>
          {item.drivePath && (
            <span
              className="text-[11px] opacity-60 truncate mt-0.5 text-[var(--gd-text-secondary)] block"
              title={item.drivePath}
            >
              {item.drivePath}
            </span>
          )}
        </div>
      </td>
      <td className="w-24 px-3 py-2.5 text-[var(--gd-text-secondary)] text-right text-xs whitespace-nowrap">
        {item.size > 0 ? `${(item.size / (1024 * 1024)).toFixed(2)} MB` : '—'}
      </td>
      <td className="w-64 px-3 py-2 text-xs">
        <div className={`flex flex-col gap-1.5 min-w-0 ${isCurrentSync ? '' : 'opacity-60'}`}>
          {/* Dòng 1: Google Drive (Download) */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] mb-0.5">
              <span className="flex items-center gap-1 min-w-0 font-medium text-[var(--gd-text)]">
                <IconDriveMini className={`h-3 w-3 shrink-0 ${isCurrentSync ? 'text-blue-500' : 'text-zinc-400'}`} />
                <span className="truncate">{t('gdriveSyncDriveLabel')}</span>
              </span>
              <span className={`text-[10px] font-mono shrink-0 ${isCurrentSync && syncPhase === 'download' ? 'text-blue-500 font-semibold' : 'text-[var(--gd-text-secondary)]'}`}>
                {driveText}
              </span>
            </div>
            <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-700/60 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${driveBarColor}`}
                style={{ width: `${driveBarPct}%` }}
              />
            </div>
          </div>

          {/* Dòng 2: Telegram (Upload) */}
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1 text-[11px] mb-0.5">
              <span className="flex items-center gap-1 min-w-0 font-medium text-[var(--gd-text)]">
                <IconTelegramMini className={`h-3 w-3 shrink-0 ${isCurrentSync ? 'text-[#2AABEE]' : 'text-zinc-400'}`} />
                <span className="truncate">{t('gdriveSyncTelegramLabel')}</span>
              </span>
              <span className={`text-[10px] font-mono shrink-0 ${isCurrentSync && syncPhase === 'upload' ? 'text-emerald-500 font-semibold' : 'text-[var(--gd-text-secondary)]'}`}>
                {telegramText}
              </span>
            </div>
            <div className="h-1 w-full bg-zinc-200 dark:bg-zinc-700/60 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 rounded-full ${telegramBarColor}`}
                style={{ width: `${telegramBarPct}%` }}
              />
            </div>
          </div>
        </div>
      </td>
      <td className="w-20 px-2 py-2 text-right" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            className="rounded p-1 text-[var(--gd-text-secondary)] hover:text-[var(--gd-primary)] hover:bg-[var(--gd-primary)]/10 transition-colors cursor-pointer"
            onClick={() => {
              window.televault?.gdrive?.openDownloadFolder?.({
                driveFileId: item.driveFileId,
                fileName: item.fileName,
              });
            }}
            title={t('gdriveOpenDownloadFolder')}
          >
            <IconFolderAction className="h-4 w-4" />
          </button>
          <button
            type="button"
            className="rounded p-1 text-[var(--gd-text-secondary)] hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
            onClick={() => {
              window.televault?.gdrive?.removeQueueItem(item.driveFileId);
            }}
            title={t('transfersActionCancel')}
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}, (prevProps, nextProps) => {
  return prevProps.item.driveFileId === nextProps.item.driveFileId &&
         prevProps.item.size === nextProps.item.size &&
         prevProps.item.fileName === nextProps.item.fileName &&
         prevProps.isSelected === nextProps.isSelected &&
         prevProps.isCurrentSync === nextProps.isCurrentSync &&
         prevProps.syncPhase === nextProps.syncPhase &&
         prevProps.downloadProgress === nextProps.downloadProgress &&
         prevProps.uploadProgress === nextProps.uploadProgress &&
         prevProps.speedBps === nextProps.speedBps;
});
