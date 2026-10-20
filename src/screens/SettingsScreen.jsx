import { useCallback, useEffect, useState } from 'react';
import { IconFolder, IconLogout } from '../components/DriveIcons';
import { SettingsSelect } from '../components/SettingsSelect';
import { InitialSyncDialog } from '../components/InitialSyncDialog';
import { useI18n } from '../context/I18nContext';
import { useTheme } from '../context/ThemeContext';
import { useDialog } from '../context/DialogContext';
import { useToast } from '../context/ToastContext';
import { AdminContactLinks } from '../components/AdminContactLinks';
import { UpdateChecker } from '../components/updater/UpdateChecker';
import { ThemeCardPicker } from '../components/ThemeCardPicker';

const settingsApi = window.televault?.settings;
const sessionApi = window.televault?.session;
const backupApi = window.televault?.backup;

function SettingsToggle({ checked, onChange, label }) {
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

function SettingsCompactField({ caption, children }) {
  return (
    <div className="gd-settings-compact-field">
      <span className="gd-settings-field-caption">{caption}</span>
      {children}
    </div>
  );
}

function SettingsField({ title, hint, children }) {
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

function SettingsCollapsibleSection({
  id,
  title,
  children,
  defaultCollapsed = false,
  className = '',
}) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem(`televault_section_collapsed_${id}`);
      if (stored !== null) return stored === 'true';
    } catch {}
    return defaultCollapsed;
  });

  const toggle = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`televault_section_collapsed_${id}`, next ? 'true' : 'false');
      } catch {}
      return next;
    });
  };

  return (
    <section className={`gd-settings-group ${className}`}>
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        aria-expanded={!isCollapsed}
        className="w-full flex items-center gap-1.5 cursor-pointer select-none group py-1 mb-2 px-1 -mx-1 rounded-md hover:bg-[var(--gd-hover)]/40 transition-colors focus:outline-hidden"
      >
        <svg
          className={`w-3.5 h-3.5 text-[var(--gd-text-secondary)] group-hover:text-[var(--gd-primary)] transition-transform duration-200 shrink-0 ${
            isCollapsed ? '-rotate-90' : 'rotate-0'
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
        <h2 className="gd-settings-group-title !m-0 group-hover:text-[var(--gd-primary)] transition-colors">
          {title}
        </h2>
      </div>

      {!isCollapsed && children}
    </section>
  );
}

export function SettingsScreen({ account, onSignOut, onOpenUpdateModal }) {
  const { t, locale, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const { confirm } = useDialog();
  const { showToast } = useToast();
  const [appVersion, setAppVersion] = useState(() => {
    return typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '';
  });
  const [autoCheckUpdate, setAutoCheckUpdate] = useState(() => {
    return localStorage.getItem('televault_auto_check_update') !== 'false';
  });
  const [maxConcurrent, setMaxConcurrent] = useState(2);
  const [cacheGb, setCacheGb] = useState(2);
  const [autoResume, setAutoResume] = useState(true);
  const [saveAsDir, setSaveAsDir] = useState('');
  const [include_sessions, setIncludeSessions] = useState(false);
  const [backup_busy, setBackupBusy] = useState(false);

  const [syncFolder, setSyncFolder] = useState('');
  const [syncMode, setSyncMode] = useState('upload-only');
  const [syncEnabled, setSyncEnabled] = useState(false);
  const [syncVaultFolder, setSyncVaultFolder] = useState('/Sync/');
  const [showInitialSyncDialog, setShowInitialSyncDialog] = useState(false);
  const [initialSyncStats, setInitialSyncStats] = useState({ localCount: 0, remoteCount: 0 });

  const load = useCallback(async () => {
    const ver = (await window.televault?.updater?.getVersion?.()) || (await window.televault?.gdrive?.getAppVersion?.());
    if (ver) setAppVersion(ver);

    const result = await settingsApi?.get();
    if (result?.ok) {
      setMaxConcurrent(result.maxConcurrentTransfers || 2);
      setCacheGb(result.cacheLimitGb || 2);
      setAutoResume(result.autoResumeTransfers !== false);
      setSaveAsDir(result.saveAsDirectory || '');
    }
    const syncConfig = await window.televault?.sync?.getConfig();
    if (syncConfig?.ok) {
      setSyncFolder(syncConfig.syncFolder || '');
      setSyncMode(syncConfig.syncMode || 'upload-only');
      setSyncEnabled(syncConfig.syncEnabled || false);
      setSyncVaultFolder(syncConfig.syncVaultFolder || '/Sync/');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(partial) {
    await settingsApi?.set(partial);
  }

  async function pickSaveAsDir() {
    const result = await settingsApi?.pickSaveAsDirectory();
    if (result?.ok) setSaveAsDir(result.path || '');
  }

  async function pickSyncFolder() {
    const result = await window.televault?.sync?.pickFolder();
    if (result?.ok) {
      setSyncFolder(result.path || '');
      await window.televault?.sync?.setConfig({ syncFolder: result.path || '' });
    }
  }

  async function handleSyncToggle(enabled) {
    if (enabled) {
      if (!syncFolder) {
        alert(t('syncFolderNone'));
        return;
      }
      const stats = await window.televault?.sync?.getInitialCounts();
      if (stats?.ok && (stats.localCount > 0 || stats.remoteCount > 0)) {
        setInitialSyncStats({ localCount: stats.localCount, remoteCount: stats.remoteCount });
        setShowInitialSyncDialog(true);
      } else {
        setSyncEnabled(true);
        await window.televault?.sync?.setConfig({ syncEnabled: true });
        await window.televault?.sync?.start();
      }
    } else {
      setSyncEnabled(false);
      await window.televault?.sync?.setConfig({ syncEnabled: false });
      await window.televault?.sync?.stop();
    }
  }

  async function handleInitialSyncChoose(strategy) {
    setShowInitialSyncDialog(false);
    setSyncEnabled(true);
    await window.televault?.sync?.setConfig({ syncEnabled: true });
    await window.televault?.sync?.start();
    await window.televault?.sync?.runInitialSync(strategy);
  }

  async function saveSyncConfig(partial) {
    await window.televault?.sync?.setConfig(partial);
  }

  async function handleExportBackup() {
    if (backup_busy) return;
    setBackupBusy(true);
    try {
      const result = await backupApi?.export(include_sessions);
      if (result?.cancelled) return;
      if (!result?.ok) {
        showToast(t('settingsBackupError', { error: result?.error || t('errorGeneric') }), {
          variant: 'error',
        });
        return;
      }
      showToast(t('settingsBackupExportDone', { path: result.path }));
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleImportBackup() {
    if (backup_busy) return;
    if (!(await confirm(t('settingsBackupImportConfirm')))) return;
    setBackupBusy(true);
    try {
      const result = await backupApi?.import();
      if (result?.cancelled) return;
      if (!result?.ok) {
        showToast(t('settingsBackupError', { error: result?.error || t('errorGeneric') }), {
          variant: 'error',
        });
      }
      // Successful import relaunches the app.
    } finally {
      setBackupBusy(false);
    }
  }

  async function handleSignOutTelegram() {
    if (await confirm(t('signOutTelegramConfirm'))) {
      void sessionApi?.signOutTelegram();
    }
  }

  return (
    <div className="gd-settings flex min-h-0 flex-1 flex-col overflow-auto p-4">
      <SettingsCollapsibleSection
        id="appearance"
        title={t('settingsSectionAppearance')}
        className="gd-settings-group--appearance"
      >
        <div className="gd-settings-appearance-grid mb-3">
          <SettingsSelect
            value={locale}
            onChange={(v) => {
              setLocale(v);
              void save({ locale: v });
            }}
            options={[
              { value: 'vi', label: 'Tiếng Việt' },
              { value: 'en', label: 'English' },
            ]}
          />
          <SettingsSelect
            value={theme}
            onChange={(v) => {
              setTheme(v);
              void save({ theme: v });
            }}
            options={[
              { value: 'light', label: t('settingsThemeLight') },
              { value: 'dark', label: t('settingsThemeDark') },
            ]}
          />
        </div>
        <ThemeCardPicker />
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        id="storage"
        title={t('settingsSectionStorage')}
      >
        <div className="gd-settings-card">
          <SettingsField title={t('settingsAutoResume')}>
            <div className="gd-settings-toggle-row">
              <p className="gd-settings-row-hint">{t('settingsAutoResumeHint')}</p>
              <SettingsToggle
                checked={autoResume}
                label={t('settingsAutoResume')}
                onChange={(v) => {
                  setAutoResume(v);
                  void save({ autoResumeTransfers: v });
                }}
              />
            </div>
          </SettingsField>
          <SettingsField title={t('settingsConcurrent')}>
            <SettingsSelect
              value={String(maxConcurrent)}
              onChange={(v) => {
                const n = Number(v);
                setMaxConcurrent(n);
                void save({ maxConcurrentTransfers: n });
              }}
              options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </SettingsField>
          <SettingsField title={t('settingsCache')}>
            <SettingsSelect
              value={String(cacheGb)}
              onChange={(v) => {
                const n = Number(v);
                setCacheGb(n);
                void save({ cacheLimitGb: n });
              }}
              options={[1, 2, 5, 10].map((n) => ({ value: String(n), label: `${n} GB` }))}
            />
          </SettingsField>
          <SettingsField title={t('settingsSaveAs')}>
            <div className="gd-settings-path-row">
              <div className="gd-settings-path-field" title={saveAsDir || undefined}>
                {saveAsDir}
              </div>
              <button
                type="button"
                className="gd-settings-path-btn"
                onClick={() => void pickSaveAsDir()}
                aria-label={t('settingsSaveAsChoose')}
                title={t('settingsSaveAsChoose')}
              >
                <IconFolder className="h-5 w-5" />
              </button>
            </div>
          </SettingsField>
        </div>
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        id="backup"
        title={t('settingsSectionBackup')}
      >
        <div className="gd-settings-card">
          <SettingsField title={t('settingsSectionBackup')} hint={t('settingsBackupHint')}>
            <div className="flex flex-col gap-3">
              <label className="flex items-start gap-2 text-sm text-[var(--gd-text)]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={include_sessions}
                  onChange={(e) => setIncludeSessions(e.target.checked)}
                  disabled={backup_busy}
                />
                <span>
                  <span className="font-medium">{t('settingsBackupIncludeSessions')}</span>
                  <span className="mt-1 block text-xs text-[var(--gd-text-secondary)]">
                    {t('settingsBackupIncludeSessionsHint')}
                  </span>
                </span>
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-[var(--gd-border)] px-3 py-2 text-sm font-medium text-[var(--gd-text)] hover:bg-[var(--gd-hover)] disabled:opacity-50"
                  onClick={() => void handleExportBackup()}
                  disabled={backup_busy}
                >
                  {t('settingsBackupExport')}
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-[var(--gd-danger)] px-3 py-2 text-sm font-medium text-[var(--gd-danger)] hover:bg-[var(--gd-hover)] disabled:opacity-50"
                  onClick={() => void handleImportBackup()}
                  disabled={backup_busy}
                >
                  {t('settingsBackupImport')}
                </button>
              </div>
            </div>
          </SettingsField>
        </div>
      </SettingsCollapsibleSection>

      <SettingsCollapsibleSection
        id="sync"
        title={t('settingsSectionSync')}
      >
        <div className="gd-settings-card">
          <SettingsField title={t('syncFolder')}>
            <div className="gd-settings-path-row">
              <div className="gd-settings-path-field" title={syncFolder || undefined}>
                {syncFolder || t('syncFolderNone')}
              </div>
              <button
                type="button"
                className="gd-settings-path-btn"
                onClick={() => void pickSyncFolder()}
                aria-label={t('syncFolderChoose')}
                title={t('syncFolderChoose')}
              >
                <IconFolder className="h-5 w-5" />
              </button>
            </div>
          </SettingsField>

          <SettingsField title={t('syncMode')}>
            <SettingsSelect
              value={syncMode}
              onChange={(v) => {
                setSyncMode(v);
                void saveSyncConfig({ syncMode: v });
              }}
              options={[
                { value: 'upload-only', label: t('syncModeUploadOnly') },
                { value: 'two-way', label: t('syncModeTwoWay') },
              ]}
            />
          </SettingsField>

          <SettingsField title={t('syncEnabled')}>
            <div className="gd-settings-toggle-row">
              <p className="gd-settings-row-hint">{t('syncEnabledHint')}</p>
              <SettingsToggle
                checked={syncEnabled}
                label={t('syncEnabled')}
                onChange={(v) => void handleSyncToggle(v)}
              />
            </div>
          </SettingsField>

          <SettingsField title={t('syncVaultFolder')}>
            <input
              type="text"
              className="gd-settings-path-field px-3 py-2 w-full border border-[#79747e] rounded-lg dark:bg-[#1c1b1f] dark:text-[#e6e1e5] opacity-75 cursor-not-allowed"
              style={{ minHeight: '38px' }}
              value={syncVaultFolder}
              readOnly
            />
          </SettingsField>
        </div>
      </SettingsCollapsibleSection>

      <section className="gd-settings-group">
        <h2 className="gd-settings-group-title">{t('updateModalTitle')}</h2>
        <UpdateChecker
          currentVersion={appVersion}
          onOpenUpdateModal={onOpenUpdateModal}
          autoCheckEnabled={autoCheckUpdate}
          onToggleAutoCheck={(val) => {
            setAutoCheckUpdate(val);
            localStorage.setItem('televault_auto_check_update', val ? 'true' : 'false');
          }}
        />
      </section>

      <section className="gd-settings-group">
        <h2 className="gd-settings-group-title">{t('settingsSectionAccount')}</h2>
        <div className="gd-settings-card">
          <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 sm:p-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="gd-account-avatar shrink-0">
                {account?.name ? account.name.charAt(0).toUpperCase() : 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-sm text-[var(--gd-text)]">
                  {account?.name || t('defaultUserName')}
                </div>
                {account?.phone && (
                  <div className="truncate text-xs text-[var(--gd-text-secondary)] mt-0.5">
                    {account.phone}
                  </div>
                )}
                {account?.restrictionReason && (
                  <div className="truncate text-xs text-amber-500 mt-0.5">
                    {t('telegramRestricted')}: {account.restrictionReason}
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-red-600 dark:text-red-400 border border-red-500/30 hover:bg-red-500/10 rounded-lg shadow-xs transition-colors cursor-pointer shrink-0"
              onClick={() => void handleSignOutTelegram()}
            >
              <IconLogout className="h-4 w-4" />
              <span>{t('signOutTelegram')}</span>
            </button>
          </div>
        </div>
      </section>

      <section className="gd-settings-group">
        <h2 className="gd-settings-group-title">{t('contactAdminHeading')}</h2>
        <AdminContactLinks />
      </section>

      {showInitialSyncDialog && (
        <InitialSyncDialog
          localCount={initialSyncStats.localCount}
          remoteCount={initialSyncStats.remoteCount}
          onChoose={handleInitialSyncChoose}
          onCancel={() => setShowInitialSyncDialog(false)}
        />
      )}
    </div>
  );
}
