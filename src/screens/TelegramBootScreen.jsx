import { useI18n } from '../context/I18nContext';
import { IconDriveLogo } from '../components/DriveIcons';

export function TelegramBootScreen() {
  const { t } = useI18n();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-[var(--gd-bg)]">
      <IconDriveLogo className="h-12 w-12" />
      <p className="text-sm text-[var(--gd-text-secondary)]">{t('telegramBooting')}</p>
    </div>
  );
}
