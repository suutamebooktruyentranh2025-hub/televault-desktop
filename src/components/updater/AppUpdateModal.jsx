import { useState, useEffect } from 'react';
import { useI18n } from '../../context/I18nContext';
import { formatSize } from '../../utils/format';

export function AppUpdateModal({ isOpen, onClose, updateInfo, onSkipVersion }) {
  const { t } = useI18n();
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [downloadedFilePath, setDownloadedFilePath] = useState(null);
  const [installing, setInstalling] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const isMac = typeof navigator !== 'undefined' && /Mac|Macintosh/i.test(navigator.userAgent);

  useEffect(() => {
    if (!isOpen) {
      setErrorMessage(null);
      return;
    }
    const unsub = window.televault?.updater?.onDownloadProgress?.((payload) => {
      setDownloadProgress(payload);
    });
    return () => unsub?.();
  }, [isOpen]);

  if (!isOpen || !updateInfo) return null;

  async function handleStartDownload() {
    if (!updateInfo.downloadUrl) return;
    setDownloading(true);
    setErrorMessage(null);
    setDownloadProgress({ percent: 0, downloadedBytes: 0, totalBytes: updateInfo.assetSize || 0 });

    try {
      const res = await window.televault?.updater?.downloadUpdate({
        url: updateInfo.downloadUrl,
        filename: updateInfo.assetName,
      });
      if (res?.ok && res.filePath) {
        setDownloadedFilePath(res.filePath);
      } else {
        setErrorMessage(res?.error || t('updateDownloadFailed'));
      }
    } catch (err) {
      setErrorMessage(String(err?.message || err || t('updateDownloadFailed')));
    } finally {
      setDownloading(false);
    }
  }

  async function handleInstall() {
    if (!downloadedFilePath) return;
    setInstalling(true);
    setErrorMessage(null);
    try {
      const res = await window.televault?.updater?.installUpdate(downloadedFilePath);
      if (!res?.ok && res?.error) {
        setErrorMessage(res.error);
        setInstalling(false);
      }
    } catch (err) {
      setErrorMessage(String(err?.message || err || t('errorGeneric')));
      setInstalling(false);
    }
  }

  function handleSkip() {
    if (updateInfo.latestVersion && onSkipVersion) {
      onSkipVersion(updateInfo.latestVersion);
    }
    onClose();
  }

  const changelog = updateInfo.changelog || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-lg bg-[var(--gd-surface)] border border-[var(--gd-border)] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-200 text-[var(--gd-text)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-modal-title"
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-[var(--gd-border)] flex items-start justify-between bg-gradient-to-b from-blue-500/5 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
              <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div>
              <h2 id="update-modal-title" className="text-lg font-bold">
                {t('updateModalTitle')}
              </h2>
              <p className="text-xs text-[var(--gd-text-secondary)] mt-0.5">
                {t('updateModalSubtitle', { version: updateInfo.latestVersion })}
                {updateInfo.assetSize > 0 && ` • ${formatSize(updateInfo.assetSize)}`}
              </p>
            </div>
          </div>

          {!downloading && !installing && (
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-[var(--gd-text-secondary)] hover:bg-[var(--gd-border)]/50 transition-colors"
              aria-label={t('cancel')}
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          )}
        </div>

        {/* Changelog Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 text-sm">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--gd-text-secondary)] mb-2.5">
              {t('updateChangelogTitle')}
            </h3>

            {changelog.length > 0 ? (
              <div className="space-y-2">
                {changelog.map((item, idx) => {
                  let badgeClass = 'bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/20';
                  let badgeText = item.type;

                  if (item.type === 'new') {
                    badgeClass = 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
                    badgeText = t('updateTypeNew');
                  } else if (item.type === 'fix') {
                    badgeClass = 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
                    badgeText = t('updateTypeFix');
                  } else if (item.type === 'improve') {
                    badgeClass = 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30';
                    badgeText = t('updateTypeImprove');
                  }

                  return (
                    <div key={idx} className="flex items-start gap-2.5 text-xs leading-relaxed">
                      {item.type !== 'other' ? (
                        <span className={`inline-flex px-1.5 py-0.5 text-[10px] font-semibold rounded-md border shrink-0 ${badgeClass}`}>
                          {badgeText}
                        </span>
                      ) : (
                        <span className="text-[var(--gd-text-secondary)] mt-1">•</span>
                      )}
                      <span className="text-[var(--gd-text)]">{item.text}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-[var(--gd-text-secondary)] whitespace-pre-line bg-[var(--gd-bg)] p-3 rounded-xl border border-[var(--gd-border)]">
                {updateInfo.releaseNotes || t('updateAvailable', { version: updateInfo.latestVersion })}
              </div>
            )}
          </div>

          {/* Progress Section */}
          {downloading && (
            <div className="p-3.5 bg-blue-500/5 rounded-xl border border-blue-500/20 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {t('updateDownloading', { percent: downloadProgress?.percent || 0 })}
                </span>
                {downloadProgress?.totalBytes > 0 && (
                  <span className="text-[var(--gd-text-secondary)]">
                    {formatSize(downloadProgress.downloadedBytes)} / {formatSize(downloadProgress.totalBytes)}
                  </span>
                )}
              </div>
              <div className="h-2 w-full bg-[var(--gd-border)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-200 ease-out"
                  style={{ width: `${Math.min(100, Math.max(0, downloadProgress?.percent || 0))}%` }}
                />
              </div>
            </div>
          )}

          {downloadedFilePath && !downloading && (
            <div className="p-3 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-xs font-medium">
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>{t('updateDownloaded')}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20 rounded-xl text-xs">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-[var(--gd-border)] bg-[var(--gd-bg)] flex flex-wrap items-center justify-between gap-2">
          <div>
            {!downloading && !downloadedFilePath && (
              <button
                type="button"
                onClick={handleSkip}
                className="text-xs text-[var(--gd-text-secondary)] hover:text-red-500 transition-colors cursor-pointer"
              >
                {t('updateModalSkipVersion')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!downloading && !installing && (
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium text-[var(--gd-text-secondary)] hover:bg-[var(--gd-border)]/50 rounded-xl transition-colors cursor-pointer"
              >
                {t('updateModalRemindLater')}
              </button>
            )}

            {downloadedFilePath ? (
              <button
                type="button"
                onClick={handleInstall}
                disabled={installing}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {installing ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
                <span>{isMac ? t('updateInstallMac') : t('updateInstallWin')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStartDownload}
                disabled={downloading || !updateInfo.downloadUrl}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {downloading ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
                <span>{t('updateDownload')}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
