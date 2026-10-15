import React from 'react';
import { SettingsSelect } from '../../../components/SettingsSelect';
import { SettingsToggle } from '../components/GDriveSharedSettings';
import { IconFolder } from '../../../components/DriveIcons';

export function GDriveSettingsTab({
  t,
  syncTargetChatId,
  handleSyncTargetChange,
  syncTargets,
  gdrivePollInterval,
  handlePollIntervalChange,
  gdriveConflictPolicy,
  handleConflictPolicyChange,
  autoSyncAfterScan,
  handleAutoSyncAfterScanChange,
  handleSaveFilters,
  gdriveIgnoredExtensions,
  setGdriveIgnoredExtensions,
  gdriveAllowedExtensions,
  setGdriveAllowedExtensions,
  gdriveTempDir,
  setGdriveTempDir,
  showToast,
  setShowGDrivePicker,
  gdriveSubs,
  toggleSub,
  removeSub,
  disconnectGDrive,
}) {
  return (
    <div className="h-full overflow-y-auto p-5 space-y-5 text-[var(--gd-text)]">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--gd-border)]">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2 text-[var(--gd-text)]">
            <span className="text-lg">⚙️</span>
            <span>{t('gdriveConfigureTitle')}</span>
          </h2>
          <p className="text-xs text-[var(--gd-text-secondary)] mt-0.5">
            {t('gdriveConfigureSubtitle')}
          </p>
        </div>
      </div>

      {/* Grid container for settings cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Card 1: Mục tiêu & Chu kỳ đồng bộ */}
        <div className="rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface-elevated)] p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--gd-border)]/60">
              <span className="text-base">🎯</span>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--gd-text)]">
                {t('gdriveSyncTarget')}
              </h3>
            </div>

            <div className="space-y-3.5">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold text-[var(--gd-text)]">
                  {t('gdriveSyncTarget')}
                </label>
                <SettingsSelect
                  value={syncTargetChatId}
                  onChange={handleSyncTargetChange}
                  options={[
                    { value: '', label: t('gdriveSyncTargetPersonal') },
                    ...syncTargets
                      .filter((target) => !target.isPersonal)
                      .map((target) => ({
                        value: target.chatId,
                        label: target.label || target.chatId,
                      })),
                  ]}
                />
                <div className="text-[11px] text-[var(--gd-text-secondary)] leading-relaxed mt-1">
                  {t('gdriveSyncTargetHint')}
                </div>
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--gd-border)]/40">
                <label className="text-xs font-semibold text-[var(--gd-text)]">
                  {t('gdrivePollInterval')}
                </label>
                <SettingsSelect
                  value={String(gdrivePollInterval)}
                  onChange={handlePollIntervalChange}
                  options={[
                    { value: '60000', label: t('gdrivePollInterval1m') },
                    { value: '300000', label: t('gdrivePollInterval5m') },
                    { value: '900000', label: t('gdrivePollInterval15m') },
                    { value: '1800000', label: t('gdrivePollInterval30m') },
                    { value: '0', label: t('gdrivePollOff') },
                  ]}
                />
              </div>

              <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--gd-border)]/40">
                <label className="text-xs font-semibold text-[var(--gd-text)]">
                  {t('gdriveConflictPolicy')}
                </label>
                <SettingsSelect
                  value={gdriveConflictPolicy}
                  onChange={handleConflictPolicyChange}
                  options={[
                    { value: 'skip', label: t('gdriveConflictPolicySkip') },
                    { value: 'overwrite', label: t('gdriveConflictPolicyOverwrite') },
                    { value: 'keep_both', label: t('gdriveConflictPolicyKeepBoth') },
                  ]}
                />
              </div>
            </div>
          </div>

          <div className="mt-4 space-y-2.5 pt-3 border-t border-[var(--gd-border)]">

            <div className="flex items-start justify-between gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 p-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-[var(--gd-text)]">
                  {t('gdriveAutoSyncAfterScan')}
                </div>
                <div className="mt-0.5 text-[11px] leading-relaxed text-[var(--gd-text-secondary)]">
                  {t('gdriveAutoSyncAfterScanHint')}
                </div>
              </div>
              <SettingsToggle
                checked={autoSyncAfterScan}
                label={t('gdriveAutoSyncAfterScan')}
                onChange={handleAutoSyncAfterScanChange}
              />
            </div>
          </div>
        </div>

        {/* Card 2: Bộ lọc định dạng & Thư mục tạm */}
        <div className="rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface-elevated)] p-4 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--gd-border)]/60">
              <div className="flex items-center gap-2">
                <span className="text-base">🔍</span>
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--gd-text)]">
                  {t('gdriveFiltersTitle')}
                </h3>
              </div>
              <button
                type="button"
                className="text-xs px-2.5 py-1 rounded-md bg-[var(--gd-primary)] text-white hover:opacity-90 font-semibold cursor-pointer shadow-xs transition-opacity flex items-center gap-1"
                onClick={handleSaveFilters}
              >
                <span>💾</span>
                <span>{t('gdriveFiltersSaveBtn')}</span>
              </button>
            </div>

            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-[var(--gd-text)] mb-1">
                  {t('gdriveFiltersIgnoredLabel')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] placeholder:text-[var(--gd-text-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--gd-primary)]"
                  value={gdriveIgnoredExtensions}
                  onChange={(e) => setGdriveIgnoredExtensions(e.target.value)}
                  placeholder={t('gdriveFiltersIgnoredPlaceholder')}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--gd-text)] mb-1">
                  {t('gdriveFiltersAllowedLabel')}
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 text-xs rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] placeholder:text-[var(--gd-text-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--gd-primary)]"
                  value={gdriveAllowedExtensions}
                  onChange={(e) => setGdriveAllowedExtensions(e.target.value)}
                  placeholder={t('gdriveFiltersAllowedPlaceholder')}
                />
              </div>

              <div className="pt-2 border-t border-[var(--gd-border)]/40">
                <label className="block text-xs font-semibold text-[var(--gd-text)] mb-1">
                  {t('gdriveTempDirLabel')}
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="flex-1 px-3 py-2 text-xs rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-text)] placeholder:text-[var(--gd-text-secondary)]/50 focus:outline-none focus:ring-1 focus:ring-[var(--gd-primary)]"
                    value={gdriveTempDir}
                    onChange={(e) => setGdriveTempDir(e.target.value)}
                    onBlur={async () => {
                      const res = await window.televault?.gdrive?.setTempDir(gdriveTempDir);
                      if (res?.ok) showToast(t('gdriveTempDirSaved'));
                    }}
                    placeholder={t('gdriveTempDirPlaceholder')}
                  />
                  <button
                    type="button"
                    className="px-3 py-2 bg-[var(--gd-surface)] hover:bg-[var(--gd-border)]/20 border border-[var(--gd-border)] rounded-lg text-[var(--gd-text)] transition-colors flex items-center justify-center cursor-pointer"
                    onClick={async () => {
                      const res = await window.televault?.shell?.pickDirectory();
                      if (res?.ok && res.path) {
                        setGdriveTempDir(res.path);
                        const saveRes = await window.televault?.gdrive?.setTempDir(res.path);
                        if (saveRes?.ok) showToast(t('gdriveTempDirSaved'));
                      }
                    }}
                    title={t('gdriveBtnChooseFolder')}
                  >
                    <IconFolder className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Thư mục theo dõi (Subscriptions) */}
      <div className="rounded-xl border border-[var(--gd-border)] bg-[var(--gd-surface-elevated)] p-4 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-3 pb-2 border-b border-[var(--gd-border)]/60">
          <div className="flex items-center gap-2">
            <span className="text-base">📁</span>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--gd-text)]">
              {t('gdriveSubscriptions')}
            </h3>
            {gdriveSubs.length > 0 && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--gd-primary)]/10 text-[var(--gd-primary)] font-bold">
                {gdriveSubs.length}
              </span>
            )}
          </div>
          <button
            type="button"
            className="text-xs px-3 py-1.5 rounded-lg border border-[var(--gd-border)] bg-[var(--gd-surface)] text-[var(--gd-primary)] hover:bg-[var(--gd-primary)]/10 font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
            onClick={() => setShowGDrivePicker(true)}
          >
            <span>➕</span>
            <span>{t('gdriveAddFolder')}</span>
          </button>
        </div>

        {gdriveSubs.length === 0 ? (
          <div className="text-xs text-[var(--gd-text-secondary)] py-6 text-center">
            {t('gdriveNoSubs')}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
            {gdriveSubs.map((sub) => (
              <div
                key={sub.driveId}
                className="flex items-center justify-between p-2.5 bg-[var(--gd-surface)] rounded-lg border border-[var(--gd-border)] text-xs"
              >
                <div className="flex-1 min-w-0 pr-3">
                  <div className="font-semibold truncate flex items-center text-[var(--gd-text)]">
                    <span className="mr-1.5 shrink-0 opacity-80">
                      {sub.isFolder ? '📁' : '📄'}
                    </span>
                    <span className="truncate">{sub.drivePath}</span>
                  </div>
                  <div className="text-[10px] text-[var(--gd-text-secondary)] truncate mt-0.5">
                    {t('gdriveSubTarget', { path: sub.vaultPath })}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <SettingsToggle
                    checked={sub.enabled}
                    label=""
                    onChange={(enabled) => toggleSub(sub.driveId, enabled)}
                  />
                  <button
                    type="button"
                    className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors cursor-pointer text-xs"
                    onClick={() => removeSub(sub.driveId)}
                    title={t('gdriveSubRemoveTooltip')}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 4: Tài khoản & Ngắt kết nối */}
      <div className="rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-red-600 dark:text-red-400">
            {t('gdriveDisconnectTitle')}
          </div>
          <div className="text-[11px] text-[var(--gd-text-secondary)] mt-0.5">
            {t('gdriveDisconnectDesc')}
          </div>
        </div>
        <button
          type="button"
          className="text-xs px-3.5 py-2 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 rounded-lg font-semibold transition-all cursor-pointer"
          onClick={disconnectGDrive}
        >
          🔌 {t('gdriveDisconnect')}
        </button>
      </div>
    </div>
  );
}

export default GDriveSettingsTab;
