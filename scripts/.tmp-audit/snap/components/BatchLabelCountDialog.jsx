'use client';
import { useEffect, useRef, useState } from 'react';
import { validateBatchLabelCount, BATCH_NO_QUANTITY } from '@/lib/barcodeLabelPrint';

/* Print Batch Labels - asks how many stickers ONE batch barcode gets.

   A batch barcode stands for the whole received quantity, so how many
   stickers it needs is the operator's call, not something the system can
   infer. The answer is checked by validateBatchLabelCount - the same function
   the print count uses - so a number this dialog accepts is exactly the
   number that prints, and one it refuses never reaches the printer.

   The input is text with a numeric keypad rather than type="number": a
   number input hands back "" for "abc" and quietly accepts "2.5" or "1e3",
   so the operator's actual mistake would never be the one reported.

   no-print: this dialog is never paper, whichever way printing is started. */
export default function BatchLabelCountDialog({
  open,
  barcode = '',
  description = '',
  available = 0,
  initialValue = '',
  confirmLabel = 'Confirm',
  onCancel,
  onConfirm,
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const noQuantity = !(Number(available) > 0);

  useEffect(() => {
    if (!open) return;
    setValue(initialValue === undefined || initialValue === null ? '' : String(initialValue));
    setError(noQuantity ? BATCH_NO_QUANTITY : '');
  }, [open, barcode, initialValue, noQuantity]);

  /* Escape closes the dialog wherever focus happens to be. A handler on the
     dialog itself only hears keys pressed inside it, and when the input is
     disabled nothing inside can take focus - focus stays on the button that
     opened it, outside, and Escape would do nothing. */
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => { if (event.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  function confirm() {
    const check = validateBatchLabelCount(value, available);
    if (!check.ok) {
      setError(check.error);
      inputRef.current?.focus();
      return;
    }
    onConfirm?.(check.value);
  }

  return (
    <div
      className="no-print fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="batch-label-title"
    >
      <div className="w-full max-w-[420px] rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 id="batch-label-title" className="text-lg font-semibold">Print Batch Labels</h3>
          <button type="button" onClick={onCancel} className="text-2xl leading-none text-gray-500" aria-label="Close">×</button>
        </div>

        <form
          className="px-4 py-4"
          noValidate
          onSubmit={(event) => { event.preventDefault(); confirm(); }}
        >
          <p className="text-sm text-gray-700">How many barcode labels do you want to print?</p>
          {(barcode || description) && (
            <p className="mt-1 truncate text-xs text-gray-500">
              {/* normal-case: globals.css upper-cases body text, and a
                  barcode number is case-sensitive */}
              <span className="font-mono normal-case">{barcode}</span>
              {description ? ' · ' + description : ''}
            </p>
          )}

          <label htmlFor="batch-label-count" className="mt-3 block text-[11px] font-semibold text-gray-700">
            Number of labels to print *
          </label>
          <input
            id="batch-label-count"
            ref={inputRef}
            autoFocus
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={value}
            disabled={noQuantity}
            aria-invalid={Boolean(error)}
            aria-describedby="batch-label-available"
            onChange={(event) => { setValue(event.target.value); setError(''); }}
            className="mt-1 w-full rounded-md border border-gray-300 px-2 py-2 text-sm disabled:bg-gray-100"
          />
          <div id="batch-label-available" className="mt-1 text-xs text-gray-500">
            Maximum available quantity: {Number(available) > 0 ? available : 0}
          </div>
          {error && <div role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</div>}

          <div className="mt-4 flex justify-end gap-2">
            <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700">
              Cancel
            </button>
            <button
              type="submit"
              disabled={noQuantity}
              className="rounded-lg bg-[#0d5ddc] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0b4bb6] disabled:opacity-60"
            >
              {confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
