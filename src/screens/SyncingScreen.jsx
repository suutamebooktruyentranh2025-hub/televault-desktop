import { useI18n } from '../context/I18nContext';
import { IconDriveLogo } from '../components/DriveIcons';
import { UploadActivityPanel } from '../components/UploadActivityPanel';
import { useTransfers } from '../hooks/useTransfers';
import { formatWaitTime } from '../utils/format';


export function SyncingScreen({ scannedCount, floodWaitSec = 0 }) {
  const { t, locale } = useI18n();
  const transfers = useTransfers();
  const isVi = locale !== 'en';
  return (
    <div className="relative flex h-full overflow-y-auto flex-col items-center justify-center gap-4 bg-[var(--gd-bg)] px-6 py-8">
      <IconDriveLogo className="h-12 w-12" />
      <p className="text-lg font-normal text-[var(--gd-text)]">{t('syncingTitle')}</p>
      <p className="text-sm text-[var(--gd-text-secondary)]">
        {scannedCount > 0 ? t('syncingProgress', { n: scannedCount }) : t('syncingInitVault')}
      </p>
      {floodWaitSec > 0 && (
        <p className="text-sm text-amber-500">
          {t('syncingFloodWait', { n: formatWaitTime(floodWaitSec, isVi) })}
        </p>
      )}
      <UploadActivityPanel
        tasks={transfers.tasks}
        onClearFinished={() => void transfers.clearFinished()}
        onCancel={(id) => void transfers.cancel(id)}
        onRetry={(id) => void transfers.retry(id)}
        onResume={(id) => void transfers.resume(id)}
      />
    </div>
  );
}
