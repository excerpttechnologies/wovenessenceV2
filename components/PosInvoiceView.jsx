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
/* the old Email button (Gmail with the invoice link) - hidden for now; the
   direct-email button replaces it (user, 27-10-2026) */
const SHOW_GMAIL_EMAIL = false;
/* the old WhatsApp Web link button - hidden; the WhatsApp button now sends
   the PDF directly to a typed number (user, 27-10-2026) */
const SHOW_WHATSAPP_WEB_LINK = false;
/* the WhatsApp App (whatsapp://) button - hidden (user, 27-10-2026) */
const SHOW_WHATSAPP_APP = false;

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
  /* the last WhatsApp-app link, for an "open it" fallback link (27-10-2026) */
  const [waAppUrl, setWaAppUrl] = useState('');
  /* the direct Email box - customer's address, and whether it is sending (27-10-2026) */
  const [emailBox, setEmailBox] = useState(null);     // { to, error } | null
  const [emailSending, setEmailSending] = useState(false);
  /* the direct WhatsApp box - customer's mobile, and whether it is sending (27-10-2026) */
  const [waBox, setWaBox] = useState(null);           // { to, error } | null
  const [waSending, setWaSending] = useState(false);
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
  /* this View screen as a PDF - used by the share link and the direct
     email (27-10-2026). Parts marked data-html2canvas-ignore are left out. */
  async function viewPdf() {
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
    return { blob, pdfName };
  }

  /* DIRECT EMAIL WITH THE PDF ATTACHED (user, 27-10-2026), as on the POS
     invoice page: the box takes the customer's address and
     app/api/invoice-email sends the PDF from the shop's Gmail in .env */
  async function sendViewEmail() {
    const to = String(emailBox?.to || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) { setEmailBox((b) => ({ ...b, error: 'Enter a valid email address.' })); return; }
    setEmailSending(true);
    setEmailBox((b) => ({ ...b, error: '' }));
    try {
      const { blob, pdfName } = await viewPdf();
      const form = new FormData();
      form.append('to', to);
      form.append('invoiceId', String(doc._id || id));
      form.append('file', new File([blob], pdfName, { type: 'application/pdf' }));
      const r = await fetch('/api/invoice-email', { method: 'POST', body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not send the email.');
      setEmailBox(null);
      setShareNote({ notice: 'Invoice emailed to ' + to + ' with the PDF attached.' });
    } catch (e) {
      setEmailBox((b) => (b ? { ...b, error: (e && e.message) || 'Could not send the email.' } : b));
    } finally {
      setEmailSending(false);
    }
  }

  /* DIRECT WHATSAPP WITH THE PDF (user, 27-10-2026): the box takes the
     customer's mobile and app/api/invoice-whatsapp sends the PDF from the
     shop's WhatsApp Business number (Cloud API, settings in .env) */
  async function sendViewWhatsApp() {
    const raw = String(waBox?.to || '').trim();
    const digits = raw.replace(/\D/g, '');
    if (digits.length < 10 || digits.length > 15) { setWaBox((b) => ({ ...b, error: 'Enter a valid mobile number.' })); return; }
    setWaSending(true);
    setWaBox((b) => ({ ...b, error: '' }));
    try {
      const { blob, pdfName } = await viewPdf();
      const form = new FormData();
      form.append('to', raw);
      form.append('invoiceId', String(doc._id || id));
      form.append('file', new File([blob], pdfName, { type: 'application/pdf' }));
      const r = await fetch('/api/invoice-whatsapp', { method: 'POST', body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not send on WhatsApp.');
      setWaBox(null);
      setShareNote({ notice: 'Invoice PDF sent on WhatsApp to ' + (d.to || raw) + '.' });
    } catch (e) {
      setWaBox((b) => (b ? { ...b, error: (e && e.message) || 'Could not send on WhatsApp.' } : b));
    } finally {
      setWaSending(false);
    }
  }

  async function shareViewPdf(target) {
    const isPhone = /Android|iPhone|iPad/i.test(navigator.userAgent || '');
    setWaAppUrl('');
    /* the WhatsApp APP opens through whatsapp:// - no browser window needed */
    const needsWin = target !== 'whatsapp-app' && (target === 'whatsapp' || !isPhone);
    const win = needsWin ? window.open('about:blank', '_blank') : null;
    if (needsWin && !win) {
      setShareNote({ error: 'The browser blocked the ' + (target === 'email' ? 'Gmail' : 'WhatsApp') + ' window. Allow pop-ups for this site and try again.' });
      return;
    }
    let link = '';
    try {
      setShareNote({ notice: 'Preparing the PDF...' });
      const { blob, pdfName } = await viewPdf();

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
    if (target === 'whatsapp-app') {
      /* WHATSAPP APP (user, 27-10-2026): whatsapp:// opens the installed
         WhatsApp app with the message; if the browser holds the launch
         back, the "Open WhatsApp app" link below opens it by hand */
      const appUrl = 'whatsapp://send?text=' + encodeURIComponent(text);
      setWaAppUrl(appUrl);
      window.location.href = appUrl;
      setShareNote({ notice: 'WhatsApp app opened with the invoice link - pick the person and send. Nothing opened? Use the link below, or install WhatsApp for Windows.' });
    } else if (target === 'whatsapp') {
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
              {/* the WhatsApp Web link button - HIDDEN for now (user, 27-10-2026);
                  set SHOW_WHATSAPP_WEB_LINK to true to bring it back */}
              {SHOW_WHATSAPP_WEB_LINK && <button type="button" title="Share on WhatsApp Web" aria-label="Share on WhatsApp Web" className="flex h-9 w-9 items-center justify-center rounded bg-[#25D366] text-white hover:bg-[#1da851]" onClick={() => shareViewPdf('whatsapp')}><Icon name="whatsapp" size={18} /></button>}
              {/* DIRECT WHATSAPP (27-10-2026): type the customer's mobile, the PDF is sent from the shop's WhatsApp number */}
              <button type="button" title="Send the invoice PDF on WhatsApp" aria-label="Send the invoice PDF on WhatsApp" className="flex h-9 w-9 items-center justify-center rounded bg-[#25D366] text-white hover:bg-[#1da851]" onClick={() => { setShareNote(null); setWaBox({ to: doc.customerContact || '', error: '' }); }}><Icon name="whatsapp" size={18} /></button>
              {/* WHATSAPP APP (27-10-2026): the same link message, opened in the installed WhatsApp app.
                  HIDDEN for now (user, 27-10-2026); set SHOW_WHATSAPP_APP to true to bring it back */}
              {SHOW_WHATSAPP_APP && <button type="button" title="Share on WhatsApp App" aria-label="Share on WhatsApp App" className="flex h-9 items-center justify-center gap-1 rounded bg-[#128C7E] px-2 text-[11px] font-bold text-white hover:bg-[#0e6f64]" onClick={() => shareViewPdf('whatsapp-app')}><Icon name="whatsapp" size={16} /> App</button>}
              {/* Instagram button removed (user, 23-10-2026) */}
              {/* the Gmail-with-link Email button - HIDDEN for now (user, 27-10-2026);
                  set SHOW_GMAIL_EMAIL to true to bring it back */}
              {SHOW_GMAIL_EMAIL && <button type="button" title="Share by Email" aria-label="Share by Email" className="flex h-9 w-9 items-center justify-center rounded bg-brand text-white hover:opacity-90" onClick={() => shareViewPdf('email')}><Icon name="mail" size={18} /></button>}
              {/* DIRECT EMAIL (27-10-2026): type the customer's address, the PDF is sent from the shop's account */}
              <button type="button" title="Email the invoice PDF" aria-label="Email the invoice PDF" className="flex h-9 w-9 items-center justify-center rounded bg-brand text-white hover:opacity-90" onClick={() => { setShareNote(null); setEmailBox({ to: doc.customerEmail || '', error: '' }); }}><Icon name="mail" size={18} /></button>
              {/* an archived (deleted) bill is view-only - its print page reads live bills */}
              {doc.status !== 'ARCHIVED' && <button type="button" title="Print invoice" aria-label="Print invoice" className="flex h-9 w-9 items-center justify-center rounded bg-[#4b5563] text-white hover:bg-[#374151]" onClick={() => window.open('/admin/transaction/sell/pos/print/' + id, '_blank')}><Icon name="printer" size={18} /></button>}
            </div>
            {shareNote && (shareNote.error || shareNote.notice) && (
              <div className={'max-w-[320px] text-right text-[11px] ' + (shareNote.error ? 'text-danger' : 'text-inkmuted')}>
                {shareNote.error || shareNote.notice}
              </div>
            )}
            {/* by-hand fallback when the browser did not launch the WhatsApp app */}
            {waAppUrl && (
              <a href={waAppUrl} className="text-[11px] font-semibold text-brand underline">Open WhatsApp app</a>
            )}
          </div>
          {onBack && <button type="button" className="btn" data-html2canvas-ignore="true" onClick={onBack}>{backLabel}</button>}
        </div>
      </div>
      <div className="grid gap-2 border-b border-line pb-4 text-[13px] md:grid-cols-2">
        <div><b>Invoice No:</b> {doc.invoiceNo || '-'}</div><div><b>Invoice Date:</b> {doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'}</div>
        <div><b>Status:</b> {doc.status || doc.paymentStatus || '-'}</div><div><b>Payment status:</b> {doc.paymentStatus || '-'}</div>
        <div><b>Business:</b> {doc.businessName || '-'}</div><div><b>Location:</b> {doc.locationName || '-'}</div>
        <div><b>Billing Type:</b> {doc.billingType || '-'}</div><div><b>Counter:</b> {doc.counterName || '-'}</div><div><b>Sales Channel:</b> {doc.salesChannel === 'instagram' ? 'Instagram' : 'Offline Store'}</div>
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
      <div className="mt-4 overflow-x-auto"><table className="dt"><thead><tr>{['Image', 'Barcode No / Item Name', 'Item Code', 'HSN', 'GST (%)', 'Quantity', 'RSP', 'Discount', 'Tax', 'Tax Amount', 'Price (Inc. Tax)', 'Subtotal'].map((x) => <th key={x}>{x === 'Barcode No / Item Name' ? <>Barcode No<br />/ Item Name</> : x}</th>)}</tr></thead><tbody>{(doc.items || []).map((item, i) => <tr key={i}><td onMouseEnter={() => item.image && setPreviewImage({ src: item.image, alt: item.itemName || item.name || item.itemCode, hover: true })} onMouseLeave={() => setPreviewImage((p) => (p && p.hover ? null : p))}><ProductImage src={item.image} alt={item.itemName || item.name || item.itemCode} size={52} onOpen={item.image ? () => setPreviewImage({ src: item.image, alt: item.itemName || item.name || item.itemCode, hover: false }) : undefined} /></td>{/* Barcode No and Item Name in ONE column, the name under the barcode (user, 27-10-2026); Item Name = the item's own name, not its print description */}<td><div className="font-mono text-[12px]">{item.barcodeNo || item.barcode || '-'}</div><div className="text-[12px] text-inkmuted">{item.itemName || item.name || item.description || '-'}</div></td><td>{item.code || item.itemCode || '-'}</td><td>{item.hsn || '-'}</td><td>{gstPct(item.gst)}</td><td>{item.qty || 0}</td><td>{money(item.rsp)}</td><td>{money(item.discountAmount || Number(item.rsp || 0) * Number(item.qty || 0) * Number(item.discountPct || 0) / 100)}</td><td>{money(Number(item.lineTotal || 0) * Number(item.gst || 0) / 100)}</td><td>{money2(lineTaxOf(item))}</td><td>{money2(lineNetOf(item))}</td><td>{money(item.lineTotal)}</td></tr>)}</tbody><tfoot><tr><td colSpan="11" className="text-right font-bold">Total Payable</td><td className="font-bold">{money(doc.totalAmount)}</td></tr><tr><td colSpan="11" className="text-right font-bold">Total Paid</td><td>{money(doc.paid)}</td></tr><tr><td colSpan="11" className="text-right font-bold">Cash Return</td><td>{money(changeReturn)}</td></tr><tr><td colSpan="11" className="text-right font-bold">Total Remaining</td><td>{money(doc.sellDue)}</td></tr></tfoot></table></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2"><div className="overflow-x-auto"><h2 className="mb-2 flex items-center justify-between font-semibold">Payment Methods<span className="rounded border border-line bg-[#eef1f7] px-2 py-0.5 text-[11px] font-semibold">{displayedPayments.length} Entr{displayedPayments.length === 1 ? 'y' : 'ies'}</span></h2><table className="dt"><thead><tr>{['Date', 'Amount', 'Payment Method', 'Payment Note'].map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{displayedPayments.length ? displayedPayments.map((payment, i) => <tr key={i}><td>{doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'}</td><td>{money(payment.amount)}</td><td>{payment.method || '-'}</td><td>{payment.note || '-'}</td></tr>) : <tr><td colSpan="4" className="dt-empty">No payments recorded.</td></tr>}</tbody>{displayedPayments.length > 0 && <tfoot><tr><td className="text-right font-bold">Total Paid</td><td className="font-bold">{money2(paymentsTotal)}</td><td colSpan="2" /></tr></tfoot>}</table></div>{/* Tax & Amount Summary (26-10-2026) */}<div><h2 className="mb-2 flex items-center justify-between font-semibold">Tax &amp; Amount Summary<span className="rounded border border-line bg-[#eef1f7] px-2 py-0.5 text-[11px] font-semibold">{doc.invoiceNo || '-'}</span></h2><table className="dt"><tbody><tr><td>Sub Total</td><td className="text-right">₹{money2(itemsSubTotal)}</td></tr>{shippingAmount > 0 && <tr><td>Shipping</td><td className="text-right">₹{money2(shippingAmount)}</td></tr>}<tr><td>Taxable Amount</td><td className="text-right">₹{money2(taxableAmount)}</td></tr><tr><td>Tax (CGST + SGST)</td><td className="text-right">₹{money2(taxTotal)}</td></tr><tr><td>Round Off</td><td className="text-right">₹{money2(roundOff)}</td></tr><tr><td>Total Paid</td><td className="text-right">₹{money2(doc.paid)}</td></tr><tr className="bg-[#e7f6ec]"><td className="font-bold">Net Amount</td><td className="text-right font-bold">₹{money2(doc.totalAmount)}</td></tr></tbody></table></div></div>
      {/* on screen only - not in the shared PDF (user, 23-10-2026) */}
      <div className="mt-4 grid gap-2 text-[13px] md:grid-cols-2" data-html2canvas-ignore="true"><div><b>Sell note:</b> {doc.sellNote || '-'}</div><div><b>Staff note:</b> {doc.staffNote || '-'}</div></div>
      {/* DIRECT WHATSAPP BOX (27-10-2026) - never part of the PDF */}
      {waBox && (
        <div data-html2canvas-ignore="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!waSending) setWaBox(null); }}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-[15px] font-bold">Send invoice {doc.invoiceNo || ''} on WhatsApp</div>
            <div className="mb-3 text-[12px] text-inkmuted">The invoice PDF is sent straight to this WhatsApp number.</div>
            <label className="f-label">Customer mobile number</label>
            <input
              type="tel"
              className="f-input w-full"
              placeholder="9876543210"
              autoFocus
              value={waBox.to}
              disabled={waSending}
              onChange={(e) => setWaBox((b) => ({ ...b, to: e.target.value, error: '' }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendViewWhatsApp(); } }}
            />
            <div className="mt-1 text-[11px] text-inkmuted">10-digit number, or with country code (91 is added automatically).</div>
            {waBox.error && <div className="f-err mt-1">{waBox.error}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" disabled={waSending} onClick={() => setWaBox(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={waSending} onClick={sendViewWhatsApp}>
                {waSending ? 'Sending...' : <><Icon name="whatsapp" size={14} /> Send</>}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* DIRECT EMAIL BOX (27-10-2026) - never part of the PDF */}
      {emailBox && (
        <div data-html2canvas-ignore="true" className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!emailSending) setEmailBox(null); }}>
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 text-[15px] font-bold">Email invoice {doc.invoiceNo || ''}</div>
            <div className="mb-3 text-[12px] text-inkmuted">The invoice PDF is sent straight to this address as an attachment.</div>
            <label className="f-label">Customer email</label>
            <input
              type="email"
              className="f-input w-full"
              placeholder="customer@example.com"
              autoFocus
              value={emailBox.to}
              disabled={emailSending}
              onChange={(e) => setEmailBox((b) => ({ ...b, to: e.target.value, error: '' }))}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); sendViewEmail(); } }}
            />
            {emailBox.error && <div className="f-err mt-1">{emailBox.error}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" disabled={emailSending} onClick={() => setEmailBox(null)}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={emailSending} onClick={sendViewEmail}>
                {emailSending ? 'Sending...' : <><Icon name="mail" size={14} /> Send</>}
              </button>
            </div>
          </div>
        </div>
      )}
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
