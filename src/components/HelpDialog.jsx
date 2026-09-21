import { useState, useEffect } from 'react';
import { useI18n } from '../context/I18nContext';

const TABS = [
  { id: 'vault', labelKey: 'helpTabVault', icon: '📁' },
  { id: 'gdrive', labelKey: 'helpTabGDrive', icon: '🔄' },
  { id: 'dashboard', labelKey: 'helpTabDashboard', icon: '📊' },
  { id: 'transfers', labelKey: 'helpTabTransfers', icon: '⚡' },
  { id: 'duplicates', labelKey: 'helpTabDuplicates', icon: '🔍' },
  { id: 'settings', labelKey: 'helpTabSettings', icon: '⚙️' },
  { id: 'shared-vault', labelKey: 'helpTabSharedVault', icon: '🌐' },
];

export function HelpDialog({ section = 'vault', onClose }) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(() => {
    const valid = TABS.map((t) => t.id);
    return valid.includes(section) ? section : 'vault';
  });

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const getHelpContent = () => {
    switch (activeTab) {
      case 'gdrive':
        return {
          title: t('helpGDriveTitle'),
          subtitle: t('helpGDriveSubtitle'),
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          ),
          items: [
            { icon: '🔐', title: t('helpGDriveItem1Title'), body: t('helpGDriveItem1Desc') },
            { icon: '🔁', title: t('helpGDriveItem2Title'), body: t('helpGDriveItem2Desc') },
            { icon: '⚡', title: t('helpGDriveItem3Title'), body: t('helpGDriveItem3Desc') },
            { icon: '⚙️', title: t('helpGDriveItem4Title'), body: t('helpGDriveItem4Desc') },
            { icon: '📋', title: t('helpGDriveItem5Title'), body: t('helpGDriveItem5Desc') },
          ],
          tip: t('helpGDriveTip'),
          note: t('helpGDriveNote'),
        };
      case 'dashboard':
        return {
          title: t('helpDashboardTitle'),
          subtitle: t('helpDashboardSubtitle'),
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="7" height="9" x="3" y="3" rx="1"/>
              <rect width="7" height="5" x="14" y="3" rx="1"/>
              <rect width="7" height="9" x="14" y="12" rx="1"/>
              <rect width="7" height="5" x="3" y="16" rx="1"/>
            </svg>
          ),
          items: [
            { icon: '📊', title: t('helpDashboardItem1Title'), body: t('helpDashboardItem1Desc') },
            { icon: '🥧', title: t('helpDashboardItem2Title'), body: t('helpDashboardItem2Desc') },
            { icon: '🏆', title: t('helpDashboardItem3Title'), body: t('helpDashboardItem3Desc') },
            { icon: '📈', title: t('helpDashboardItem4Title'), body: t('helpDashboardItem4Desc') },
          ],
          tip: t('helpDashboardTip'),
          note: t('helpDashboardNote'),
        };
      case 'transfers':
        return {
          title: t('helpTransfersTitle'),
          subtitle: t('helpTransfersSubtitle'),
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3v18"/>
              <path d="m21 7-4-4-4 4"/>
              <path d="M7 21V3"/>
              <path d="m3 17 4 4 4-4"/>
            </svg>
          ),
          items: [
            { icon: '⏱️', title: t('helpTransfersItem1Title'), body: t('helpTransfersItem1Desc') },
            { icon: '📑', title: t('helpTransfersItem2Title'), body: t('helpTransfersItem2Desc') },
            { icon: '⏯️', title: t('helpTransfersItem3Title'), body: t('helpTransfersItem3Desc') },
            { icon: '🔄', title: t('helpTransfersItem4Title'), body: t('helpTransfersItem4Desc') },
            { icon: '📂', title: t('helpTransfersItem5Title'), body: t('helpTransfersItem5Desc') },
          ],
          tip: t('helpTransfersTip'),
          note: t('helpTransfersNote'),
        };
      case 'duplicates':
        return {
          title: t('helpDuplicatesTitle'),
          subtitle: t('helpDuplicatesSubtitle'),
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="14" height="14" x="8" y="8" rx="2" ry="2"/>
              <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
            </svg>
          ),
          items: [
            { icon: '🔍', title: t('helpDuplicatesItem1Title'), body: t('helpDuplicatesItem1Desc') },
            { icon: '⚖️', title: t('helpDuplicatesItem2Title'), body: t('helpDuplicatesItem2Desc') },
            { icon: '🔎', title: t('helpDuplicatesItem3Title'), body: t('helpDuplicatesItem3Desc') },
            { icon: '🧹', title: t('helpDuplicatesItem4Title'), body: t('helpDuplicatesItem4Desc') },
          ],
          tip: t('helpDuplicatesTip'),
          note: t('helpDuplicatesNote'),
        };
      case 'settings':
        return {
          title: t('helpSettingsTitle'),
          subtitle: t('helpSettingsSubtitle'),
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          ),
          items: [
            { icon: '🎨', title: t('helpSettingsItem1Title'), body: t('helpSettingsItem1Desc') },
            { icon: '🚀', title: t('helpSettingsItem2Title'), body: t('helpSettingsItem2Desc') },
            { icon: '💾', title: t('helpSettingsItem3Title'), body: t('helpSettingsItem3Desc') },
            { icon: '📁', title: t('helpSettingsItem4Title'), body: t('helpSettingsItem4Desc') },
            { icon: '🔄', title: t('helpSettingsItem5Title'), body: t('helpSettingsItem5Desc') },
            { icon: '👤', title: t('helpSettingsItem6Title'), body: t('helpSettingsItem6Desc') },
          ],
          tip: t('helpSettingsTip'),
          note: t('helpSettingsNote'),
        };
      case 'shared-vault':
        return {
          title: t('helpSharedVaultTitle'),
          subtitle: t('helpSharedVaultSubtitle'),
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3"/>
              <circle cx="6" cy="12" r="3"/>
              <circle cx="18" cy="19" r="3"/>
              <line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/>
              <line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>
            </svg>
          ),
          items: [
            { icon: '🌐', title: t('helpSharedVaultItem1Title'), body: t('helpSharedVaultItem1Desc') },
            { icon: '🔒', title: t('helpSharedVaultItem2Title'), body: t('helpSharedVaultItem2Desc') },
            { icon: '👁️', title: t('helpSharedVaultItem3Title'), body: t('helpSharedVaultItem3Desc') },
            { icon: '📥', title: t('helpSharedVaultItem4Title'), body: t('helpSharedVaultItem4Desc') },
          ],
          tip: t('helpSharedVaultTip'),
          note: t('helpSharedVaultNote'),
        };
      case 'vault':
      default:
        return {
          title: t('helpVaultTitle'),
          subtitle: t('helpVaultSubtitle'),
          icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
            </svg>
          ),
          items: [
            { icon: '📁', title: t('helpVaultItem1Title'), body: t('helpVaultItem1Desc') },
            { icon: '📤', title: t('helpVaultItem2Title'), body: t('helpVaultItem2Desc') },
            { icon: '🖱️', title: t('helpVaultItem3Title'), body: t('helpVaultItem3Desc') },
            { icon: '👁️', title: t('helpVaultItem4Title'), body: t('helpVaultItem4Desc') },
            { icon: '🗑️', title: t('helpVaultItem5Title'), body: t('helpVaultItem5Desc') },
            { icon: '🏷️', title: t('helpVaultItem6Title'), body: t('helpVaultItem6Desc') },
          ],
          tip: t('helpVaultTip'),
          note: t('helpVaultNote'),
        };
    }
  };

  const content = getHelpContent();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-3xl mx-4 max-h-[88vh] flex flex-col bg-[var(--gd-surface)] rounded-2xl shadow-2xl border border-[var(--gd-border)] overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--gd-border)] bg-gradient-to-r from-[var(--gd-primary)]/5 to-transparent shrink-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--gd-primary)]/10 text-[var(--gd-primary)] shadow-sm">
              {content.icon}
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--gd-text)]">
                {content.title}
              </h2>
              {content.subtitle && (
                <p className="text-xs text-[var(--gd-text-secondary)] mt-0.5">
                  {content.subtitle}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--gd-text-secondary)] transition-colors hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-text)] cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Tab Pills Bar */}
        <div className="flex items-center gap-1.5 px-6 py-2.5 border-b border-[var(--gd-border)] bg-[var(--gd-surface)] overflow-x-auto shrink-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[var(--gd-primary)] text-white shadow-sm'
                    : 'text-[var(--gd-text-secondary)] hover:bg-[var(--gd-primary-light)] hover:text-[var(--gd-text)]'
                }`}
              >
                <span>{tab.icon}</span>
                <span>{t(tab.labelKey)}</span>
              </button>
            );
          })}
        </div>

        {/* Scrollable Body */}
        <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
          {/* Section 1: Key Features */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--gd-primary)] mb-3 flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[var(--gd-primary)]/10 text-xs">⭐</span>
              {t('helpSectionFeatures')}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {content.items.map((item, idx) => (
                <HelpFeatureCard
                  key={idx}
                  icon={item.icon}
                  title={item.title}
                  body={item.body}
                />
              ))}
            </div>
          </div>

          {/* Section 2: Pro Tips */}
          {content.tip && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 dark:bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">💡</span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 mb-1">
                    {t('helpSectionTips')}
                  </h4>
                  <p className="text-xs leading-relaxed text-[var(--gd-text)]">
                    {content.tip}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Section 3: Technical Notes */}
          {content.note && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 dark:bg-blue-500/10 p-4">
              <div className="flex items-start gap-3">
                <span className="text-xl shrink-0 mt-0.5">ℹ️</span>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 mb-1">
                    {t('helpSectionNotes')}
                  </h4>
                  <p className="text-xs leading-relaxed text-[var(--gd-text)]">
                    {content.note}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-[var(--gd-border)] bg-[var(--gd-surface)] flex justify-end shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium rounded-lg bg-[var(--gd-primary)] text-white transition-all hover:opacity-90 hover:shadow-md active:scale-[0.98] cursor-pointer"
          >
            {t('helpCloseBtn')}
          </button>
        </div>
      </div>
    </div>
  );
}

function HelpFeatureCard({ icon, title, body }) {
  return (
    <div className="rounded-xl border border-[var(--gd-border)] p-3.5 transition-colors hover:bg-[var(--gd-primary-light)]/20 bg-[var(--gd-surface)] flex flex-col justify-start">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base shrink-0">{icon}</span>
        <h4 className="text-xs font-semibold text-[var(--gd-text)] leading-tight">{title}</h4>
      </div>
      <p className="text-xs leading-relaxed text-[var(--gd-text-secondary)] pl-6">
        {body}
      </p>
    </div>
  );
}

