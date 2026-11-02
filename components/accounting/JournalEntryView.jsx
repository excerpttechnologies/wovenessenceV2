'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import { fmt } from '@/lib/format';

/* One journal, read-only.

   There is no Edit here on purpose. A posted journal is the record of what
   happened, so a correction is a REVERSAL (the same journal with both sides
   swapped) - the original stays visible next to the reversal that offsets it.
   An automatic posting is reversed from its document instead, which is why
   this screen refuses that here rather than offering a button that would let
   the source and the books disagree. */

const SOURCE_LABEL = {
  manual: 'Manual',
  purchase: 'Purchase GRC',
  sales: 'Sales',
  stocktransfer: 'Stock Transfer',
};

export default function JournalEntryView({ id }) {
  const router = useRouter();
  const scope = useScope();
  /* The scope travels with every request so the route judges the permission
     against the business on screen rather than against no business at all. */
  const qs = new URLSearchParams({
    business: scope.business || '',
    location: scope.location || '',
    finYear: scope.finYear || '',
  }).toString();
  const [doc, setDoc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/accounting/journals/' + id + '?' + qs, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setError(d.error || 'Could not load that journal.'); setDoc(null); return; }
      setDoc(d.doc || null);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [id, qs]);

  useEffect(() => { load(); }, [load]);

  async function reverse() {
    setWorking('reverse');
    setFlash(null);
    try {
      const r = await fetch('/api/accounting/journals/' + id + '/reverse?' + qs, { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Could not reverse that journal.' }); return; }
      setFlash({ type: 'ok', msg: 'Reversed. The reversal is now its own journal in the register.' });
      await load();
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setWorking('');
    }
  }

  async function remove() {
    setWorking('delete');
    setFlash(null);
    try {
      const r = await fetch('/api/accounting/journals/' + id + '?' + qs, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Could not delete that journal.' }); return; }
      router.push('/admin/accounting/journal');
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setWorking('');
    }
  }

  const canReverse = doc && doc.source === 'manual' && doc.kind === 'entry'
    && doc.status !== 'reversed';
  const canDelete = doc && doc.source === 'manual' && doc.kind === 'entry'
    && doc.status !== 'reversed' && !doc.reversedBy;

  return (
    <div className="card form-card">
      <div className="card-head">
        <span className="card-title">
          Journal {doc?.referenceNo ? '- ' + doc.referenceNo : ''}
        </span>
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
        {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}
        {error && <div className="flash flash-err">{error}</div>}
        {loading && <div className="dt-empty"><span className="spin" /></div>}

        {!loading && doc && (
          <>
            <div className="form-rows mb-3">
              <div>
                <div className="text-[11.5px] uppercase tracking-wide text-[#5d6b83]">Date</div>
                <div className="font-semibold">{fmt('date', doc.journalDate)}</div>
              </div>
              <div>
                <div className="text-[11.5px] uppercase tracking-wide text-[#5d6b83]">Source</div>
                <div className="font-semibold">{SOURCE_LABEL[doc.source] || doc.source}</div>
              </div>
              <div>
                <div className="text-[11.5px] uppercase tracking-wide text-[#5d6b83]">Document</div>
                <div className="font-semibold">{doc.sourceRefNo || '-'}</div>
              </div>
              <div>
                <div className="text-[11.5px] uppercase tracking-wide text-[#5d6b83]">Financial Year</div>
                <div className="font-semibold">{doc.finYear || '-'}</div>
              </div>
              <div>
                <div className="text-[11.5px] uppercase tracking-wide text-[#5d6b83]">Kind</div>
                <div className="font-semibold">
                  {doc.kind === 'reversal' ? 'Reversal' : 'Entry'}
                  {doc.postingSeq > 1 ? ' (posting ' + doc.postingSeq + ')' : ''}
                </div>
              </div>
              <div>
                <div className="text-[11.5px] uppercase tracking-wide text-[#5d6b83]">Status</div>
                <div className="font-semibold">
                  <span className={'pill ' + (doc.status === 'reversed' ? 'pill-grey' : 'pill-green')}>
                    {doc.status === 'reversed' ? 'Reversed' : 'Posted'}
                  </span>
                </div>
              </div>
            </div>

            {doc.narration && (
              <div className="note-box mb-3">{doc.narration}</div>
            )}

            <div className="overflow-x-auto">
              <table className="dt">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Narration</th>
                    <th className="text-right">Debit</th>
                    <th className="text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {(doc.lines || []).map((line) => (
                    <tr key={line._id}>
                      <td>{line.accountName || line.accountId}</td>
                      <td>{line.narration || ''}</td>
                      <td className="text-right">{line.debit ? Number(line.debit).toFixed(2) : ''}</td>
                      <td className="text-right">{line.credit ? Number(line.credit).toFixed(2) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={2}>Total</td>
                    <td className="text-right">{Number(doc.totalDebit || 0).toFixed(2)}</td>
                    <td className="text-right">{Number(doc.totalCredit || 0).toFixed(2)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {(canReverse || canDelete) && (
              <div className="mt-4 flex items-center gap-2">
                {canReverse && (
                  <button
                    type="button"
                    className="btn"
                    onClick={reverse}
                    disabled={Boolean(working)}
                    title="Post the opposite journal, leaving this one in place"
                  >
                    {working === 'reverse' ? <span className="spin" /> : <Icon name="undo" size={14} />}
                    Reverse
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    className="btn border-danger bg-danger text-white"
                    onClick={remove}
                    disabled={Boolean(working)}
                  >
                    {working === 'delete' ? <span className="spin" /> : <Icon name="trash" size={14} />}
                    Delete
                  </button>
                )}
                <span className="text-[12.5px] text-inkmuted">
                  Reversing keeps the audit trail; deleting only removes a manual entry that was never reversed.
                </span>
              </div>
            )}

            {doc.kind === 'reversal' && (
              <div className="note-box mt-3">
                This is a reversal. It offsets journal {doc.reversalOf || ''} and is never deleted.
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
