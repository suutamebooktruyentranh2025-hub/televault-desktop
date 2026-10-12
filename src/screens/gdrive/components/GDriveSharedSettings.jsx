import React from 'react';
import { formatSpeed } from '../../../utils/format';

export function SettingsToggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-hidden focus:ring-2 focus:ring-[var(--gd-primary)]/40 focus:ring-offset-1 ${
        checked ? 'bg-[var(--gd-primary)]' : 'bg-zinc-300 dark:bg-zinc-600'
      }`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
          checked ? 'translate-x-[18px]' : 'translate-x-[2px]'
        }`}
      />
    </button>
  );
}

export function SettingsField({ title, hint, children }) {
  return (
    <div className="gd-settings-field">
      <div className="gd-settings-field-label">
        <div className="gd-settings-row-title">{title}</div>
        {hint && <div className="gd-settings-row-hint">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function formatPct(fraction) {
  const value = Math.round(Math.min(1, Math.max(0, Number(fraction) || 0)) * 100);
  return String(value);
}

export function formatGdriveSyncStatus(phase, speedBps, downloadProgress, uploadProgress, t) {
  const speed = formatSpeed(speedBps);
  const downloadPct = formatPct(downloadProgress);
  const uploadPct = formatPct(uploadProgress);
  if (phase === 'download') {
    return speed
      ? t('gdrivePhaseDownloadSpeed', { pct: downloadPct, speed })
      : t('gdrivePhaseDownload', { pct: downloadPct });
  }
  if (phase === 'hash') return t('gdrivePhaseHash');
  if (phase === 'upload') {
    return speed
      ? t('gdrivePhaseUploadSpeed', { pct: uploadPct, speed })
      : t('gdrivePhaseUpload', { pct: uploadPct });
  }
  return speed || null;
}
