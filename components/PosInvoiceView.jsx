'use client';
import { useEffect, useRef, useState } from 'react';
import ProductImage from '@/components/ProductImage';
import BarcodeSvg from '@/components/BarcodeSvg';
import Icon from '@/components/Icon';
import { shareEmail } from '@/lib/shareRoutes';

/* View POS - the body of one POS invoice.

   Shared by the stand-alone page (/admin/transaction/sell/pos/view/<id>) and
   the popup the POS list opens from its View button, so the two cannot show
   different things.

   The item table shows the product PHOTO and the BARCODE of each unit sold.
   Both were already on the invoice document - the till writes them with
   every scanned line - so a manager reviewing a sale can answer "which
   physical piece was that" or "what did it look like".

   The invoice number also prints as a scannable barcode, so a paper receipt
   brought back to the counter opens its own transaction.

   `onBack` is the Back / Close button: router.back() on the page, closing the
   popup on the list. */

/* whole rupees - the paise are dropped, not rounded, the same rule as the
   POS list and the Payments popup */
const money = (value) => String(Math.trunc(Number(value || 0)));
/* GST is a PERCENTAGE - it keeps a real fraction (2.5), loses a pointless
   one (5, not 5.00) */
const gstPct = (value) => String(Math.round(Number(value || 0) * 100) / 100);

/* `endpoint` (21-10-2026): where the bill is read from - the live POS bills by
   default; Archive -> POS Bills points it at /api/pos-archive/ */
export default function PosInvoiceView({ id, onBack, backLabel = 'Back', endpoint = '/api/sell-pos/' }) {
  const [doc, setDoc] = useState(null);
  /* the enlarged product photo - same behaviour as the POS till: hovering
     the thumbnail opens it, leaving the cell closes it; clicking opens one
     that stays until closed */
  const [previewImage, setPreviewImage] = useState(null);
  /* what the last share button did, for one line of feedback */
  const [shareNote, setShareNote] = useState(null);   // { error } | { notice }
  /* this screen, turned into the shared PDF (23-10-2026) */
  const viewRef = useRef(null);

  useEffect(() => {
    setDoc(null);
    fetch(endpoint + id, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => setDoc(d.doc || null));
  }, [id, endpoint]);

  if (!doc) return <div className="p-6">Loading POS invoice...</div>;
  const payments = (doc.payments || []).filter((payment) => Number(payment.amount || 0) > 0);
  const displayedPayments = payments.length ? payments : (doc.paid > 0 ? [{ amount: doc.paid, method: doc.billingType || 'Cash', note: '' }] : []);
  /* what went back to the customer - paid over the bill, same figure as
     the printed invoice and the Payments popup */
  const changeReturn = Math.max(0, Number(doc.paid || 0) - Number(doc.totalAmount || 0));

  /* ADDITIONAL DETAILS (user, 26-10-2026): item count / total qty / net
     badges, per-line tax and price incl. tax, payment total, and a Tax &
     Amount Summary. A line is worth its saved netAmount (lineTotal on older
     bills, else rsp x qty less discount); RSP is GST-inclusive, so the tax
     is backed out of the line, as on the printed invoice. */
  const money2 = (value) => (Math.round(Number(value || 0) * 100) / 100).toFixed(2);
  const lineNetOf = (item) => {
    const stored = Number(item.netAmount ?? item.lineTotal ?? NaN);
    if (Number.isFinite(stored)) return stored;
    return Number(item.rsp || 0) * Number(item.qty || 0) * (1 - Number(item.discountPct || 0) / 100);
  };
  const lineTaxOf = (item) => { const net = lineNetOf(item); return net - net / (1 + Number(item.gst || 0) / 100); };
  const billItems = doc.items || [];
  const totalQty = Math.round(billItems.reduce((sum, item) => sum + Number(item.qty || 0), 0) * 1000) / 1000;
  const itemsSubTotal = billItems.reduce((sum, item) => sum + lineNetOf(item), 0);
  const taxTotal = billItems.reduce((sum, item) => sum + lineTaxOf(item), 0);
  const taxableAmount = itemsSubTotal - taxTotal;
  const shippingAmount = Number(doc.shipping || 0);
  const roundOff = Number(doc.totalAmount || 0) - itemsSubTotal - shippingAmount;
  const paymentsTotal = displayedPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  /* THE MESSAGE the share routes send - built from this bill only. Whole
     rupees, as on the till. */
  const rupees = (v) => 'Rs ' + Math.trunc(Number(v || 0));
  const shareLines = [
    'Invoice No: ' + (doc.invoiceNo || '-'),
    'Date: ' + (doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'),
    'Customer: ' + (doc.customerName || 'Walk-in Customer'),
    '',
    'Items:',
    ...(doc.items || []).map((item, i) => (i + 1) + '. '
      + (item.description || item.itemName || item.name || item.itemCode || 'Item')
      + ' x ' + (item.qty || 0) + ' = ' + rupees(item.netAmount ?? item.lineTotal)),
    '',
    'Total: ' + rupees(doc.totalAmount),
    'Paid: ' + rupees(doc.paid),
    ...(changeReturn > 0 ? ['Cash Return: ' + rupees(changeReturn)] : []),
    ...(Number(doc.sellDue || 0) > 0 ? ['Balance Due: ' + rupees(doc.sellDue)] : []),
    '',
    /* fixed wording (user, 22-10-2026) */
    'Thank you for shopping with wovenessence by TEMPLE FABRICS.',
  ];
  const shareSubject = 'Invoice ' + (doc.invoiceNo || '') + ' - ' + (doc.businessName || '');
  const shareMessage = [shareSubject, '', ...shareLines].join('\n');

  /* WHATSAPP / EMAIL SHARE THIS SCREEN AS A PDF LINK (user, 23-10-2026), the
     same way as the invoice print page: the view is turned into a PDF in the
     browser (html2pdf.js), stored behind a link by app/api/invoice-share,
     and the message carries the link. Left out of the PDF - marked
     data-html2canvas-ignore below - are the buttons and the Sell / Staff
     note line. The window is opened inside the click so it is not blocked
     as a pop-up, then pointed at WhatsApp Web / Gmail once the link is ready;
     a phone uses the WhatsApp app / its mail app. */
  async function shareViewPdf(target) {
    const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent || '');
    const win = target === 'whatsapp' || !isPhone ? window.open('about:blank', '_blank') : null;
    if ((target === 'whatsapp' || !isPhone) && !win) {
      setShareNote({ error: 'The browser blocked the ' + (target === 'email' ? 'Gmail' : 'WhatsApp') + ' window. Allow pop-ups for this site and try again.' });
      return;
    }
    let link = '';
    try {
      setShareNote({ notice: 'Preparing the PDF...' });
      const html2pdf = (await import('html2pdf.js')).default;
      const element = viewRef.current;
      if (!element) throw new Error('Invoice not found on the page.');
      const pxToMm = (px) => (px * 25.4) / 96;
      const wMm = pxToMm(element.scrollWidth);
      const hMm = pxToMm(element.scrollHeight) + 2;
      const pdfName = 'Invoice_' + String(doc.invoiceNo || id).replace(/[^\w-]+/g, '_') + '.pdf';
      const blob = await html2pdf().set({
        margin: 0,
        filename: pdfName,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: [wMm, hMm], orientation: hMm >= wMm ? 'portrait' : 'landscape' },
      }).from(element).outputPdf('blob');

      setShareNote({ notice: 'Creating the invoice link...' });
      const form = new FormData();
      form.append('invoiceId', String(doc._id || id));
      form.append('file', new File([blob], pdfName, { type: 'application/pdf' }));
      const r = await fetch('/api/invoice-share', { method: 'POST', body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.path) throw new Error(d.error || 'Could not create the invoice link.');
      link = window.location.origin + d.path;
    } catch (e) {
      if (win) win.close();
      setShareNote({ error: (e && e.message) || 'Could not create the invoice link.' });
      return;
    }
    const text = shareSubject + '\n'
      + 'Amount: Rs ' + Math.trunc(Number(doc.totalAmount || 0)) + '\n\n'
      + 'Download your invoice: ' + link + '\n\n'
      + 'Thank you for shopping with wovenessence by TEMPLE FABRICS.';
    if (target === 'whatsapp') {
      try { win.opener = null; } catch { /* ignore */ }
      win.location.href = (isPhone ? 'https://wa.me/?text=' : 'https://web.whatsapp.com/send?text=') + encodeURIComponent(text);
      setShareNote({ notice: 'WhatsApp opened with the invoice link - pick the person and send.' });
    } else if (win) {
      try { win.opener = null; } catch { /* ignore */ }
      win.location.href = 'https://mail.google.com/mail/?view=cm&fs=1&su=' + encodeURIComponent(shareSubject) + '&body=' + encodeURIComponent(text);
      setShareNote({ notice: 'Gmail opened with the invoice link - enter the customer\'s email and send.' });
    } else {
      setShareNote(shareEmail(shareSubject, text));
    }
  }

  return (
    <div className="p-5" ref={viewRef}>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">View POS</h1>
        <div className="flex items-center gap-4">
          {doc.invoiceNo && (
            <div className="text-center">
              <BarcodeSvg value={doc.invoiceNo} height={38} displayValue className="block h-[50px] w-[180px]" />
              <div className="text-[10px] text-inkmuted">Scan to find this sale</div>
            </div>
          )}
          {/* SHARE DIRECTLY - one button per route, no panel in between */}
          <div className="flex flex-col items-end gap-1" data-html2canvas-ignore="true">
            <div className="flex items-center gap-1.5">
              <button type="button" title="Share on WhatsApp" aria-label="Share on WhatsApp" className="flex h-9 w-9 items-center justify-center rounded bg-[#25D366] text-white hover:bg-[#1da851]" onClick={() => shareViewPdf('whatsapp')}><Icon name="whatsapp" size={18} /></button>
              {/* Instagram button removed (user, 23-10-2026) */}
              <button type="button" title="Share by Email" aria-label="Share by Email" className="flex h-9 w-9 items-center justify-center rounded bg-brand text-white hover:opacity-90" onClick={() => shareViewPdf('email')}><Icon name="mail" size={18} /></button>
              {/* an archived (deleted) bill is view-only - its print page reads live bills */}
              {doc.status !== 'ARCHIVED' && <button type="button" title="Print invoice" aria-label="Print invoice" className="flex h-9 w-9 items-center justify-center rounded bg-[#4b5563] text-white hover:bg-[#374151]" onClick={() => window.open('/admin/transaction/sell/pos/print/' + id, '_blank')}><Icon name="printer" size={18} /></button>}
            </div>
            {shareNote && (shareNote.error || shareNote.notice) && (
              <div className={'max-w-[320px] text-right text-[11px] ' + (shareNote.error ? 'text-danger' : 'text-inkmuted')}>
                {shareNote.error || shareNote.notice}
              </div>
            )}
          </div>
          {onBack && <button type="button" className="btn" data-html2canvas-ignore="true" onClick={onBack}>{backLabel}</button>}
        </div>
      </div>
      <div className="grid gap-2 border-b border-line pb-4 text-[13px] md:grid-cols-2">
        <div><b>Invoice No:</b> {doc.invoiceNo || '-'}</div><div><b>Invoice Date:</b> {doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'}</div>
        <div><b>Status:</b> {doc.status || doc.paymentStatus || '-'}</div><div><b>Payment status:</b> {doc.paymentStatus || '-'}</div>
        <div><b>Business:</b> {doc.businessName || '-'}</div><div><b>Location:</b> {doc.locationName || '-'}</div>
        <div><b>Billing Type:</b> {doc.billingType || '-'}</div><div><b>Counter:</b> {doc.counterName || '-'}</div>
        <div><b>Customer:</b> {doc.customerName || 'Walk-in Customer'}</div><div><b>Customer Contact:</b> {doc.customerContact || '-'}</div>
        <div><b>Customer Email:</b> {doc.customerEmail || '-'}</div><div><b>Customer Address:</b> {doc.customerAddress || '-'}</div>
        <div><b>Sales Person:</b> {doc.salesPersonName || '-'}</div>
        {/* <div><b>Exempted:</b> {doc.exempted || 'NO'}</div> */}
        <div><b>Exempted / International:</b> {doc.exempted || 'NO'}</div>
        {/* Created By (user, 26-10-2026): the bills do not record the user, so
            it reads as POS and the company the bill was made in */}
        <div><b>Created By:</b> POS{doc.businessName ? ' - ' + doc.businessName : ''}</div>
      </div>
      {/* item badges (26-10-2026) */}
      <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-[12px]">
        <span className="rounded border border-line bg-[#eef1f7] px-2 py-1 font-semibold">{billItems.length} Item{billItems.length === 1 ? '' : 's'}</span>
        <span className="rounded border border-line bg-[#eef1f7] px-2 py-1">Total Qty: <b>{totalQty}</b></span>
        <span className="rounded border border-line bg-[#eef1f7] px-2 py-1">Net Amount: <b>₹{money2(doc.totalAmount)}</b></span>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="dt"><thead><tr>{['Image', 'Barcode No', 'Item Code', 'Item Name', 'HSN', 'GST (%)', 'Quantity', 'RSP', 'Discount', 'Tax', 'Tax Amount', 'Price (Inc. Tax)', 'Subtotal'].map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{(doc.items || []).map((item, i) => <tr key={i}><td onMouseEnter={() => item.image && setPreviewImage({ src: item.image, alt: item.itemName || item.name || item.itemCode, hover: true })} onMouseLeave={() => setPreviewImage((p) => (p && p.hover ? null : p))}><ProductImage src={item.image} alt={item.itemName || item.name || item.itemCode} size={52} onOpen={item.image ? () => setPreviewImage({ src: item.image, alt: item.itemName || item.name || item.itemCode, hover: false }) : undefined} /></td><td className="font-mono text-[12px]">{item.barcodeNo || item.barcode || '-'}</td><td>{item.code || item.itemCode || '-'}</td><td>{item.description || item.itemName || item.name || '-'}</td><td>{item.hsn || '-'}</td><td>{gstPct(item.gst)}</td><td>{item.qty || 0}</td><td>{money(item.rsp)}</td><td>{money(item.discountAmount || Number(item.rsp || 0) * Number(item.qty || 0) * Number(item.discountPct || 0) / 100)}</td><td>{money(Number(item.lineTotal || 0) * Number(item.gst || 0) / 100)}</td><td>{money2(lineTaxOf(item))}</td><td>{money2(lineNetOf(item))}</td><td>{money(item.lineTotal)}</td></tr>)}</tbody><tfoot><tr><td colSpan="12" className="text-right font-bold">Total Payable</td><td className="font-bold">{money(doc.totalAmount)}</td></tr><tr><td colSpan="12" className="text-right font-bold">Total Paid</td><td>{money(doc.paid)}</td></tr><tr><td colSpan="12" className="text-right font-bold">Cash Return</td><td>{money(changeReturn)}</td></tr><tr><td colSpan="12" className="text-right font-bold">Total Remaining</td><td>{money(doc.sellDue)}</td></tr></tfoot></table></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="overflow-x-auto"><h2 className="mb-2 flex items-center justify-between font-semibold">Payment Methods<span className="rounded border border-line bg-[#eef1f7] px-2 py-0.5 text-[11px] font-semibold">{displayedPayments.length} Entr{displayedPayments.length === 1 ? 'y' : 'ies'}</span></h2><table className="dt"><thead><tr>{['Date', 'Amount', 'Payment Method', 'Payment Note'].map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{displayedPayments.length ? displayedPayments.map((payment, i) => <tr key={i}><td>{doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'}</td><td>{money(payment.amount)}</td><td>{payment.method || '-'}</td><td>{payment.note || '-'}</td></tr>) : <tr><td colSpan="4" className="dt-empty">No payments recorded.</td></tr>}</tbody>{displayedPayments.length > 0 && <tfoot><tr><td className="text-right font-bold">Total Paid</td><td className="font-bold">{money2(paymentsTotal)}</td><td colSpan="2" /></tr></tfoot>}</table></div>{/* Tax & Amount Summary (26-10-2026) */}<div><h2 className="mb-2 flex items-center justify-between font-semibold">Tax &amp; Amount Summary<span className="rounded border border-line bg-[#eef1f7] px-2 py-0.5 text-[11px] font-semibold">{doc.invoiceNo || '-'}</span></h2><table className="dt"><tbody><tr><td>Sub Total</td><td className="text-right">₹{money2(itemsSubTotal)}</td></tr>{shippingAmount > 0 && <tr><td>Shipping</td><td className="text-right">₹{money2(shippingAmount)}</td></tr>}<tr><td>Taxable Amount</td><td className="text-right">₹{money2(taxableAmount)}</td></tr><tr><td>Tax (CGST + SGST)</td><td className="text-right">₹{money2(taxTotal)}</td></tr><tr><td>Round Off</td><td className="text-right">₹{money2(roundOff)}</td></tr><tr><td>Total Paid</td><td className="text-right">₹{money2(doc.paid)}</td></tr><tr className="bg-[#e7f6ec]"><td className="font-bold">Net Amount</td><td className="text-right font-bold">₹{money2(doc.totalAmount)}</td></tr></tbody></table></div></div>
      {/* on screen only - not in the shared PDF (user, 23-10-2026) */}
      <div className="mt-4 grid gap-2 text-[13px] md:grid-cols-2" data-html2canvas-ignore="true"><div><b>Sell note:</b> {doc.sellNote || '-'}</div><div><b>Staff note:</b> {doc.staffNote || '-'}</div></div>
      {previewImage && (
        /* centred over everything, including the View popup (z-50). A hover
           preview is click-through (pointer-events-none) so it cannot sit
           under the cursor and fire mouseleave on the cell that opened it. */
        <div
          className={'fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-6' + (previewImage.hover ? ' pointer-events-none' : '')}
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-h-[70vh] max-w-2xl rounded bg-white p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            {!previewImage.hover && (
              <button type="button" aria-label="Close image preview" className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/70 text-white" onClick={() => setPreviewImage(null)}>&times;</button>
            )}
            <img src={previewImage.src} alt={previewImage.alt} className="max-h-[65vh] max-w-[60vw] object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
