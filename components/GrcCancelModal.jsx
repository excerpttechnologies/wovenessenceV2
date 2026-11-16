'use client';

import Icon from './Icon';
import Modal from './Modal';

/**
 * Professional GRC Cancellation/Delete Confirmation Modal
 * 
 * Shows GRC details and clear warning before cancellation.
 * Used for both CANCEL (non-latest) and DELETE (latest) operations.
 */
export default function GrcCancelModal({
  open,
  grc,
  operation = 'cancel', // 'cancel' or 'delete'
  busy = false,
  error,
  onConfirm,
  onCancel,
}) {
  const isDelete = operation === 'delete';
  const title = isDelete ? 'Confirm GRC Deletion' : 'Confirm GRC Cancellation';
  const actionLabel = isDelete ? 'DELETE GRC' : 'CONFIRM CANCELLATION';
  const actionVerb = isDelete ? 'deleted' : 'cancelled';
  
  return (
    <Modal
      open={open}
      size="md"
      onClose={busy ? undefined : onCancel}
      closeOnBackdrop={!busy}
      footer={
        <div className="flex w-full items-center justify-end gap-3">
          <button
            type="button"
            className="btn"
            onClick={onCancel}
            disabled={busy}
          >
            GO BACK
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? (
              <span className="spin" />
            ) : (
              <Icon name={isDelete ? 'trash' : 'x'} size={14} />
            )}
            {actionLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Warning Icon & Title */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Icon name="trash" size={20} className="text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">
              Are you sure you want to {operation} this GRC? Its related stock entries and accounting entries will be reversed.
            </p>
          </div>
        </div>

        {/* GRC Details Card */}
        {grc && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              GRC Details
            </h4>
            <div className="grid gap-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-600">GRC Number:</span>
                <span className="font-semibold text-slate-900">{grc.grcNumber || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Vendor Name:</span>
                <span className="font-semibold text-slate-900">{grc.supplierName || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">GRC Date:</span>
                <span className="font-semibold text-slate-900">
                  {grc.grcDate ? new Date(grc.grcDate).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              {grc.totalQuantity && (
                <div className="flex justify-between">
                  <span className="text-slate-600">Total Quantity:</span>
                  <span className="font-semibold text-slate-900">{grc.totalQuantity}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Warning Message */}
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-start gap-2">
            <Icon name="bell" size={16} className="mt-0.5 text-amber-600" />
            <p className="text-sm text-amber-800">
              <strong>Warning:</strong> This action cannot be undone. The GRC will be {actionVerb} and all related transactions will be reversed.
            </p>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <Icon name="x" size={16} className="mt-0.5 text-red-600" />
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
