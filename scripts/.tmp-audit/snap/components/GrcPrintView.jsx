'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';

/* Printable Goods Receipt Challan.
   Everything outside the document is hidden at print time by the
   `print-doc` / `no-print` rules in globals.css. */

const d = (v) => {
  if (!v) return '';
  const x = new Date(v);
  return Number.isNaN(x.getTime())
    ? ''
    : String(x.getDate()).padStart(2, '0') + '-' +
      String(x.getMonth() + 1).padStart(2, '0') + '-' + x.getFullYear();
};
const n = (v, dp = 2) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(dp));

export default function GrcPrintView({ id }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch('/api/purchase-grc/' + id + '/print')
      .then(async (r) => {
        if (!r.ok) throw new Error((await r.json()).error || 'Could not load');
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  if (error) return <div className="card"><div className="card-body text-danger">{error}</div></div>;
  if (!data) return <div className="card"><div className="card-body"><span className="spin" /></div></div>;

  const { business: b, supplier: s, grc, items, totals } = data;

  const addr = [s?.addressLine1, s?.addressLine2, s?.city, s?.zipCode].filter(Boolean).join(', ');
  const bAddr = [b?.city, b?.state, b?.zipCode].filter(Boolean).join(', ');

  return (
    <>
      <div className="print-doc mx-auto max-w-[900px] border border-black bg-white">
        {/* letterhead */}
        <div className="border-b border-black px-4 py-3 text-center">
          <div className="text-[22px] font-bold">{b?.printName || b?.name || ''}</div>
          <div className="text-[13px]">
            {[b?.name, bAddr].filter(Boolean).join(', ')}
          </div>
          <div className="text-[13px]">
            {b?.mobile ? 'Tel: ' + b.mobile : ''}
            {b?.gstin ? ', GSTIN : ' + b.gstin : ''}
          </div>
        </div>

        {/* From / document block */}
        <div className="grid grid-cols-1 border-b border-black text-[13px] md:grid-cols-2">
          <div className="border-black px-3 py-2 md:border-r">
            <div><b>From : {s?.name || ''}</b></div>
            {addr && <div><b>Address :</b> {addr}</div>}
            {s?.mobile && <div><b>Mobile:</b> {s.mobile}</div>}
            {s?.gstin && <div><b>GSTIN:</b> {s.gstin}</div>}
          </div>
          <div className="px-3 py-2">
            <div><b>GRN No: {grc.grcNumber || ''}</b></div>
            <div><b>Date: {d(grc.grcDate)}</b></div>
            <div>
              <b>Supp Ref No &amp; Dt :</b> {grc.vendorDocNo || ''}
              {grc.vendorDocDate ? ' - ' + d(grc.vendorDocDate) : ''}
            </div>
            <div><b>LR No &amp; Dt :</b> {grc.lrNo || ''}{grc.lrDate ? ' - ' + d(grc.lrDate) : ''}</div>
          </div>
        </div>

        {/* items */}
        <table className="prn-tbl">
          <thead>
            <tr>
              <th style={{ width: 34 }}>Sn.</th>
              <th>Item Name</th>
              <th style={{ width: 110 }}>BatchNO.</th>
              <th style={{ width: 78 }}>Qty</th>
              <th style={{ width: 90 }}>Final Price</th>
              <th style={{ width: 92 }}>Amount</th>
              <th style={{ width: 74 }}>RSP</th>
              <th style={{ width: 60 }}>GP</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={8} className="py-6 text-center text-inkmuted">
                  This challan has no line items.
                </td>
              </tr>
            )}
            {items.map((r) => (
              <tr key={r.sn}>
                <td className="text-center">{r.sn}</td>
                <td className="text-center">{r.itemName}</td>
                <td className="text-center">{r.batchNo}</td>
                <td className="text-center">{n(r.qty)}<br />({r.uom})</td>
                <td className="text-right">{n(r.price)}</td>
                <td className="text-right">{n(r.amount)}</td>
                <td className="text-right">{n(r.rsp)}</td>
                <td className="text-right">{r.gp === null ? '' : n(r.gp)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="text-center font-bold">Gross Total</td>
              <td className="text-center font-bold">{n(totals.qty)}</td>
              <td />
              <td className="text-right font-bold">{n(totals.amount)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>

        <div className="px-4 pb-10 pt-12 text-center text-[13px]">
          <div>For</div>
          <div className="mt-12">(Authorised Signatory)</div>
        </div>
      </div>

      <div className="no-print mt-4 flex gap-3">
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>
          <Icon name="printer" size={14} /> Print
        </button>
        <button type="button" className="btn" onClick={() => router.push('/admin/transaction/purchase/grc')}>
          <Icon name="back" size={14} /> Back
        </button>
      </div>
    </>
  );
}
