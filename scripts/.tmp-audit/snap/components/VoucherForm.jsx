'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import MultiSelect from './MultiSelect';
import { useScope } from './ScopeContext';
import { totalsOf, num, money } from '@/app/admin/voucher/fields';

/* ==========================================================================
   Add Voucher - one dialog for Receipt, Payment and Contra.

   The three differ only in wording and which side each row posts to, and
   that all lives in the spec (app/admin/voucher/fields.js). So this renders
   whatever the spec describes rather than being written three times.

   Each row has ONE editable amount cell, on its own side. The user never
   picks Dr or Cr: a receipt credits the customer and debits the bank because
   that is what a receipt is. The server applies the same rule again from the
   same spec, so a crafted request cannot flip a side.
   ========================================================================== */

const today = () => new Date().toISOString().slice(0, 10);

/* one dropdown, with its own option list - each row's list depends on its
   role, so they cannot share a single fetch */
function LedgerCell({ spec, row, onPick, disabled }) {
  const scope = useScope();
  const [options, setOptions] = useState([]);
  const [loading, setLoading] = useState(false);

  const key = row.role + ':' + (row.settingSide || '') + ':' + (row.anyLedger ? 'any' : '');

  useEffect(() => {
    let off = false;
    setLoading(true);
    const qs = new URLSearchParams({
      type: String(spec.type).toLowerCase(),
      side: row.settingSide || 'dr',
      business: scope.business || '',
      ...(row.anyLedger ? { any: '1' } : {}),
    });
    fetch('/api/voucher/ledgers?' + qs)
      .then((r) => r.json())
      .then((d) => { if (!off) setOptions(d.options || []); })
      .catch(() => { if (!off) setOptions([]); })
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [key, spec.type, scope.business, row.settingSide, row.anyLedger]);

  return (
    <MultiSelect
      mode="single"
      options={options}
      loading={loading}
      value={row.ledgerId || ''}
      placeholder={row.placeholder || 'Select...'}
      disabled={disabled}
      onChange={(v) => {
        const hit = options.find((o) => o.value === v);
        onPick(v, hit?.label || '', hit?.balance ?? 0);
      }}
    />
  );
}

export default function VoucherForm({ spec, onClose, onDone }) {
  const scope = useScope();

  const blank = useCallback(
    (r) => ({
      role: r.role,
      side: r.side,
      settingSide: r.settingSide,
      placeholder: r.placeholder,
      badge: r.badge,
      badgeTone: r.badgeTone,
      removable: r.removable,
      adjust: r.adjust,
      anyLedger: r.anyLedger,
      ledgerId: '', ledgerName: '', balance: 0, amount: '', remark: '',
    }),
    []
  );

  const [voucherDate, setVoucherDate] = useState(today);
  const [remark, setRemark] = useState('');
  const [rows, setRows] = useState(() => spec.roles.map(blank));
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (i, patch) =>
    setRows((prev) => prev.map((r, ri) => (ri === i ? { ...r, ...patch } : r)));

  const addRow = () => {
    const r = spec.roles.find((x) => x.role === spec.addRowRole);
    if (r) setRows((prev) => [...prev, blank({ ...r, removable: true })]);
  };

  const addExtra = () => {
    if (!spec.extraRow) return;
    setRows((prev) => [...prev, blank(spec.extraRow)]);
  };

  const drop = (i) => setRows((prev) => prev.filter((_, ri) => ri !== i));

  /* totals are computed from the same helper the server uses, so the number
     on screen and the number that has to balance are the same number */
  const totals = useMemo(
    () => totalsOf(rows.map((r) => ({
      debit: r.side === 'debit' ? num(r.amount) : 0,
      credit: r.side === 'credit' ? num(r.amount) : 0,
    }))),
    [rows]
  );

  async function submit() {
    setBusy(true);
    setErr('');
    try {
      const r = await fetch('/api/voucher', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: spec.type,
          voucherDate,
          remark,
          lines: rows.map((x) => ({
            ledgerId: x.ledgerId,
            ledgerName: x.ledgerName,
            role: x.role,
            amount: num(x.amount),
            remark: x.remark,
          })),
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error || Object.values(d.errors || {})[0] || 'Could not save the voucher.');
        return;
      }
      onDone(d);
    } finally {
      setBusy(false);
    }
  }

  /* which of the two amount columns this row types into */
  const isDebitCol = (r) => r.side === 'debit';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/45 p-4 pt-10"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[1090px] rounded-lg bg-white shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-line px-5 py-3">
          <span className="text-[16px] font-bold">{spec.addTitle}</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e0342c] text-white"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="px-5 py-4">
          {err && <div className="flash flash-err">{err}</div>}

          {/* -------------------------------------------- date + remark */}
          <div className="grid grid-cols-1 gap-4 rounded border border-line bg-[#f7f9fc] p-3 md:grid-cols-3">
            <div>
              <label className="f-label">Voucher Date<span className="f-req">*</span></label>
              <input
                type="date"
                className="f-input"
                value={voucherDate}
                onChange={(e) => setVoucherDate(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="f-label">Global Remark</label>
              <input
                className="f-input"
                placeholder={
                  spec.type === 'Contra'
                    ? 'Optional voucher remarks (e.g. cash deposit to bank)...'
                    : 'Optional voucher remarks...'
                }
                value={remark}
                onChange={(e) => setRemark(e.target.value)}
              />
            </div>
          </div>

          {/* ---------------------------------------------------- info */}
          {spec.info && (
            <div className="mt-3 flex gap-2 rounded border border-[#cfe0f5] bg-[#f2f7fd] px-3 py-2.5 text-[12.5px] text-cell">
              <span className="shrink-0 text-brand-link"><Icon name="eye" size={15} /></span>
              <span>{spec.info}</span>
            </div>
          )}

          {/* ---------------------------------------------------- grid */}
          <div className="mt-3 overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>{spec.columns.map((c) => <th key={c}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td style={{ minWidth: 250 }}>
                      <div className="flex items-center gap-1.5">
                        <span className="min-w-0 flex-1">
                          <LedgerCell
                            spec={spec}
                            row={r}
                            onPick={(ledgerId, ledgerName, balance) =>
                              set(i, { ledgerId, ledgerName, balance })}
                          />
                        </span>
                        {r.badge && (
                          <span
                            className={
                              'shrink-0 rounded px-1.5 py-1 text-[11px] font-semibold '
                              + (r.badgeTone === 'green' ? 'bg-okgreenbg text-okgreen'
                                : r.badgeTone === 'red' ? 'bg-[#fdeceb] text-danger'
                                  : 'bg-[#e3f4f7] text-[#17708a]')
                            }
                          >
                            {r.badge}
                          </span>
                        )}
                        {r.adjust && (
                          <button
                            type="button"
                            disabled
                            title="Allocating a voucher against open invoices is not built yet"
                            className="shrink-0 rounded border border-linestrong bg-[#eff2f7] px-2 py-1 text-[11px] text-inkmuted"
                          >
                            <Icon name="file" size={11} /> Adjust
                          </button>
                        )}
                      </div>
                    </td>

                    <td style={{ width: 120 }}>
                      <input
                        className="f-input h-8 bg-[#eff2f7] text-inkmuted"
                        value={money(r.balance)}
                        readOnly
                        tabIndex={-1}
                      />
                    </td>

                    {/* the two amount columns, in the order this type lists
                        them - only the row's own side is editable */}
                    {spec.columns.slice(2, 4).map((col) => {
                      const colIsDebit = col.toLowerCase() === 'debit';
                      const mine = colIsDebit === isDebitCol(r);
                      return (
                        <td key={col} style={{ width: 130 }}>
                          {mine ? (
                            <input
                              type="number" min="0" step="0.01"
                              className="f-input h-8"
                              value={r.amount}
                              onWheel={(e) => e.currentTarget.blur()}
                              onChange={(e) => set(i, { amount: e.target.value })}
                            />
                          ) : null}
                        </td>
                      );
                    })}

                    <td style={{ minWidth: 180 }}>
                      <input
                        className="f-input h-8"
                        placeholder={spec.type === 'Contra' ? 'Line remark (optional)' : 'This is the Remark'}
                        value={r.remark}
                        onChange={(e) => set(i, { remark: e.target.value })}
                      />
                    </td>

                    <td style={{ width: 100 }}>
                      {r.removable && rows.length > 2 && (
                        <button
                          type="button"
                          className="rounded bg-danger px-3 py-1.5 text-[12px] text-white"
                          onClick={() => drop(i)}
                        >
                          Remove
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                <tr className="bg-[#f7f9fc] font-semibold">
                  <td colSpan={2} className="text-right">Total</td>
                  <td className="text-right">
                    {money(spec.columns[2].toLowerCase() === 'debit' ? totals.totalDebit : totals.totalCredit)}
                  </td>
                  <td className="text-right">
                    {money(spec.columns[3].toLowerCase() === 'debit' ? totals.totalDebit : totals.totalCredit)}
                  </td>
                  <td colSpan={2}>
                    {!totals.balanced && totals.totalDebit + totals.totalCredit > 0 && (
                      <span className="text-[12px] text-danger">
                        Out by {money(Math.abs(totals.difference))}
                      </span>
                    )}
                    {totals.balanced && (
                      <span className="text-[12px] text-okgreen">Balanced</span>
                    )}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* -------------------------------------------------- actions */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary" onClick={addRow}>
              {spec.addRowLabel}
            </button>
            {spec.extraRow && (
              <button
                type="button"
                className="btn border-brand-link text-brand-link"
                onClick={addExtra}
              >
                {spec.extraRow.label}
              </button>
            )}
            <span className="flex-1" />

            {/* Why Submit is off, in words. The figure in the Total row is
                easy to miss, and a disabled button with no stated reason
                just reads as broken. */}
            {!totals.balanced && (
              <span className="text-[12.5px] text-danger">
                {totals.totalDebit + totals.totalCredit === 0
                  ? 'Enter an amount on both sides.'
                  : (totals.difference < 0 ? 'Debit' : 'Credit')
                    + ' is short by ' + money(Math.abs(totals.difference))
                    + ' - the two sides must match.'}
              </span>
            )}

            <button
              type="button"
              className={
                'btn ' + (busy || !totals.balanced
                  ? 'cursor-not-allowed border-linestrong bg-[#e3e8f0] font-bold text-inkmuted'
                  : 'btn-primary')
              }
              onClick={submit}
              disabled={busy || !totals.balanced}
              title={!totals.balanced ? 'Debit and credit must match before this can be saved' : ''}
            >
              {busy ? <span className="spin" /> : <Icon name="save" size={14} />} {spec.submitLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
