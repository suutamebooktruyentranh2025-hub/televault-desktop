import React from 'react';
import { formatSpeed } from '../../../utils/format';

export function SettingsToggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="gd-settings-toggle"
      onClick={() => onChange(!checked)}
    >
      <span className="gd-settings-toggle-thumb" />
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
