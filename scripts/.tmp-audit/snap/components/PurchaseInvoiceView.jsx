'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { fmt } from '@/lib/format';

/* ==========================================================================
   View Purchase Invoice - the read-only dialog the eye icon opens.

   The eye and the pencil used to do the same thing: both pushed the record
   route, which is the edit form. Viewing and editing are different intents,
   and an invoice that has already been raised is not something you want to
   land inside a form by accident.

   Header names come from the `labels` map the API resolves - the document
   itself only stores ObjectIds.
   ========================================================================== */

const money = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2));

/* The deployed line grid, left to right. `k` is the stored key; the older
   grid-header spellings are accepted as a fallback so a line written before
   PurchaseInvoiceForm existed still renders. */
const COLS = [
  { t: 'Item Code', k: 'itemCode', alt: 'Item Code' },
  { t: 'Item Name', k: 'itemName', alt: 'Item Name' },
  { t: 'HSN', k: 'hsn', alt: 'HSN' },
  { t: 'GST Slab', k: 'slabName', alt: 'GST Slab' },
  { t: 'UOM', k: 'uom', alt: 'UOM' },
  { t: 'QTY/MTR', k: 'qty', alt: 'QTY/MTR', num: true },
  { t: 'No. of Cuts', k: 'cuts', num: true },
  { t: 'Purchase Rate', k: 'purchaseRate', num: true },
  { t: 'Discount', k: 'discount', num: true },
  { t: 'R.Off Discount', k: 'roffDiscount', num: true },
  { t: 'Final Rate', k: 'finalRate', num: true },
  { t: 'Before Tax', k: 'beforeTax', num: true },
  { t: 'IGST Amount', k: 'igstAmount', num: true },
  { t: 'CGST Amount', k: 'cgstAmount', num: true },
  { t: 'SGST Amount', k: 'sgstAmount', num: true },
  { t: 'Net Amount', k: 'netAmount', num: true },
  { t: 'RSP', k: 'rsp', num: true },
  { t: 'WSP', k: 'wsp', num: true },
  { t: 'DP', k: 'dp', num: true },
];

function Row({ label, value, file }) {
  return (
    <div className="flex py-[3px] text-[13.5px]">
      <span className="flex w-[168px] shrink-0 items-center gap-1 font-semibold text-ink">
        {label}
        {file && <Icon name="file" size={12} />}
      </span>
      <span className="text-cell">: {value || ''}</span>
    </div>
  );
}

function Total({ label, op, value, input }) {
  return (
    <tr className="border-b border-line">
      <td className="w-[46%] py-2 pr-3 text-right text-cell">{label}</td>
      <td className="w-[16%] px-2 text-right">{input}</td>
      <td className="w-[6%] text-center text-[#c07b2a]">{op || ''}</td>
      <td className="py-2 pr-3 text-right">{value}</td>
    </tr>
  );
}

export default function PurchaseInvoiceView({ id, labels: listLabels = {}, onClose }) {
  const [doc, setDoc] = useState(null);
  const [labels, setLabels] = useState(listLabels);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch('/api/purchase-invoice/' + id)
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load that invoice.');
        return r.json();
      })
      .then((d) => {
        if (!d.doc) throw new Error('Invoice not found.');
        setDoc(d.doc);
        /* the list already resolved most of these; merge so the dialog still
           shows names while its own request is in flight */
        setLabels((prev) => ({ ...prev, ...(d.labels || {}) }));
      })
      .catch((e) => setError(e.message));
  }, [id]);

  const name = (v) => labels[String(v)] || '';
  const items = Array.isArray(doc?.items) ? doc.items : [];

  /* the slab percentage to print beside "IGST (n) %", taken from the lines */
  const igstPct = items.find((r) => Number(r.igstAmount) && Number(r.beforeTax))
    ? ((Number(items.find((r) => Number(r.igstAmount)).igstAmount)
        / Number(items.find((r) => Number(r.igstAmount)).beforeTax)) * 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/45 p-4 pt-10"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[1120px] rounded-lg bg-white shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center border-b border-line px-5 py-3">
          <span className="text-[16px] font-bold">View Purchase Invoice</span>
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
          {error && <div className="flash flash-err">{error}</div>}
          {!doc && !error && <div className="py-8 text-center"><span className="spin" /></div>}

          {doc && (
            <>
              {/* ------------------------------------------------ header */}
              <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
                <div>
                  <Row label="Vendor Name" value={name(doc.supplierId)} />
                  <Row label="Purchase Invoice" value={doc.purchaseInvoiceNo} />
                  <Row label="Invoice Copy" value={doc.vendorInvoiceCopy || 'N/A'} file />
                  <Row label="GRC Date" value={fmt('date', doc.grcDate)} />
                  <Row label="Vendor Doc Date" value={fmt('date', doc.vendorDocDate)} />
                  <Row label="Vendor Doc No" value={doc.vendorDocNo} />
                  <Row label="Procurement Type" value={doc.procurementType} />
                  <Row label="Agent" value={name(doc.agentId)} />
                  <Row label="Financial Year" value={doc.finYear} />
                </div>
                <div>
                  <Row label="Vendor GST No" value={doc.vendorGstNo} />
                  <Row label="Purchase Invoice Date" value={fmt('date', doc.purchaseDate)} />
                  <Row label="Waybill" value={doc.vendorWaybill || 'N/A'} file />
                  <Row label="GRC Number" value={doc.grcNumber} />
                  <Row label="Purchase Term" value={name(doc.purchaseTermId)} />
                  <Row label="Purchase Group" value={name(doc.purchaseGroupId)} />
                  <Row label="Occasion" value={doc.occasion} />
                  <Row label="Logistic" value={name(doc.logisticId)} />
                </div>
              </div>

              {/* ------------------------------------------------- lines */}
              <div className="mt-4 overflow-x-auto">
                <table className="dt">
                  <thead>
                    <tr>{COLS.map((c) => <th key={c.t}>{c.t}</th>)}</tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={COLS.length} className="dt-empty">
                          This invoice has no line items.
                        </td>
                      </tr>
                    )}
                    {items.map((r, i) => (
                      <tr key={i}>
                        {COLS.map((c) => {
                          const raw = r[c.k] ?? (c.alt ? r[c.alt] : undefined);
                          return (
                            <td key={c.t} className={c.num ? 'text-right' : ''}>
                              {c.num ? money(raw) : (raw ?? '')}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* ------------------------------------------------ totals */}
              <div className="mt-4">
                <table className="w-full border-collapse text-[13.5px]">
                  <tbody>
                    <Total label="Taxable Value" op="+" value={money(doc.taxableValue)} />
                    <Total
                      label="Discount(%)"
                      op="&minus;"
                      input={doc.discountPercent ? money(doc.discountPercent) : ''}
                      value=""
                    />
                    <Total
                      label="RoundOff Discount(Amt)"
                      op="&minus;"
                      input={doc.roundOffDiscount ? money(doc.roundOffDiscount) : ''}
                      value=""
                    />
                    <Total
                      label={'IGST (' + igstPct.toFixed(2) + ') %'}
                      op="+"
                      value={money(doc.igstTotal)}
                    />
                    {(Number(doc.cgstTotal) > 0 || Number(doc.sgstTotal) > 0) && (
                      <>
                        <Total label="CGST" op="+" value={money(doc.cgstTotal)} />
                        <Total label="SGST" op="+" value={money(doc.sgstTotal)} />
                      </>
                    )}
                    <Total
                      label="Freight charges BEFORE GST (Amt)"
                      op="+"
                      input={money(doc.freightBeforeGst || 0)}
                      value={money(doc.freightBeforeGst)}
                    />
                    <Total label="Round Off" value={money(doc.roundOff)} />
                    <tr className="font-bold">
                      <td className="py-2 pr-3 text-right">Net Purchases Value</td>
                      <td /><td />
                      <td className="py-2 pr-3 text-right">
                        {money(doc.netPurchaseAmt ?? doc.totalPayable)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
