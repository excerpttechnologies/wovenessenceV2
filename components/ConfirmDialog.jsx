'use client';

import Icon from './Icon';
import Modal from './Modal';

/* ==========================================================================
   Confirmation dialog, in place of window.confirm.

   The native one cannot say WHICH record is about to go, carries the page's
   origin in its title bar, and blocks the whole tab while it is up. This one
   takes the record's name, so the operator can tell a mis-click from the row
   they meant.

   `busy` keeps the dialog up while the request is in flight rather than
   closing on the click: a delete that fails - Business Masters refuses the
   main branch - has somewhere to report back to.
   ========================================================================== */
export default function ConfirmDialog({
  open,
  title = 'Delete this record?',
  message,
  recordName,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  tone = 'danger',
  busy = false,
  error,
  onConfirm,
  onCancel,
}) {
  return (
    <Modal
      open={open}
      size="sm"
      onClose={busy ? undefined : onCancel}
      closeOnBackdrop={!busy}
      footer={
        <>
          <button type="button" className="btn" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={'btn ' + (tone === 'danger' ? 'btn-danger' : 'btn-primary')}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? <span className="spin" /> : <Icon name="trash" size={14} />}
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="cfm">
        <span className={'cfm-ico ' + (tone === 'danger' ? 'cfm-ico-danger' : 'cfm-ico-brand')}>
          <Icon name="trash" size={20} />
        </span>

        <div className="min-w-0">
          <p className="cfm-title">{title}</p>

          {recordName && <p className="cfm-name">{recordName}</p>}

          <p className="cfm-msg">
            {message || 'This cannot be undone.'}
          </p>

          {error && <p className="cfm-err">{error}</p>}
        </div>
      </div>
    </Modal>
  );
}
