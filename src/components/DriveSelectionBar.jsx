import { useI18n } from '../context/I18nContext';
import {
  IconClose,
  IconDeleteForever,
  IconDownload,
  IconMoveTo,
  IconMoreVert,
  IconRestore,
  IconTrash,
} from './DriveIcons';

function SelectionAction({ label, onClick, disabled, children }) {
  return (
    <button
      type="button"
      title={label}
      disabled={disabled}
      onClick={(e) => onClick?.(e)}
      className="gd-selection-action"
    >
      {children}
    </button>
  );
}

export function DriveSelectionBar({
  count,
  isTrash,
  canDownload,
  onClear,
  onDownload,
  onMove,
  onTrash,
  onRestore,
  onDeleteForever,
  onMore,
  readonly = false,
  deleteForeverBusy = false,
  deleteProgress = null,
  trashBusy = false,
  trashProgress = null,
}) {
  const { t } = useI18n();

  const isBusy = deleteForeverBusy || trashBusy;

  let progressText = t('selectedCount', { n: count });
  let progressPercent = 0;

  if (deleteForeverBusy) {
    if (deleteProgress?.total) {
      progressPercent = deleteProgress.percent || 0;
      progressText = t('deleteForeverProgressCount', {
        done: deleteProgress.done,
        total: deleteProgress.total,
        percent: deleteProgress.percent,
      });
    } else {
      progressText = t('deleteForeverProgress');
    }
  } else if (trashBusy) {
    if (trashProgress?.total) {
      progressPercent = trashProgress.percent || 0;
      progressText = t('trashProgressCount', {
        done: trashProgress.done,
        total: trashProgress.total,
        percent: trashProgress.percent,
      });
    } else {
      progressText = t('trashProgress');
    }
  }

  return (
    <div className="gd-selection-bar relative overflow-hidden">
      <button
        type="button"
        className="gd-selection-clear"
        onClick={onClear}
        aria-label={t('cancel')}
        disabled={isBusy}
      >
        <IconClose className="h-5 w-5" />
      </button>
      <span className="gd-selection-count">
        {progressText}
      </span>
      <div className="gd-selection-actions">
        {isTrash ? (
          <>
            {!readonly && (
              <>
                <SelectionAction
                  label={t('restore')}
                  onClick={onRestore}
                  disabled={isBusy}
                >
                  <IconRestore className="h-5 w-5" />
                </SelectionAction>
                <SelectionAction
                  label={t('deleteForever')}
                  onClick={onDeleteForever}
                  disabled={isBusy}
                >
                  {deleteForeverBusy ? (
                    <span
                      className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
                      role="status"
                      aria-label={t('deleteForeverProgress')}
                    />
                  ) : (
                    <IconDeleteForever className="h-5 w-5" />
                  )}
                </SelectionAction>
              </>
            )}
          </>
        ) : (
          <>
            <SelectionAction label={t('download')} onClick={onDownload} disabled={!canDownload || isBusy}>
              <IconDownload className="h-5 w-5" />
            </SelectionAction>
            {!readonly && (
              <>
                <SelectionAction label={t('move')} onClick={onMove} disabled={isBusy}>
                  <IconMoveTo className="h-5 w-5" />
                </SelectionAction>
                <SelectionAction label={t('trash')} onClick={onTrash} disabled={isBusy}>
                  {trashBusy ? (
                    <span
                      className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent"
                      role="status"
                      aria-label={t('trashProgress')}
                    />
                  ) : (
                    <IconTrash className="h-5 w-5" />
                  )}
                </SelectionAction>
              </>
            )}
          </>
        )}
        {!readonly && onMore && (
          <SelectionAction label={t('moreActions')} onClick={onMore} disabled={isBusy}>
            <IconMoreVert className="h-5 w-5" />
          </SelectionAction>
        )}
      </div>
      {isBusy && progressPercent > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-[var(--gd-border)] overflow-hidden rounded-b-[24px]">
          <div
            className="h-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}
          />
        </div>
      )}
    </div>
  );
}
