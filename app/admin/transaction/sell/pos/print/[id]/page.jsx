// ===== PREVIOUS POS INVOICE (A4 layout) - kept for reference, not in use =====
// 'use client';
// import { useEffect, useState } from 'react';
// import { useParams, useRouter } from 'next/navigation';
// import BarcodeSvg from '@/components/BarcodeSvg';
// import Icon from '@/components/Icon';
//
// const money = (value) => Number(value || 0).toFixed(2);
//
// /* What a stored line is actually worth. `netAmount` is written on save; the
//    older `lineTotal` is only ever a till-side derived field, so it is a
//    fallback rather than the source. Last resort recomputes from rsp x qty. */
// const lineNet = (item) => {
//   const stored = Number(item.netAmount ?? item.lineTotal ?? NaN);
//   if (Number.isFinite(stored)) return stored;
//   const gross = Number(item.rsp || 0) * Number(item.qty || 0);
//   return gross * (1 - Number(item.discountPct || 0) / 100);
// };
//
// /* RSP is GST-inclusive, matching the till - tax is backed out of the line,
//    never added to it. */
// const lineTax = (item) => {
//   const rate = Number(item.gst || 0);
//   return lineNet(item) - lineNet(item) / (1 + rate / 100);
// };
//
// const lineDiscount = (item) =>
//   Math.max(0, Number(item.rsp || 0) * Number(item.qty || 0) - lineNet(item));
// export default function PrintPosPage() {
//   const { id } = useParams();
//   const router = useRouter();
//   const [doc, setDoc] = useState(null);
//   useEffect(() => { fetch('/api/sell-pos/' + id).then((r) => r.json()).then((d) => setDoc(d.doc || null)); }, [id]);
//   if (!doc) return <div className="p-6">Loading invoice...</div>;
//   const taxable = (doc.items || []).reduce((sum, item) => sum + lineNet(item) - lineTax(item), 0);
//   /* Cash Return - what went back to the customer. The till stores what was
//      HANDED OVER as paid (300 tendered on a 100 bill is paid 300), exactly the
//      figure the payment dialog shows as Cash Return, so it is the excess of
//      paid over the bill. Never negative: an underpaid bill shows in Total
//      Remaining instead. */
//   const changeReturn = Math.max(0, Number(doc.paid || 0) - Number(doc.totalAmount || 0));
//   return <main className="print-doc mx-auto max-w-3xl bg-white p-6 text-[13px] text-black print:p-0"><div className="mb-4 flex items-start justify-between"><div><h1 className="text-xl font-bold">{doc.locationName || doc.businessName || 'POS'}</h1><div>{doc.businessName || '-'}</div><div>{doc.locationName || '-'}</div><div>POS TAX INVOICE</div></div><div className="text-right">{/* Wider bars AND a wider box, because either alone does nothing.
//
//               BarcodeSvg keeps the aspect ratio, so the drawn size is whichever
//               of the two limits binds first. A short invoice number like "0039"
//               is only 57 modules: at the default module width of 1.2 it is
//               68x55 naturally, so in a 190x52 box the HEIGHT bound and it drew
//               just 65px wide - the letterboxing that made it look thin. Widening
//               the box alone would have changed nothing.
//
//               Module width 2.5 makes that same number 143px naturally, so it now
//               draws ~166px. A long number such as "TFJ/26/0142" is 145 modules
//               and was already hitting the old 190px ceiling and being scaled
//               down; the wider box lets it draw ~280px instead. */}<BarcodeSvg value={doc.invoiceNo || ''} height={40} width={2.5} displayValue className="block h-[64px] w-[280px]" /><div className="text-[10px]">Scan to find this sale</div><div className="no-print mt-2 flex justify-end gap-2"><button className="btn" onClick={() => window.print()}>Print Invoice</button>{/* back to the POS list - screen only, never printed */}<button className="btn border-danger bg-danger text-white hover:border-[#9f1d17] hover:bg-[#9f1d17]" title="Close" aria-label="Close" onClick={() => router.push('/admin/transaction/sell/pos')}><Icon name="x" size={16} /></button></div></div></div><div className="mb-4 grid grid-cols-2 gap-1 border-y border-black py-2"><div><b>Invoice No:</b> {doc.invoiceNo || '-'}</div><div><b>Date:</b> {doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'}</div><div><b>Customer:</b> {doc.customerName || 'Walk-in Customer'}</div><div><b>Contact:</b> {doc.customerContact || '-'}</div><div><b>Address:</b> {doc.customerAddress || '-'}</div><div><b>Billing Type:</b> {doc.billingType || '-'}</div></div><table className="w-full border-collapse border border-black"><thead><tr className="bg-[#168552] text-white">{['Barcode No','Item Code','Item Name','HSN','GST (%)','Qty','RSP Price','Discount','Tax','Amount'].map((x) => <th className="border border-black p-2 text-left" key={x}>{x}</th>)}</tr></thead><tbody>{(doc.items || []).map((item, i) => <tr key={i}><td className="border border-black p-2">{item.barcodeNo || item.barcode || '-'}</td><td className="border border-black p-2">{item.code || item.itemCode || '-'}</td><td className="border border-black p-2">{item.description || item.name || '-'}</td><td className="border border-black p-2">{item.hsn || '-'}</td><td className="border border-black p-2">{money(item.gst)}</td><td className="border border-black p-2">{item.qty || 0}</td><td className="border border-black p-2">{money(item.rsp)}</td><td className="border border-black p-2">{money(lineDiscount(item))}</td><td className="border border-black p-2">{money(lineTax(item))}</td><td className="border border-black p-2">{money(lineNet(item))}</td></tr>)}</tbody><tfoot><tr><td colSpan="9" className="border border-black p-2 text-right">Taxable Amount</td><td className="border border-black p-2">{money(taxable)}</td></tr><tr><td colSpan="9" className="border border-black p-2 text-right font-bold">Total Payable</td><td className="border border-black p-2 font-bold">{money(doc.totalAmount)}</td></tr><tr><td colSpan="9" className="border border-black p-2 text-right">Total Paid</td><td className="border border-black p-2">{money(doc.paid)}</td></tr><tr><td colSpan="9" className="border border-black p-2 text-right">Cash Return</td><td className="border border-black p-2">{money(changeReturn)}</td></tr><tr><td colSpan="9" className="border border-black p-2 text-right">Total Remaining</td><td className="border border-black p-2">{money(doc.sellDue)}</td></tr></tfoot></table><div className="mt-4 border-t border-black pt-3">Payment method: {(doc.payments || []).filter((p) => Number(p.amount || 0) > 0).map((p) => `${p.method} ${money(p.amount)}`).join(', ') || '-'}</div><div className="mt-4">Terms & Conditions: Goods once sold cannot be taken back or exchanged.</div><div className="mt-4 text-center font-bold">Thank you. Visit Again</div></main>;
// }
// ===== END OF PREVIOUS POS INVOICE =====

/* ==========================================================================
   POS INVOICE - THERMAL RECEIPT FORMAT (the client's "GST Invoice" layout).

   The previous A4-style invoice is kept above, commented out.

   Laid out for an 80 mm receipt printer: the sheet is 80 mm wide on paper
   (@page below) and shown at the same width on screen, so what is seen is
   what prints. Reading order follows the client's sample:

     logo, tagline, store address / phones / GSTIN
     GST Invoice - SP, Inv #, Date, Time, customer
     items, two lines each: Sl / Description / GST / HSN,
                            then Qty / Bar Code / MRP / Disc % / Net Amt
     totals, pieces / metres
     payment modes beside Taxable Val / CGST / SGST / Round Off / Net Amt
     TAX SUMMARY by HSN
     thank-you line, terms, footer note

   RSP is GST-inclusive, as on the till: tax is backed OUT of each line and
   split evenly into CGST and SGST (a counter sale is intra-state).

   Store-specific wording - the tagline, the default terms and the footer
   note - sits in the constants just below, so it can be changed without
   touching the layout. Terms saved on the Company Location master
   (termsAndConditions) are used instead of the defaults when present.
   ========================================================================== */

'use client';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import BarcodeSvg from '@/components/BarcodeSvg';
import { uomTypeOf } from '@/lib/barcodeUnits';
import { shareWhatsApp, shareEmail, shareInstagram } from '@/lib/shareRoutes';
/* the logo is read straight from bill-template/ at the project root - an
   import, so Next bundles it; nothing is copied into public/ */
import logoFile from '@/bill-template/posinvoice-temp.png';

const LOGO = logoFile.src || logoFile;
/* the second logo, printed under the first (user, 19-10-2026) */
import logoFile2 from '@/bill-template/posinvoice-temp1.png';
const LOGO2 = logoFile2.src || logoFile2;
const TAGLINE = 'TRADITION | FABRICS | TIMELESS YOU';
const THANK_YOU = '!! Thank you for your purchase, YOU MAKE OUR DAY !!';
const DEFAULT_TERMS = [
  'No Guarantee on Color, slippage & shrinkage of fabric',
  'No Return / Exchange / Refunds',
  'Goods once sold cannot be taken back or exchanged',
  'All prices are inclusive of GST',
  'Subject to Bangalore Jurisdiction',
];
const FOOTER_NOTE = 'TUESDAY HOLIDAY';

/* Indian grouping, two places - 18,485.00 */
const inr = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/* whole rupees, Indian grouping - 18,485. Payment modes, MRP and Net Amt
   print without paise (user, 12-10-2026); the tax figures keep inr() */
const inr0 = (v) => Math.round(Number(v || 0)).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const qtyText = (v) => String(r2(v));

/* what a stored line is worth - netAmount is written on save, lineTotal is
   the till's own figure, and rsp x qty less discount is the last resort */
const lineNet = (item) => {
  const stored = Number(item.netAmount ?? item.lineTotal ?? NaN);
  if (Number.isFinite(stored)) return stored;
  const gross = Number(item.rsp || 0) * Number(item.qty || 0);
  return gross * (1 - Number(item.discountPct || 0) / 100);
};
/* A5 / A4 only (19-10-2026): the line's discount in rupees - MRP x qty less
   what it nets to, never negative (the same rule as the Disc Amt total) */
const lineDisc = (item) => Math.max(0, r2(Number(item.rsp || 0) * Number(item.qty || 0) - lineNet(item)));
const lineTax = (item) => {
  const rate = Number(item.gst || 0);
  const net = lineNet(item);
  return net - net / (1 + rate / 100);
};
const kindOf = (item) => {
  const stored = String(item.uomType || '').trim().toUpperCase();
  return stored === 'PC' || stored === 'MTR' ? stored : uomTypeOf(item.uom);
};

/* THREE PAPER SIZES (user, 13-10-2026): the 80 mm thermal receipt, and a
   full-page tax invoice on A5 or A4. The sheet is drawn at the paper's own
   width with the margin as padding, so the screen shows the page as it
   prints. */
const FORMATS = [
  { k: 'receipt', label: 'Receipt 80mm' },
  { k: 'a5', label: 'A5' },
  { k: 'a4', label: 'A4' },
];
const PAPER = {
  a4: { name: 'A4', w: 210, h: 297, pad: 10, font: 11.5 },
  a5: { name: 'A5', w: 148, h: 210, pad: 7, font: 9 },
};
const FORMAT_KEY = 'posPrintFormat';

/* Writes the @page rule for the chosen paper into a style tag of its own.
   Receipt: `80mm x <receipt height>mm` - the receipt is 80mm wide on screen
   too, so its on-screen height is its printed height; a few mm spare
   absorb font rounding. A5 / A4: the named sheet, portrait, no margin (the
   sheet carries its own). */
function setPageSize(format) {
  let size;
  if (PAPER[format]) {
    size = PAPER[format].name + ' portrait';
  } else {
    /* the ON-SCREEN copy - the print copy is display:none until printing */
    const el = document.querySelector('.pos-screen .pos-receipt');
    if (!el) return;
    size = '80mm ' + (Math.ceil((el.scrollHeight * 25.4) / 96) + 8) + 'mm';
  }
  let tag = document.getElementById('pos-receipt-page');
  if (!tag) {
    tag = document.createElement('style');
    tag.id = 'pos-receipt-page';
    document.head.appendChild(tag);
  }
  tag.textContent = '@media print { @page { size: ' + size + '; margin: 0; } }';
}

export default function PrintPosPage() {
  const { id } = useParams();
  const router = useRouter();
  const [doc, setDoc] = useState(null);
  /* the paper last printed on, per PC - a counter with a thermal printer and
     a back office with an A4 one each keep their own */
  const [format, setFormat] = useState('receipt');
  /* document.body exists only in the browser - the print copy is portalled
     there once mounted */
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  /* what the last share button did, for one line of feedback */
  const [shareNote, setShareNote] = useState(null);   // { error } | { notice }
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FORMAT_KEY);
      if (FORMATS.some((f) => f.k === saved)) setFormat(saved);
    } catch { /* storage blocked - stay on the receipt */ }
  }, []);
  const pickFormat = (k) => {
    setFormat(k);
    try { window.localStorage.setItem(FORMAT_KEY, k); } catch { /* not remembered, still used */ }
  };
  useEffect(() => {
    fetch('/api/sell-pos/' + id, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setDoc(d.doc || null));
  }, [id]);

  /* ONE PAGE, AS LONG AS THE RECEIPT (user, 12-10-2026 - it printed on two).
     `@page { size: 80mm auto }` is not valid CSS - the browser dropped it and
     fell back to the printer's own sheet (A4, landscape), so the receipt
     broke across pages. The page is now sized to the receipt's MEASURED
     height right before every print - the button, Ctrl+P, the browser
     menu all fire beforeprint. */
  useEffect(() => {
    if (!doc) return undefined;
    const size = () => setPageSize(format);
    window.addEventListener('beforeprint', size);
    return () => window.removeEventListener('beforeprint', size);
  }, [doc, format]);

  if (!doc) return <div className="p-6">Loading invoice...</div>;

  const items = doc.items || [];
  const seller = doc.seller || {};
  const when = new Date(doc.createdAt || doc.date || Date.now());
  const billDate = doc.date ? new Date(doc.date) : when;

  /* ---- totals -------------------------------------------------------- */
  const netSum = r2(items.reduce((a, it) => a + lineNet(it), 0));
  /* Totals line (user, 12-10-2026): MRP x qty over the lines, and what the
     discounts took off it - MRP total less Net Amt, never negative */
  const mrpSum = r2(items.reduce((a, it) => a + Number(it.rsp || 0) * Number(it.qty || 0), 0));
  const discSum = r2(Math.max(0, mrpSum - netSum));
  const taxSum = r2(items.reduce((a, it) => a + lineTax(it), 0));
  const taxable = r2(netSum - taxSum);
  const cgst = r2(taxSum / 2);
  const sgst = r2(taxSum - cgst);
  const shipping = Number(doc.shipping || 0);
  const netAmount = Number(doc.totalAmount || 0);

  /* THE SHARE MESSAGE - built exactly as on the View POS screen
     (components/PosInvoiceView.jsx). Whole rupees, as on the till. */
  const shareRupees = (v) => 'Rs ' + Math.trunc(Number(v || 0));
  const shareChange = Math.max(0, Number(doc.paid || 0) - Number(doc.totalAmount || 0));
  const shareLines = [
    'Invoice No: ' + (doc.invoiceNo || '-'),
    'Date: ' + (doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'),
    'Customer: ' + (doc.customerName || 'Walk-in Customer'),
    '',
    'Items:',
    ...items.map((item, i) => (i + 1) + '. '
      + (item.description || item.itemName || item.name || item.itemCode || 'Item')
      + ' x ' + (item.qty || 0) + ' = ' + shareRupees(item.netAmount ?? item.lineTotal)),
    '',
    'Total: ' + shareRupees(doc.totalAmount),
    'Paid: ' + shareRupees(doc.paid),
    ...(shareChange > 0 ? ['Cash Return: ' + shareRupees(shareChange)] : []),
    ...(Number(doc.sellDue || 0) > 0 ? ['Balance Due: ' + shareRupees(doc.sellDue)] : []),
    '',
    'Thank you for shopping with ' + (doc.locationName || doc.businessName || 'us') + '.',
  ];
  const shareSubject = 'Invoice ' + (doc.invoiceNo || '') + ' - ' + (doc.businessName || '');
  const shareMessage = [shareSubject, '', ...shareLines].join('\n');
  /* the whole-rupee correction between the lines and what was charged */
  const roundOff = r2(netAmount - shipping - netSum);
  const pcs = r2(items.filter((it) => kindOf(it) === 'PC').reduce((a, it) => a + Number(it.qty || 0), 0));
  const mtr = r2(items.filter((it) => kindOf(it) === 'MTR').reduce((a, it) => a + Number(it.qty || 0), 0));
  const changeReturn = Math.max(0, Number(doc.paid || 0) - netAmount);

  /* payment modes, one line per method that took money */
  const paidBy = new Map();
  (doc.payments || []).filter((p) => Number(p.amount || 0) > 0).forEach((p) => {
    const m = String(p.method || 'Other').trim() || 'Other';
    paidBy.set(m, (paidBy.get(m) || 0) + Number(p.amount || 0));
  });
  if (!paidBy.size && Number(doc.paid || 0) > 0) paidBy.set(doc.billingType || 'Cash', Number(doc.paid));

  /* TAX SUMMARY - one row per HSN, CGST and SGST at half the slab each */
  const byHsn = new Map();
  items.forEach((it) => {
    const key = (it.hsn || '-') + '|' + Number(it.gst || 0);
    const row = byHsn.get(key) || { hsn: it.hsn || '-', rate: Number(it.gst || 0), taxable: 0, tax: 0 };
    const t = lineTax(it);
    row.taxable += lineNet(it) - t;
    row.tax += t;
    byHsn.set(key, row);
  });
  const hsnRows = [...byHsn.values()];

  const terms = String(seller.terms || '').split(/\r?\n/).map((t) => t.trim()).filter(Boolean);
  const termLines = terms.length ? terms : DEFAULT_TERMS;
  const address = [seller.addressLine1, seller.addressLine2, seller.landmark].filter(Boolean).join(', ');
  const place = [seller.city, seller.zipCode].filter(Boolean).join(' - ');
  const phones = [seller.mobile, seller.alternate].filter(Boolean);

  const Rule = () => <div className="my-1 border-t border-dashed border-black" />;

  const paper = PAPER[format];

  return (
    <div className="flex flex-col items-center py-4">
      {/* screen-only controls - paper size on the left, print / close right */}
      <div
        className="no-print mb-3 flex flex-wrap items-center justify-between gap-2"
        style={{ width: paper ? paper.w + 'mm' : '80mm', maxWidth: '100%' }}
      >
        <div className="inline-flex overflow-hidden rounded border border-line" role="group" aria-label="Paper size">
          {FORMATS.map((f) => (
            <button
              key={f.k}
              type="button"
              aria-pressed={format === f.k}
              className={'px-2.5 py-1 text-[12px] font-semibold ' + (format === f.k ? 'bg-brand text-white' : 'bg-white text-inkmuted hover:bg-[#f3f4f6]')}
              onClick={() => pickFormat(f.k)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {/* SHARE (user, 21-10-2026) - the same three buttons and the same
              message as the View POS screen (components/PosInvoiceView.jsx);
              screen-only, the printed bill is unchanged */}
          <button type="button" title="Share on WhatsApp" aria-label="Share on WhatsApp" className="flex h-9 w-9 items-center justify-center rounded bg-[#25D366] text-white hover:bg-[#1da851]" onClick={() => setShareNote(shareWhatsApp(shareMessage))}><Icon name="whatsapp" size={18} /></button>
          <button type="button" title="Share on Instagram" aria-label="Share on Instagram" className="flex h-9 w-9 items-center justify-center rounded bg-[#E1306C] text-white hover:bg-[#c1275c]" onClick={async () => setShareNote(await shareInstagram(shareSubject, shareMessage))}><Icon name="instagram" size={18} /></button>
          <button type="button" title="Share by Email" aria-label="Share by Email" className="flex h-9 w-9 items-center justify-center rounded bg-brand text-white hover:opacity-90" onClick={() => setShareNote(shareEmail(shareSubject, shareLines.join('\n')))}><Icon name="mail" size={18} /></button>
          <button type="button" className="btn" onClick={() => { setPageSize(format); window.print(); }}><Icon name="printer" size={14} /> Print Invoice</button>
          <button type="button" className="btn border-danger bg-danger text-white hover:border-[#9f1d17] hover:bg-[#9f1d17]" title="Close" aria-label="Close" onClick={() => {
            /* Close goes back to the POS billing screen for this bill's
               business / location / year (user, 21-10-2026) */
            const idOf = (v) => String((v && v._id) || v || '');
            const q = new URLSearchParams({ business: idOf(doc.businessId), location: idOf(doc.locationId), finYear: doc.finYear || '' });
            router.push('/admin/pos/add?' + q.toString());
          }}><Icon name="x" size={16} /></button>
        </div>
        {shareNote && (shareNote.error || shareNote.notice) && (
          <div className={'w-full text-right text-[11px] ' + (shareNote.error ? 'text-danger' : 'text-inkmuted')}>
            {shareNote.error || shareNote.notice}
          </div>
        )}
      </div>

      {/* PRINTING (user, 15-10-2026 - it printed blank). globals.css hides
          `body > *:not(.print-doc)` at print time, which removes the whole
          app shell - and this invoice with it, since it sits inside the
          shell. That rule is a teammate's and other print screens rely on
          it, so it is not touched. Instead the document is rendered twice:
          on screen inside the page (.pos-screen, never printed), and as a
          print-only copy portalled straight under <body> as
          `.print-doc.pos-print-copy`, which that rule keeps. */}
      {(() => {
        const docEl = paper ? (
        <SheetInvoice
          paper={paper}
          doc={doc}
          seller={seller}
          items={items}
          when={when}
          billDate={billDate}
          address={address}
          place={place}
          phones={phones}
          termLines={termLines}
          paidBy={paidBy}
          changeReturn={changeReturn}
          totals={{ netSum, mrpSum, discSum, taxSum, taxable, cgst, sgst, shipping, netAmount, roundOff, pcs, mtr }}
          hsnRows={hsnRows}
        />
        ) : (
      <main className="pos-receipt w-[80mm] bg-white px-2 py-3 text-[10.5px] leading-snug text-black shadow print:shadow-none">
        {/* ------------------------------------------------ letterhead -- */}
        <div className="text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt={seller.name || 'Logo'} className="mx-auto mb-1 w-[62mm]" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO2} alt="" className="mx-auto mb-1 w-[50mm]" />
          <div className="text-[8.5px] tracking-[0.15em]">{TAGLINE}</div>
          <div className="mt-1 text-[12px] font-bold">{seller.name || doc.businessName}</div>
          {address && <div>{address}</div>}
          {place && <div>{place}</div>}
          {phones.length > 0 && <div>Ph: {phones.join(' / ')}</div>}
          {seller.gstin && <div className="font-bold">GSTIN: {seller.gstin}</div>}
          <div className="mt-1 text-[14px] font-bold">GST Invoice</div>
        </div>

        {/* ------------------------------------------- bill particulars -- */}
        <div className="mt-1 grid grid-cols-2 gap-x-2">
          <div>SP: {doc.salesPersonName || '-'}</div>
          <div className="text-right">Inv #: <b>{doc.invoiceNo || '-'}</b></div>
          <div>Counter: {doc.counterName || '-'}</div>
          <div className="text-right">Date: {billDate.toLocaleDateString('en-GB')}</div>
          <div />
          <div className="text-right">Time: {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
        <div className="mt-1">
          <div>Customer: {doc.customerName || 'Walk-in Customer'}{doc.customerContact ? ' (' + doc.customerContact + ')' : ''}</div>
          {doc.customerAddress && <div>Address: {doc.customerAddress}</div>}
          {doc.customerGstn && <div>GSTIN: {doc.customerGstn}</div>}
        </div>

        {/* ------------------------------------------------------ items -- */}
        <Rule />
        <div className="grid grid-cols-[6mm_1fr_9mm_15mm] font-bold">
          <span>Sl.</span><span>Description</span><span className="text-right">GST</span><span className="text-right">HSN</span>
        </div>
        <div className="grid grid-cols-[9mm_1fr_13mm_9mm_16mm] font-bold">
          <span>Qty</span><span>Bar Code</span><span className="text-right">MRP</span><span className="text-right">Disc%</span><span className="text-right">Net Amt</span>
        </div>
        <Rule />
        {items.map((it, i) => (
          <div key={i} className="mb-1">
            <div className="grid grid-cols-[6mm_1fr_9mm_15mm]">
              <span>{i + 1}</span>
              <span className="break-words font-semibold">{it.description || it.itemName || it.name || it.itemCode || '-'}</span>
              <span className="text-right">{r2(it.gst)}%</span>
              <span className="text-right">{it.hsn || '-'}</span>
            </div>
            <div className="grid grid-cols-[9mm_1fr_13mm_9mm_16mm]">
              <span>{qtyText(it.qty)}</span>
              <span className="break-all">{it.barcodeNo || it.barcode || '-'}</span>
              <span className="text-right">{inr0(it.rsp)}</span>
              <span className="text-right">{r2(it.discountPct)}</span>
              <span className="text-right">{inr0(lineNet(it))}</span>
            </div>
          </div>
        ))}
        <Rule />
        {/* same columns as the Qty / Bar Code / MRP / Disc% / Net Amt line,
            so the MRP total, the discount amount and the net total sit
            under their headings */}
        <div className="grid grid-cols-[9mm_1fr_13mm_9mm_16mm] font-bold">
          <span className="col-span-2">Totals &nbsp; Pc(s) {qtyText(pcs)} &nbsp; Mtr {qtyText(mtr)}</span>
          <span className="whitespace-nowrap text-right">{inr0(mrpSum)}</span>
          <span className="whitespace-nowrap text-right">{inr0(discSum)}</span>
          <span className="whitespace-nowrap text-right">{inr0(netSum)}</span>
        </div>
        {/* captions, because the figure under Disc% here is an AMOUNT */}
        <div className="grid grid-cols-[9mm_1fr_13mm_9mm_16mm] whitespace-nowrap text-[8px]">
          <span className="col-span-2" />
          <span className="text-right">MRP</span>
          <span className="text-right">Disc Amt</span>
          <span className="text-right">Net Amt</span>
        </div>
        <Rule />

        {/* ------------------------------- payment modes | tax figures -- */}
        <div className="grid grid-cols-2 gap-x-3">
          <div>
            <div className="font-bold">Payment Mode:</div>
            {[...paidBy.entries()].map(([m, a]) => (
              <div key={m} className="flex justify-between gap-1"><span className="truncate">{m}</span><span>{inr0(a)}</span></div>
            ))}
            {changeReturn > 0 && (
              <div className="flex justify-between gap-1"><span>Refund</span><span>{inr0(changeReturn)}</span></div>
            )}
            {Number(doc.sellDue || 0) > 0 && (
              <div className="flex justify-between gap-1"><span>Due</span><span>{inr0(doc.sellDue)}</span></div>
            )}
          </div>
          <div>
            <div className="flex justify-between gap-1"><span>Taxable Val</span><span>{inr(taxable)}</span></div>
            <div className="flex justify-between gap-1"><span>CGST</span><span>{inr(cgst)}</span></div>
            <div className="flex justify-between gap-1"><span>SGST</span><span>{inr(sgst)}</span></div>
            {shipping > 0 && <div className="flex justify-between gap-1"><span>Shipping</span><span>{inr(shipping)}</span></div>}
            <div className="flex justify-between gap-1"><span>Round Off</span><span>{inr(roundOff)}</span></div>
            <div className="flex justify-between gap-1 border-t border-black font-bold"><span>Net Amt</span><span>{inr0(netAmount)}</span></div>
          </div>
        </div>

        {/* ---------------------------------------------- tax summary -- */}
        <Rule />
        <div className="text-center font-bold">TAX SUMMARY</div>
        <table className="mt-0.5 w-full border-collapse text-[9.5px]">
          <thead>
            <tr className="border-y border-black">
              <th className="text-left">HSN</th>
              <th className="text-right">Taxable</th>
              <th className="text-right">CGST</th>
              <th className="text-right">SGST</th>
              <th className="text-right">Total Tax</th>
            </tr>
          </thead>
          <tbody>
            {hsnRows.map((h) => (
              <tr key={h.hsn + h.rate}>
                <td>{h.hsn}</td>
                <td className="text-right">{inr(h.taxable)}</td>
                <td className="text-right">{r2(h.rate / 2)}% {inr(h.tax / 2)}</td>
                <td className="text-right">{r2(h.rate / 2)}% {inr(h.tax / 2)}</td>
                <td className="text-right">{inr(h.tax)}</td>
              </tr>
            ))}
            <tr className="border-t border-black font-bold">
              <td>Totals</td>
              <td className="text-right">{inr(taxable)}</td>
              <td className="text-right">{inr(cgst)}</td>
              <td className="text-right">{inr(sgst)}</td>
              <td className="text-right">{inr(taxSum)}</td>
            </tr>
          </tbody>
        </table>

        {/* ------------------------------------------------- footer -- */}
        <Rule />
        <div className="text-center font-bold">{THANK_YOU}</div>
        <div className="mt-1">
          <div className="font-bold">Terms &amp; Conditions:</div>
          {termLines.map((t, i) => <div key={i}>{t}</div>)}
        </div>
        {/* the bill's own barcode - the invoice number, scannable to find
            this sale (removed 06-10-2026, back by request 13-10-2026) */}
        <div className="mt-2 flex justify-center">
          <BarcodeSvg value={doc.invoiceNo || ''} height={40} width={1.6} displayValue fontSize={13} className="block h-[16mm] w-[62mm]" />
        </div>
        <div className="mt-2 text-center text-[12px] font-bold">{FOOTER_NOTE}</div>
      </main>
        );
        return (
          <>
            <div className="pos-screen no-print">{docEl}</div>
            {mounted && createPortal(<div className="print-doc pos-print-copy">{docEl}</div>, document.body)}
          </>
        );
      })()}

      {/* an 80 mm roll, no page margins - scoped to this screen only */}
      <style jsx global>{`
        /* TrueType receipt face (user, 12-10-2026): Arial Narrow, then Arial
           Unicode MS, then the closest metric-compatible stand-ins on
           machines without them (Liberation Sans Narrow on Linux, Arial).
           The A5 / A4 sheets use the same face. */
        .pos-receipt, .pos-sheet {
          font-family: 'Arial Narrow', 'Arial Unicode MS', 'Liberation Sans Narrow', 'Nimbus Sans Narrow', Arial, 'Liberation Sans', sans-serif;
          font-stretch: condensed;
        }
        /* the print-only copy (see the PRINTING note above) never shows on
           screen */
        @media screen {
          .pos-print-copy { display: none !important; }
        }
        @media print {
          /* the page SIZE is set by setPageSize() from the receipt's
             measured height; this is only the fallback margin */
          @page { margin: 0; }
          /* globals.css gives every .print-doc width 100% / no padding; the
             copy's own wrapper takes that, the receipt / sheet inside keep
             their paper size - two classes, so these win over one */
          .print-doc.pos-print-copy { padding: 0 !important; margin: 0 !important; }
          .pos-print-copy .pos-receipt { width: 80mm !important; padding: 2mm !important; margin: 0 auto !important; box-shadow: none !important; }
          .pos-print-copy .pos-sheet { margin: 0 auto !important; min-height: 0 !important; box-shadow: none !important; }
          /* centred on the sheet: on an 80mm roll it fills the width
             anyway, but a printer that ignores @page size (an A4 printer,
             "Save as PDF") used to put the receipt in the left corner -
             globals.css pins .print-doc at inset 0, and margin auto with
             the fixed width centres it between those edges */
          .pos-receipt { width: 80mm !important; padding: 2mm !important; margin: 0 auto !important; }
          /* the A5 / A4 sheet keeps its paper width and padding; its height
             is left free (no bottom inset) so a long bill runs on to a
             second page instead of being cut at one */
          .pos-sheet { bottom: auto !important; margin: 0 auto !important; min-height: 0 !important; box-shadow: none !important; }
          .pos-sheet thead { display: table-header-group; }
          .pos-sheet tr { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

/* ==========================================================================
   A5 / A4 GST INVOICE - EXACTLY the receipt's details, nothing added
   (user, 13-10-2026), laid out as a page: letterhead, customer beside the
   bill particulars, one ruled table of lines, payments beside the tax
   figures, the HSN tax summary, then the thank-you line, terms and the
   footer note. Same figures and rounding as the receipt: whole rupees for
   MRP / Net Amt / payments, paise for the tax figures. A5 is the same
   layout at a smaller type size.
   ========================================================================== */
function SheetInvoice({
  paper, doc, seller, items, when, billDate, address, place, phones, termLines,
  paidBy, changeReturn, totals: t, hsnRows,
}) {
  /* No boxes (client, 19-10-2026): laid out like the 4-inch bill - centred
     letterhead, dashed rules between sections, rows without cell borders.
     The content is exactly what this sheet printed. A5 / A4 only; the 4-inch
     receipt above is frozen and untouched. */
  const th = 'px-1.5 py-1 font-bold';
  const td = 'px-1.5 py-0.5 align-top';
  const Rule = () => <div className="my-1.5 border-t border-dashed border-black" />;
  const Line = ({ label, children }) => (
    <div className="flex justify-between gap-2"><span>{label}</span><span>{children}</span></div>
  );
  const sellerName = seller.name || doc.businessName || '';

  return (
    <main
      className="pos-sheet bg-white leading-snug text-black shadow"
      style={{
        width: paper.w + 'mm',
        minHeight: paper.h + 'mm',
        padding: paper.pad + 'mm',
        fontSize: paper.font + 'px',
      }}
    >
      {/* ------------------------------------------------ letterhead -- */}
      <div className="text-center">
        {/* both logos in one row, centred (user, 19-10-2026) */}
        <div className="flex items-center justify-center" style={{ gap: paper.w * 0.05 + 'mm' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO} alt={sellerName || 'Logo'} style={{ width: paper.w * 0.32 + 'mm' }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={LOGO2} alt="" style={{ width: paper.w * 0.32 + 'mm' }} />
        </div>
        <div className="mt-0.5 tracking-[0.15em]" style={{ fontSize: '0.75em' }}>{TAGLINE}</div>
        <div className="mt-1 font-bold" style={{ fontSize: '1.35em' }}>{sellerName}</div>
        {address && <div>{address}</div>}
        {place && <div>{place}</div>}
        {phones.length > 0 && <div>Ph: {phones.join(' / ')}</div>}
        {seller.gstin && <div className="font-bold">GSTIN: {seller.gstin}</div>}
        <div className="mt-1 font-bold tracking-wide" style={{ fontSize: '1.3em' }}>GST Invoice</div>
      </div>

      {/* --------------------------------- customer | bill particulars -- */}
      <Rule />
      <div className="grid grid-cols-2 gap-x-6">
        <div>
          <div>Customer: {doc.customerName || 'Walk-in Customer'}{doc.customerContact ? ' (' + doc.customerContact + ')' : ''}</div>
          {doc.customerAddress && <div>Address: {doc.customerAddress}</div>}
          {doc.customerGstn && <div>GSTIN: {doc.customerGstn}</div>}
        </div>
        <div className="grid grid-cols-[auto_1fr] justify-end gap-x-2">
          <span>Inv #</span><b>: {doc.invoiceNo || '-'}</b>
          <span>Date</span><span>: {billDate.toLocaleDateString('en-GB')}</span>
          <span>Time</span><span>: {when.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
          <span>Counter</span><span>: {doc.counterName || '-'}</span>
          <span>SP</span><span>: {doc.salesPersonName || '-'}</span>
        </div>
      </div>

      {/* ------------------------------------------------------ items -- */}
      <table className="mt-1.5 w-full border-collapse">
        <thead>
          <tr className="border-y border-dashed border-black">
            {/* the client's order for A5 / A4 (19-10-2026): Sl, Item
                Description, Barcode, Qty, HSN, GST, MRP, Disc%, Disc Amt,
                Net Amt. The 4-inch receipt is frozen and keeps its own. */}
            <th className={th + ' text-left'} style={{ width: '5%' }}>Sl.</th>
            <th className={th + ' text-left'}>Item Description</th>
            <th className={th + ' text-left'} style={{ width: '12%' }}>Barcode</th>
            <th className={th + ' text-right'} style={{ width: '6%' }}>Qty</th>
            <th className={th + ' text-center'} style={{ width: '10%' }}>HSN</th>
            <th className={th + ' text-right'} style={{ width: '6%' }}>GST</th>
            <th className={th + ' text-right'} style={{ width: '9%' }}>MRP</th>
            <th className={th + ' text-right'} style={{ width: '7%' }}>Disc%</th>
            <th className={th + ' text-right'} style={{ width: '9%' }}>Disc Amt</th>
            <th className={th + ' text-right'} style={{ width: '10%' }}>Net Amt</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i}>
              <td className={td}>{i + 1}</td>
              <td className={td + ' font-semibold'}>{it.description || it.itemName || it.name || it.itemCode || '-'}</td>
              <td className={td}>{it.barcodeNo || it.barcode || '-'}</td>
              <td className={td + ' text-right'}>{qtyText(it.qty)}</td>
              <td className={td + ' text-center'}>{it.hsn || '-'}</td>
              <td className={td + ' text-right'}>{r2(it.gst)}%</td>
              <td className={td + ' text-right'}>{inr0(it.rsp)}</td>
              <td className={td + ' text-right'}>{r2(it.discountPct)}</td>
              <td className={td + ' text-right'}>{inr0(lineDisc(it))}</td>
              <td className={td + ' text-right'}>{inr0(lineNet(it))}</td>
            </tr>
          ))}
          {/* MRP, discount and net totals under their own headings */}
          <tr className="border-y border-dashed border-black font-bold">
            <td className={td} colSpan={6}>Totals &nbsp; Pc(s) {qtyText(t.pcs)} &nbsp; Mtr {qtyText(t.mtr)}</td>
            <td className={td + ' text-right'}>{inr0(t.mrpSum)}</td>
            <td className={td} />
            <td className={td + ' text-right'}>{inr0(t.discSum)}</td>
            <td className={td + ' text-right'}>{inr0(t.netSum)}</td>
          </tr>
        </tbody>
      </table>

      {/* ------------------------------- payment modes | tax figures -- */}
      <div className="mt-1.5 grid grid-cols-2 gap-x-8">
        <div>
          <div className="font-bold">Payment Mode:</div>
          {[...paidBy.entries()].map(([m, a]) => <Line key={m} label={m}>{inr0(a)}</Line>)}
          {changeReturn > 0 && <Line label="Refund">{inr0(changeReturn)}</Line>}
          {Number(doc.sellDue || 0) > 0 && <Line label="Due">{inr0(doc.sellDue)}</Line>}
        </div>
        <div>
          <Line label="Taxable Val">{inr(t.taxable)}</Line>
          <Line label="CGST">{inr(t.cgst)}</Line>
          <Line label="SGST">{inr(t.sgst)}</Line>
          {t.shipping > 0 && <Line label="Shipping">{inr(t.shipping)}</Line>}
          <Line label="Round Off">{inr(t.roundOff)}</Line>
          <div className="mt-0.5 flex justify-between gap-2 border-t border-black pt-0.5 font-bold" style={{ fontSize: '1.2em' }}>
            <span>Net Amt</span><span>{inr0(t.netAmount)}</span>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------- tax summary -- */}
      <Rule />
      <div className="text-center font-bold">TAX SUMMARY</div>
      <table className="mt-0.5 w-full border-collapse">
        <thead>
          <tr className="border-y border-black">
            <th className={th + ' text-left'} rowSpan={2}>HSN</th>
            <th className={th + ' text-right'} rowSpan={2}>Taxable Value</th>
            <th className={th + ' text-center'} colSpan={2}>CGST</th>
            <th className={th + ' text-center'} colSpan={2}>SGST</th>
            <th className={th + ' text-right'} rowSpan={2}>Total Tax</th>
          </tr>
          <tr className="border-b border-black">
            <th className={th + ' text-right'}>Rate</th>
            <th className={th + ' text-right'}>Amount</th>
            <th className={th + ' text-right'}>Rate</th>
            <th className={th + ' text-right'}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {hsnRows.map((h) => (
            <tr key={h.hsn + h.rate}>
              <td className={td}>{h.hsn}</td>
              <td className={td + ' text-right'}>{inr(h.taxable)}</td>
              <td className={td + ' text-right'}>{r2(h.rate / 2)}%</td>
              <td className={td + ' text-right'}>{inr(h.tax / 2)}</td>
              <td className={td + ' text-right'}>{r2(h.rate / 2)}%</td>
              <td className={td + ' text-right'}>{inr(h.tax / 2)}</td>
              <td className={td + ' text-right'}>{inr(h.tax)}</td>
            </tr>
          ))}
          <tr className="border-t border-black font-bold">
            <td className={td}>Totals</td>
            <td className={td + ' text-right'}>{inr(t.taxable)}</td>
            <td className={td} />
            <td className={td + ' text-right'}>{inr(t.cgst)}</td>
            <td className={td} />
            <td className={td + ' text-right'}>{inr(t.sgst)}</td>
            <td className={td + ' text-right'}>{inr(t.taxSum)}</td>
          </tr>
        </tbody>
      </table>

      {/* ------------------------------------------------- footer -- */}
      <Rule />
      <div className="text-center font-bold">{THANK_YOU}</div>
      <div className="mt-1" style={{ breakInside: 'avoid' }}>
        <div className="font-bold">Terms &amp; Conditions:</div>
        {termLines.map((line, i) => <div key={i}>{line}</div>)}
      </div>
      {/* the bill's barcode, as on the receipt */}
      <div className="mt-2 flex justify-center">
        <BarcodeSvg value={doc.invoiceNo || ''} height={40} width={1.8} displayValue fontSize={13} className="block h-[16mm] w-[70mm]" />
      </div>
      <div className="mt-2 text-center font-bold" style={{ fontSize: '1.1em' }}>{FOOTER_NOTE}</div>
    </main>
  );
}
