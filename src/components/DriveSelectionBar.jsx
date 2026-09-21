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
}) {
  const { t } = useI18n();

  return (
    <div className="gd-selection-bar">
      <button
        type="button"
        className="gd-selection-clear"
        onClick={onClear}
        aria-label={t('cancel')}
        disabled={deleteForeverBusy}
      >
        <IconClose className="h-5 w-5" />
      </button>
      <span className="gd-selection-count">
        {deleteForeverBusy ? t('deleteForeverProgress') : t('selectedCount', { n: count })}
      </span>
      <div className="gd-selection-actions">
        {isTrash ? (
          <>
            {!readonly && (
              <>
                <SelectionAction
                  label={t('restore')}
                  onClick={onRestore}
                  disabled={deleteForeverBusy}
                >
                  <IconRestore className="h-5 w-5" />
                </SelectionAction>
                <SelectionAction
                  label={t('deleteForever')}
                  onClick={onDeleteForever}
                  disabled={deleteForeverBusy}
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
            <SelectionAction label={t('download')} onClick={onDownload} disabled={!canDownload}>
              <IconDownload className="h-5 w-5" />
            </SelectionAction>
            {!readonly && (
              <>
                <SelectionAction label={t('move')} onClick={onMove}>
                  <IconMoveTo className="h-5 w-5" />
                </SelectionAction>
                <SelectionAction label={t('trash')} onClick={onTrash}>
                  <IconTrash className="h-5 w-5" />
                </SelectionAction>
              </>
            )}
          </>
        )}
        {!readonly && onMore && (
          <SelectionAction label={t('moreActions')} onClick={onMore} disabled={deleteForeverBusy}>
            <IconMoreVert className="h-5 w-5" />
          </SelectionAction>
        )}
      </div>
    </div>
  );
}
