import { createPortal } from 'react-dom';
import { useI18n } from '../context/I18nContext';

export function ConfirmDialog({ message, onConfirm, onCancel }) {
  const { t } = useI18n();

  return createPortal(
    <div className="gd-dialog-backdrop" role="presentation" onMouseDown={onCancel}>
      <div
        className="gd-dialog"
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="gd-dialog-icon gd-dialog-icon--warning">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>
        <h3 className="gd-dialog-title">{t('confirmTitle')}</h3>
        <p className="gd-dialog-message">{message}</p>
        <div className="gd-dialog-actions">
          <button type="button" className="gd-dialog-btn" onClick={onCancel}>
            {t('cancel')}
          </button>
          <button type="button" className="gd-dialog-btn gd-dialog-btn--danger" onClick={onConfirm}>
            {t('confirmAction')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
