'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import { useOptions } from '@/components/useOptions';

/* ==========================================================================
   MANUAL JOURNAL ENTRY.

   A journal is two or more lines whose debits equal their credits. This form
   shows that equality as you type, in paise, so "0.1 + 0.2" cannot look
   balanced when it is not - and the server checks the same thing again, in
   the same unit, before it writes anything (lib/accounting/journal.js).

   The date is not free: it must fall inside the financial year on the top
   bar. Moving a journal into another year is a different decision, made by
   changing the year in the top bar, not by typing a date that does not belong
   to the books on screen.
   ========================================================================== */

const toPaise = (value) => Math.round((Number(value) || 0) * 100);
const money = (paise) => (Math.round(paise) / 100).toFixed(2);

const blankLine = () => ({ accountId: '', debit: '', credit: '', narration: '' });

const today = () => {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

export default function JournalEntryForm() {
  const router = useRouter();
  const scope = useScope();
  const { options, loading: accountsLoading, error: accountsError } = useOptions('accounts');

  const [header, setHeader] = useState({
    journalDate: today(),
    referenceNo: '',
    narration: '',
  });
  const [lines, setLines] = useState(() => [blankLine(), blankLine()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [problems, setProblems] = useState([]);

  const totals = useMemo(() => {
    const debit = lines.reduce((sum, line) => sum + toPaise(line.debit), 0);
    const credit = lines.reduce((sum, line) => sum + toPaise(line.credit), 0);
    return { debit, credit, difference: debit - credit };
  }, [lines]);

  const setLine = (index, key, value) => setLines((rows) => rows.map((row, i) => {
    if (i !== index) return row;
    /* one side per line: typing a debit clears the credit on that row */
    if (key === 'debit' && toPaise(value) > 0) return { ...row, debit: value, credit: '' };
    if (key === 'credit' && toPaise(value) > 0) return { ...row, credit: value, debit: '' };
    return { ...row, [key]: value };
  }));

  const addLine = () => setLines((rows) => [...rows, blankLine()]);
  const dropLine = (index) => setLines((rows) => (rows.length <= 2
    ? rows
    : rows.filter((_, i) => i !== index)));

  function localProblems() {
    const list = [];
    if (!scope.business) list.push('Select a business in the top bar.');
    if (!header.journalDate) list.push('Choose a journal date.');
    const filled = lines.filter((line) => line.accountId || toPaise(line.debit) || toPaise(line.credit));
    if (filled.length < 2) list.push('A journal needs at least two lines.');
    lines.forEach((line, index) => {
      const hasMoney = toPaise(line.debit) || toPaise(line.credit);
      if (!line.accountId && hasMoney) list.push('Line ' + (index + 1) + ': choose an account.');
      if (line.accountId && !hasMoney) list.push('Line ' + (index + 1) + ': enter a debit or a credit.');
      if (toPaise(line.debit) && toPaise(line.credit)) {
        list.push('Line ' + (index + 1) + ': a line cannot carry both a debit and a credit.');
      }
    });
    if (totals.difference !== 0) {
      list.push('Total debit (' + money(totals.debit) + ') must equal total credit ('
        + money(totals.credit) + '). The difference is ' + money(Math.abs(totals.difference)) + '.');
    }
    return list;
  }

  async function submit() {
    const found = localProblems();
    if (found.length) {
      setProblems(found);
      setError('Please correct the journal before posting.');
      return;
    }

    setSaving(true);
    setError('');
    setProblems([]);
    try {
      const r = await fetch('/api/accounting/journals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: {
            journalDate: header.journalDate,
            referenceNo: header.referenceNo,
            narration: header.narration,
            lines: lines
              .filter((line) => line.accountId || toPaise(line.debit) || toPaise(line.credit))
              .map((line) => ({
                accountId: line.accountId,
                debit: toPaise(line.debit) / 100,
                credit: toPaise(line.credit) / 100,
                narration: line.narration,
              })),
          },
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
        }),
      });
      const d = await r.json().catch(() => ({}));

      if (r.status === 422) {
        setProblems(d.problems || [d.error || 'That journal cannot be posted.']);
        setError(d.error || 'Please correct the journal before posting.');
        return;
      }
      if (!r.ok) {
        setError(d.error || 'Could not post that journal.');
        return;
      }

      router.push('/admin/accounting/journal');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card form-card">
      <div className="card-head">
        <span className="card-title">New Journal Entry</span>
        <span className="flex-1" />
        <button
          type="button"
          className="btn border-danger bg-danger text-white hover:border-[#9f1d17] hover:bg-[#9f1d17]"
          title="Close"
          aria-label="Close"
          onClick={() => router.push('/admin/accounting/journal')}
        >
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="card-body">
        {error && <div className="flash flash-err">{error}</div>}
        {problems.length > 0 && (
          <ul className="mb-3 list-disc pl-5 text-[13px] text-danger">
            {problems.map((problem) => <li key={problem}>{problem}</li>)}
          </ul>
        )}
        {accountsError && (
          <div className="flash flash-err">Could not load the chart of accounts. {accountsError}</div>
        )}

        <div className="form-rows">
          <div>
            <label className="mb-[5px] block text-[13px] text-ink">
              Journal Date<span className="f-req">*</span>
            </label>
            <input
              type="date"
              className="f-input"
              value={header.journalDate}
              onChange={(e) => setHeader((h) => ({ ...h, journalDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="mb-[5px] block text-[13px] text-ink">Reference No</label>
            <input
              type="text"
              className="f-input"
              placeholder="e.g. JV/26/001"
              value={header.referenceNo}
              onChange={(e) => setHeader((h) => ({ ...h, referenceNo: e.target.value }))}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-[5px] block text-[13px] text-ink">Narration</label>
            <input
              type="text"
              className="f-input"
              placeholder="What this journal records"
              value={header.narration}
              onChange={(e) => setHeader((h) => ({ ...h, narration: e.target.value }))}
            />
          </div>
        </div>

        <div className="form-section mt-4">
          <div className="form-section-title">Journal Lines</div>
          <div className="overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th>Account</th>
                  <th className="text-right">Debit</th>
                  <th className="text-right">Credit</th>
                  <th>Line Narration</th>
                  <th style={{ width: 52 }} />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => (
                  <tr key={index}>
                    <td className="min-w-[260px]">
                      <select
                        className="f-input"
                        value={line.accountId}
                        onChange={(e) => setLine(index, 'accountId', e.target.value)}
                      >
                        <option value="">{accountsLoading ? 'Loading accounts...' : 'Select account...'}</option>
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="w-[130px]">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="f-input text-right"
                        value={line.debit}
                        onChange={(e) => setLine(index, 'debit', e.target.value)}
                      />
                    </td>
                    <td className="w-[130px]">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        className="f-input text-right"
                        value={line.credit}
                        onChange={(e) => setLine(index, 'credit', e.target.value)}
                      />
                    </td>
                    <td className="min-w-[180px]">
                      <input
                        type="text"
                        className="f-input"
                        value={line.narration}
                        onChange={(e) => setLine(index, 'narration', e.target.value)}
                      />
                    </td>
                    <td>
                      <button
                        type="button"
                        className="act-btn act-red disabled:opacity-40"
                        title="Remove line"
                        aria-label="Remove line"
                        disabled={lines.length <= 2}
                        onClick={() => dropLine(index)}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td>Total</td>
                  <td className="text-right">{money(totals.debit)}</td>
                  <td className="text-right">{money(totals.credit)}</td>
                  <td colSpan={2} className={totals.difference === 0 ? 'text-okgreen' : 'text-danger'}>
                    {totals.difference === 0
                      ? 'Balanced'
                      : 'Difference ' + money(Math.abs(totals.difference))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          <button type="button" className="btn mt-3" onClick={addLine}>
            <Icon name="plus" size={13} /> Add Line
          </button>
        </div>

        <button
          type="button"
          className="btn btn-primary btn-submit disabled:cursor-not-allowed disabled:opacity-50"
          onClick={submit}
          disabled={saving || totals.difference !== 0 || !scope.business}
          title={!scope.business ? 'Select a business in the top bar.' : undefined}
        >
          {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Post Journal
        </button>
      </div>
    </div>
  );
}
