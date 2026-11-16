'use client';

import Icon from './Icon';
import Modal from './Modal';

/**
 * Error Modal - GRC Cannot Be Cancelled Due to Stock Transfers
 * 
 * Displays when a GRC cannot be cancelled because its stock has been transferred.
 * Shows detailed transfer information to help user understand why.
 */
export default function GrcTransferBlockModal({
  open,
  grc,
  transfers = [],
  onClose,
}) {
  return (
    <Modal
      open={open}
      size="md"
      title="Cancellation Not Allowed"
      onClose={onClose}
      footer={
        <div className="flex w-full items-center justify-end">
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
          >
            CLOSE
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Error Icon & Message */}
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
            <Icon name="x" size={20} className="text-red-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-red-900">
              Cannot cancel this GRC
            </h3>
            <p className="mt-1 text-sm text-slate-700">
              Stock from this GRC has already been transferred. Please check the related stock transfer transactions.
            </p>
          </div>
        </div>

        {/* GRC Info */}
        {grc && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">GRC Number:</span>
              <span className="font-semibold text-slate-900">{grc.grcNumber || 'N/A'}</span>
            </div>
          </div>
        )}

        {/* Transfer Details */}
        {transfers && transfers.length > 0 && (
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Related Transfers Found ({transfers.length})
            </h4>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-3">
              {transfers.slice(0, 10).map((transfer, idx) => (
                <div
                  key={idx}
                  className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">
                      {transfer.type}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-600">
                      {transfer.refNo || 'N/A'}
                      {transfer.date && (
                        <span className="ml-2">
                          • {new Date(transfer.date).toLocaleDateString()}
                        </span>
                      )}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Transferred
                    </span>
                  </div>
                </div>
              ))}
              {transfers.length > 10 && (
                <p className="pt-2 text-center text-xs text-slate-500">
                  And {transfers.length - 10} more transfer(s)...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Help Message */}
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
          <div className="flex items-start gap-2">
            <Icon name="bell" size={16} className="mt-0.5 text-blue-600" />
            <p className="text-sm text-blue-800">
              To cancel this GRC, you must first reverse all related stock transfers. Contact your system administrator if you need assistance.
            </p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
