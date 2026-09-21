export function formatSize(bytes) {
  if (bytes == null || Number.isNaN(Number(bytes))) return '—';
  const value = Number(bytes);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 * 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
  return `${(value / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function formatSpeed(speedBps) {
  if (!speedBps || speedBps <= 0) return null;
  return `${formatSize(speedBps)}/s`;
}

export function formatEta(etaSeconds) {
  if (etaSeconds == null || !Number.isFinite(etaSeconds) || etaSeconds < 0) return null;
  if (etaSeconds > 3600) {
    const hours = Math.floor(etaSeconds / 3600);
    const minutes = Math.floor((etaSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }
  if (etaSeconds > 60) {
    const minutes = Math.floor(etaSeconds / 60);
    const seconds = Math.floor(etaSeconds % 60);
    return `${minutes}m ${seconds}s`;
  }
  return `${Math.max(1, Math.ceil(etaSeconds))}s`;
}

export function formatDate(iso) {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()) || d.getTime() === 0) return '—';
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

export function formatWaitTime(sec, isVi = false) {
  if (sec <= 0) return '0s';
  if (sec < 60) return isVi ? `${sec} giây` : `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (isVi) return s > 0 ? `${m} phút ${s} giây` : `${m} phút`;
  return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

