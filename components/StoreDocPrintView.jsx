'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/* ==========================================================================
   Print view for the four Inter Store Sell documents.

   One component, four documents: they print the same header, the same line
   table and the same GST block, and only the title and the numbers differ.

   Browser print (window.print) is how every document in this ERP prints - see
   components/IcChallanPrintView.jsx. There is no server PDF service here, so
   this does not pretend to have one.
   ========================================================================== */

const KEY = {
  challan: { endpoint: '/api/is-delivery-challan/', title: 'DELIVERY CHALLAN', no: 'dcNo', date: 'dcDate' },
  invoice: { endpoint: '/api/is-sales-invoice/', title: 'TAX INVOICE', no: 'invoiceNo', date: 'invoiceDate' },
  debitnote: { endpoint: '/api/is-debit-note/', title: 'DEBIT NOTE', no: 'debitNoteNo', date: 'debitNoteDate' },
  return: { endpoint: '/api/is-sales-return/', title: 'SALES RETURN', no: 'returnNo', date: 'returnDate' },
};

const money = (v) => Number(v || 0).toFixed(2);
const qty = (v) => String(Math.round((Number(v) || 0) * 100) / 100);
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '-');

export default function StoreDocPrintView({ kind, id }) {
  const router = useRouter();
  const meta = KEY[kind];

  const [doc, setDoc] = useState(null);
  const [fromStore, setFromStore] = useState('');
  const [toStore, setToStore] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let off = false;

    (async () => {
      try {
        const r = await fetch(meta.endpoint + id, { cache: 'no-store' });
        const d = await r.json();
        if (off) return;
        if (!r.ok || !d.doc) { setError(d.error || 'Document not found.'); return; }

        setDoc(d.doc);

        /* Store names come from the same options list the rest of the module
           uses - there is no by-id location route to lean on. The document
           already carries the destination name it was issued with, so a
           missing option falls back to that rather than printing a blank. */
        let opts = [];
        try {
          const lr = await fetch(
            '/api/options?ref=companylocations&business=' + (d.doc.businessId || ''),
            { cache: 'no-store' }
          );
          if (lr.ok) opts = (await lr.json()).options || [];
        } catch {
          opts = [];
        }

        const nameOf = (locationId, fallback = '') => {
          const hit = opts.find((o) => String(o.value) === String(locationId));
          return (hit && hit.label) || fallback;
        };

        if (off) return;
        setFromStore(nameOf(d.doc.locationId));
        setToStore(nameOf(d.doc.toLocationId, d.doc.toLocationName || ''));
      } catch {
        if (!off) setError('Could not reach the server.');
      } finally {
        if (!off) setLoading(false);
      }
    })();

    return () => { off = true; };
  }, [meta.endpoint, id]);

  if (loading) return <div className="card p-6">Loading...</div>;
  if (error) return <div className="card p-6 flash flash-err">{error}</div>;
  if (!doc) return <div className="card p-6">Nothing to print.</div>;

  const isChallan = kind === 'challan';

  return (
    <div className="card">
      <div className="card-head print:hidden">
        <span className="card-title">{meta.title}</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={() => router.back()}>Back</button>
        <button type="button" className="btn btn-primary" onClick={() => window.print()}>Print</button>
      </div>

      <div className="p-6 text-[13px] text-ink">
        <div className="mb-4 flex items-start justify-between border-b border-line pb-3">
          <div>
            <div className="text-[18px] font-bold">{meta.title}</div>
            <div className="mt-1"><b>No</b> : {doc[meta.no] || '-'}</div>
            <div><b>Date</b> : {day(doc[meta.date])}</div>
            <div><b>Financial Year</b> : {doc.finYear || '-'}</div>
          </div>
          <div className="text-right">
            <div><b>From Store</b> : {fromStore || '-'}</div>
            <div><b>To Store</b> : {toStore || doc.toLocationName || '-'}</div>
            {doc.salesInvoiceNo && <div><b>Against Invoice</b> : {doc.salesInvoiceNo}</div>}
            {(doc.deliveryChallanNos || []).length > 0 && (
              <div><b>Challan(s)</b> : {(doc.deliveryChallanNos || []).join(', ')}</div>
            )}
          </div>
        </div>

        <table className="dt dt-nowrap-head">
          <thead>
            <tr>
              <th style={{ width: 40 }}>Sl</th>
              <th>Barcode</th>
              <th>Item</th>
              <th>HSN</th>
              <th>UOM</th>
              <th className="!text-right">Qty</th>
              <th className="!text-right">Rate</th>
              <th className="!text-right">Taxable</th>
              <th className="!text-right">IGST</th>
              <th className="!text-right">CGST</th>
              <th className="!text-right">SGST</th>
              <th className="!text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {(doc.items || []).map((l, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}</td>
                <td className="font-mono text-[12px]">{l.barcodeNo || '-'}</td>
                <td>{l.itemName || l.itemCode || '-'}</td>
                <td>{l.hsn || '-'}</td>
                <td>{l.uom || '-'}</td>
                <td className="!text-right">{qty(l.qty)}</td>
                <td className="!text-right">{money(l.unitRate)}</td>
                <td className="!text-right">{money(l.beforeTax)}</td>
                <td className="!text-right">{money(l.igst)}</td>
                <td className="!text-right">{money(l.cgst)}</td>
                <td className="!text-right">{money(l.sgst)}</td>
                <td className="!text-right font-semibold">{money(l.netAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-4 flex justify-end">
          <div className="min-w-[280px] text-[13px]">
            <div className="flex justify-between gap-6"><span>Taxable Value</span><span>{money(doc.taxableValue)}</span></div>
            <div className="flex justify-between gap-6"><span>IGST</span><span>{money(doc.igstTotal)}</span></div>
            <div className="flex justify-between gap-6"><span>CGST</span><span>{money(doc.cgstTotal)}</span></div>
            <div className="flex justify-between gap-6"><span>SGST</span><span>{money(doc.sgstTotal)}</span></div>
            <div className="flex justify-between gap-6"><span>Round Off</span><span>{money(doc.roundOff)}</span></div>
            <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1 text-[15px] font-bold">
              <span>Total</span><span>{money(doc.netValue)}</span>
            </div>
          </div>
        </div>

        {isChallan && (
          <div className="mt-3 text-[12px] text-inkmuted">
            This is a delivery challan, not a tax invoice. GST is shown for the value of the goods moved.
          </div>
        )}

        {doc.remarks && <div className="mt-4"><b>Remarks</b> : {doc.remarks}</div>}

        <div className="mt-12 flex justify-between text-[12px]">
          <span>Prepared By</span>
          <span>Received By</span>
          <span>Authorised Signatory</span>
        </div>
      </div>
    </div>
  );
}
