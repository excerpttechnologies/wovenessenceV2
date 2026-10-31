'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import { useScope } from './ScopeContext';

/* Goods sent TO this store that nobody here has accepted yet.

   Receiving is a separate act from despatching, and it has to be somebody
   else's act: the store that RAISED the challan cannot land the goods on the
   receiver's shelf. So this panel is looked up by `toLocationId` - the store
   named on the challan as the destination - not by the source `locationId`
   the challan list uses. Standing in any other store shows nothing, which is
   correct.

   It sits above the challan list through cfg.beforeTable, the same slot the
   Inter Company screen uses for its Pending section. */

const money = (v) => Number(v || 0).toFixed(2);
const qtyText = (v) => String(Math.round((Number(v) || 0) * 100) / 100);
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '-');

export default function StoreReceivePanel() {
  const scope = useScope();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    if (!scope.business || !scope.location) { setRows([]); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        business: scope.business,
        /* the document's DESTINATION, which is this store */
        toLocationId: scope.location,
        perPage: '200',
      });
      const r = await fetch('/api/is-delivery-challan?' + qs, { cache: 'no-store' });
      const d = await r.json();
      if (!r.ok) {
        setRows([]);
        setFlash({ type: 'err', msg: d.error || 'Could not load incoming challans.' });
        return;
      }
      setRows((d.rows || []).filter((x) => !x.receivedAt && x.status !== 'cancelled'));
    } catch {
      setRows([]);
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setLoading(false);
    }
  }, [scope.business, scope.location]);

  useEffect(() => { load(); }, [load]);

  async function receive(row) {
    if (busyId) return;
    setBusyId(String(row._id));
    setFlash(null);
    try {
      const r = await fetch('/api/is-delivery-challan/' + row._id + '/receive', { method: 'POST' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || 'Could not receive this challan.' });
        return;
      }
      setFlash({ type: 'ok', msg: 'Challan ' + (row.dcNo || '') + ' received into this store.' });
      load();
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="card mb-3">
      <div className="card-head">
        <span className="card-title">Awaiting Receipt at This Store</span>
        <span className="flex-1" />
        {rows.length > 0 && (
          <span className="rounded bg-[#fff3cd] px-2 py-0.5 text-[11.5px] font-semibold text-warnyellow">
            {rows.length} challan(s) on the way
          </span>
        )}
        <button type="button" className="btn btn-ghost" onClick={load}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      <div className="card-body">
        {flash && (
          <div className={'mb-3 flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>
        )}

        {!scope.location && (
          <div className="text-[13px] text-inkmuted">Select a store in the top bar to see deliveries addressed to it.</div>
        )}

        <div className="overflow-x-auto">
          <table className="dt dt-nowrap-head">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Action</th>
                <th style={{ width: 140 }}>DC No</th>
                <th style={{ width: 100 }}>DC Date</th>
                <th>From Store</th>
                <th className="!text-right" style={{ width: 80 }}>Qty</th>
                <th className="!text-right" style={{ width: 110 }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="dt-empty">Loading...</td></tr>}
              {!loading && scope.location && !rows.length && (
                <tr><td colSpan={6} className="dt-empty">Nothing awaiting receipt at this store.</td></tr>
              )}
              {!loading && rows.map((r) => (
                <tr key={r._id}>
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary !px-2 !py-1 !text-[12px]"
                      disabled={Boolean(busyId)}
                      onClick={() => receive(r)}
                    >
                      {busyId === String(r._id) ? <span className="spin" /> : <Icon name="check" size={12} />} Receive
                    </button>
                  </td>
                  <td className="font-semibold">{r.dcNo || '-'}</td>
                  <td>{day(r.dcDate)}</td>
                  <td>{r.toLocationName || '-'}</td>
                  <td className="!text-right">{qtyText(r.totalQty)}</td>
                  <td className="!text-right">{money(r.netValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
