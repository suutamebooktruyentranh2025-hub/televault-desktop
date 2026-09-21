import React, { useState, useEffect, useCallback } from 'react';
import { SettingsField } from '../components/GDriveSharedSettings';

const STORAGE_KEY_CID = 'televault_gdrive_client_id';
const STORAGE_KEY_CSEC = 'televault_gdrive_client_secret';

export function GDriveAuthForm({
  t,
  initialClientId = '',
  initialClientSecret = '',
  // Also accept legacy prop names for backwards compatibility
  gdriveClientId,
  gdriveClientSecret,
  connectGDrive,
  connecting = false,
  authUrl = null,
  cancelConnect,
}) {
  const [clientId, setClientId] = useState(() => {
    const val = initialClientId || gdriveClientId;
    if (val) return val;
    try {
      return localStorage.getItem(STORAGE_KEY_CID) || '';
    } catch {
      return '';
    }
  });

  const [clientSecret, setClientSecret] = useState(() => {
    const val = initialClientSecret || gdriveClientSecret;
    if (val) return val;
    try {
      return localStorage.getItem(STORAGE_KEY_CSEC) || '';
    } catch {
      return '';
    }
  });

  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const val = initialClientId || gdriveClientId;
    if (val) {
      setClientId(val);
      try {
        localStorage.setItem(STORAGE_KEY_CID, val);
      } catch {}
    }
  }, [initialClientId, gdriveClientId]);

  useEffect(() => {
    const val = initialClientSecret || gdriveClientSecret;
    if (val) {
      setClientSecret(val);
      try {
        localStorage.setItem(STORAGE_KEY_CSEC, val);
      } catch {}
    }
  }, [initialClientSecret, gdriveClientSecret]);

  const handleClientIdChange = (e) => {
    const val = e.target.value;
    setClientId(val);
    try {
      if (val) localStorage.setItem(STORAGE_KEY_CID, val);
      else localStorage.removeItem(STORAGE_KEY_CID);
    } catch {}
  };

  const handleClientSecretChange = (e) => {
    const val = e.target.value;
    setClientSecret(val);
    try {
      if (val) localStorage.setItem(STORAGE_KEY_CSEC, val);
      else localStorage.removeItem(STORAGE_KEY_CSEC);
    } catch {}
  };

  const handleBlur = useCallback(() => {
    const cid = clientId.trim();
    const csec = clientSecret.trim();
    if (cid || csec) {
      void window.televault?.gdrive?.saveCredentials?.(cid, csec);
    }
  }, [clientId, clientSecret]);

  const handleClearSaved = useCallback(() => {
    setClientId('');
    setClientSecret('');
    try {
      localStorage.removeItem(STORAGE_KEY_CID);
      localStorage.removeItem(STORAGE_KEY_CSEC);
    } catch {}
    void window.televault?.gdrive?.saveCredentials?.('', '');
  }, []);

  const openExternal = useCallback((url) => {
    const api = window.televault?.shell;
    if (api?.openExternal) {
      void api.openExternal(url);
    } else {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const handleCopyLink = useCallback(async () => {
    if (!authUrl) return;
    try {
      await navigator.clipboard.writeText(authUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  }, [authUrl]);

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    const cid = clientId.trim();
    const csec = clientSecret.trim();
    if (!cid || !csec || connecting) return;
    try {
      localStorage.setItem(STORAGE_KEY_CID, cid);
      localStorage.setItem(STORAGE_KEY_CSEC, csec);
    } catch {}
    void window.televault?.gdrive?.saveCredentials?.(cid, csec);
    connectGDrive(cid, csec);
  }, [clientId, clientSecret, connecting, connectGDrive]);

  return (
    <>
      <details className="m-4 p-4 bg-gray-50 dark:bg-zinc-800 rounded-lg border border-gray-100 dark:border-zinc-700/50 text-xs">
        <summary className="cursor-pointer font-semibold text-[var(--gd-text)] select-none hover:underline">
          {t('gdriveSetupInstructionTitle')}
        </summary>
        <div className="mt-3 space-y-2 text-[var(--gd-text-secondary)]">
          <div>
            <strong>1. </strong>
            <button
              type="button"
              className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
              onClick={() => openExternal('https://console.cloud.google.com')}
            >
              {t('gdriveSetupInstructionStep1')}
            </button>
          </div>
          <div>
            <strong>2. </strong>
            <button
              type="button"
              className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
              onClick={() => openExternal('https://console.cloud.google.com/projectcreate')}
            >
              {t('gdriveSetupInstructionStep2')}
            </button>
          </div>
          <div>
            <strong>3. </strong>
            <button
              type="button"
              className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
              onClick={() => openExternal('https://console.cloud.google.com/apis/library')}
            >
              {t('gdriveSetupInstructionStep3')}
            </button>
          </div>
          <div>
            <strong>4. </strong>
            <button
              type="button"
              className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
              onClick={() => openExternal('https://console.cloud.google.com/apis/credentials/consent')}
            >
              {t('gdriveSetupInstructionStep4')}
            </button>
          </div>
          <div>
            <strong>5. </strong>
            <button
              type="button"
              className="text-[#0066cc] hover:underline font-medium inline-block text-left cursor-pointer"
              onClick={() => openExternal('https://console.cloud.google.com/apis/credentials')}
            >
              {t('gdriveSetupInstructionStep5')}
            </button>
          </div>
          <div>
            <strong>6. </strong>
            <span>{t('gdriveSetupInstructionStep6')}</span>
          </div>
          <div className="mt-4 p-2.5 bg-yellow-50 dark:bg-yellow-950/20 text-yellow-800 dark:text-yellow-200 rounded border border-yellow-200 dark:border-yellow-900/30 text-[11px] leading-relaxed">
            <strong>⚠️ {t('gdriveSetupWarningTitle')}</strong> {t('gdriveSetupWarningBody')}
          </div>
          <div className="mt-2 p-2.5 bg-blue-50 dark:bg-blue-950/10 text-blue-800 dark:text-blue-200 rounded border border-blue-200 dark:border-blue-900/20 text-[11px] leading-relaxed">
            <strong>ℹ️ {t('gdriveSetupLimitInfoTitle')}</strong> {t('gdriveSetupLimitInfoBody')}
          </div>
        </div>
      </details>

      <SettingsField title={t('gdriveClientId')}>
        <input
          type="text"
          className="w-full px-3 py-2 border border-[#79747e] rounded-lg text-sm bg-white dark:bg-[#1c1b1f] text-[var(--gd-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          style={{ minHeight: '38px' }}
          value={clientId}
          onChange={handleClientIdChange}
          onBlur={handleBlur}
          placeholder={t('gdriveAuthClientIdPlaceholder')}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={connecting}
        />
      </SettingsField>

      <SettingsField title={t('gdriveClientSecret')}>
        <input
          type="password"
          className="w-full px-3 py-2 border border-[#79747e] rounded-lg text-sm bg-white dark:bg-[#1c1b1f] text-[var(--gd-text)] focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
          style={{ minHeight: '38px' }}
          value={clientSecret}
          onChange={handleClientSecretChange}
          onBlur={handleBlur}
          placeholder={t('gdriveAuthClientSecretPlaceholder')}
          autoComplete="new-password"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={connecting}
        />
      </SettingsField>

      <div className="mx-4 mt-1 mb-2 flex items-center justify-between text-xs text-[var(--gd-text-secondary)]">
        <span className="flex items-center gap-1 opacity-80">
          🔒 {t('gdriveCredentialsSavedHint')}
        </span>
        {(clientId || clientSecret) && (
          <button
            type="button"
            onClick={handleClearSaved}
            className="text-gray-400 hover:text-red-500 hover:underline transition cursor-pointer text-xs ml-2 flex-shrink-0"
          >
            {t('gdriveClearSavedCredentials')}
          </button>
        )}
      </div>

      {connecting && (
        <div className="mx-4 my-3 p-4 rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/70 dark:bg-blue-950/20 text-[var(--gd-text)] space-y-3">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 animate-spin h-4 w-4 border-2 border-blue-600 border-t-transparent rounded-full flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-200">
                {t('gdriveAwaitingAuth')}
              </h4>
              <p className="text-xs text-blue-800/80 dark:text-blue-300/80 mt-0.5">
                {t('gdriveAwaitingAuthDesc')}
              </p>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-white/70 dark:bg-zinc-900/50 border border-blue-100 dark:border-blue-900/30 text-xs text-[var(--gd-text-secondary)] space-y-2">
            <p>
              💡 <strong>{t('gdriveAuthWrongProfileHint')}</strong>
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {authUrl && (
                <>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 hover:bg-blue-700 text-white transition flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    {copied ? '✓ ' + t('gdriveAuthUrlCopied') : '📋 ' + t('gdriveCopyAuthUrl')}
                  </button>
                  <button
                    type="button"
                    onClick={() => openExternal(authUrl)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md border border-blue-300 dark:border-blue-700 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 text-blue-800 dark:text-blue-200 transition cursor-pointer"
                  >
                    🌐 {t('gdriveReopenAuth')}
                  </button>
                </>
              )}
              {cancelConnect && (
                <button
                  type="button"
                  onClick={cancelConnect}
                  className="px-3 py-1.5 text-xs font-medium rounded-md border border-red-300 dark:border-red-800 hover:bg-red-100/50 dark:hover:bg-red-950/40 text-red-700 dark:text-red-300 transition cursor-pointer"
                >
                  ❌ {t('gdriveCancelAuth')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="p-4 flex justify-end gap-2">
        {connecting ? (
          cancelConnect && (
            <button
              type="button"
              className="gd-dialog-btn border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 px-4 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 transition"
              onClick={cancelConnect}
            >
              {t('gdriveCancelAuth')}
            </button>
          )
        ) : (
          <button
            type="button"
            className="gd-dialog-btn gd-dialog-btn--primary px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed transition"
            onClick={handleSubmit}
            disabled={!clientId.trim() || !clientSecret.trim()}
          >
            {t('gdriveConnect')}
          </button>
        )}
      </div>
    </>
  );
}
