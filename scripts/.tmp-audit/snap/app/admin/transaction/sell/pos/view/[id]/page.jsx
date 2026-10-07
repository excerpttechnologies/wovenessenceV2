'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProductImage from '@/components/ProductImage';
import BarcodeSvg from '@/components/BarcodeSvg';

/* View POS.

   The item table now shows the product PHOTO and the BARCODE of each unit
   sold. Both were already on the invoice document - the till writes them with
   every scanned line - but this screen dropped them, so the one place a
   manager reviews a sale could not answer "which physical piece was that"
   or "what did it look like".

   The invoice number also prints as a scannable barcode, so a paper receipt
   brought back to the counter opens its own transaction. */

const money = (value) => Number(value || 0).toFixed(2);

export default function ViewPosPage() {
  const { id } = useParams();
  const router = useRouter();
  const [doc, setDoc] = useState(null);

  useEffect(() => {
    fetch('/api/sell-pos/' + id).then((r) => r.json()).then((d) => setDoc(d.doc || null));
  }, [id]);

  if (!doc) return <div className="card p-6">Loading POS invoice...</div>;
  const payments = (doc.payments || []).filter((payment) => Number(payment.amount || 0) > 0);
  const displayedPayments = payments.length ? payments : (doc.paid > 0 ? [{ amount: doc.paid, method: doc.billingType || 'Cash', note: '' }] : []);

  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold">View POS</h1>
        <div className="flex items-center gap-4">
          {doc.invoiceNo && (
            <div className="text-center">
              <BarcodeSvg value={doc.invoiceNo} height={38} displayValue className="block h-[50px] w-[180px]" />
              <div className="text-[10px] text-inkmuted">Scan to find this sale</div>
            </div>
          )}
          <button className="btn" onClick={() => router.back()}>Back</button>
        </div>
      </div>
      <div className="grid gap-2 border-b border-line pb-4 text-[13px] md:grid-cols-2">
        <div><b>Invoice No:</b> {doc.invoiceNo || '-'}</div><div><b>Invoice Date:</b> {doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'}</div>
        <div><b>Status:</b> {doc.status || doc.paymentStatus || '-'}</div><div><b>Payment status:</b> {doc.paymentStatus || '-'}</div>
        <div><b>Business:</b> {doc.businessName || '-'}</div><div><b>Location:</b> {doc.locationName || '-'}</div>
        <div><b>Billing Type:</b> {doc.billingType || '-'}</div><div><b>Counter:</b> {doc.counterName || '-'}</div>
        <div><b>Customer:</b> {doc.customerName || 'Walk-in Customer'}</div><div><b>Customer Contact:</b> {doc.customerContact || '-'}</div>
        <div><b>Customer Email:</b> {doc.customerEmail || '-'}</div><div><b>Customer Address:</b> {doc.customerAddress || '-'}</div>
        <div><b>Exempted:</b> {doc.exempted || 'NO'}</div>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="dt"><thead><tr>{['Image', 'Barcode No', 'Item Code', 'Item Name', 'HSN', 'GST (%)', 'Quantity', 'RSP', 'Discount', 'Tax', 'Subtotal'].map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{(doc.items || []).map((item, i) => <tr key={i}><td><ProductImage src={item.image} alt={item.itemName || item.name || item.itemCode} size={52} /></td><td className="font-mono text-[12px]">{item.barcodeNo || item.barcode || '-'}</td><td>{item.code || item.itemCode || '-'}</td><td>{item.description || item.itemName || item.name || '-'}</td><td>{item.hsn || '-'}</td><td>{money(item.gst)}</td><td>{item.qty || 0}</td><td>{money(item.rsp)}</td><td>{money(item.discountAmount || Number(item.rsp || 0) * Number(item.qty || 0) * Number(item.discountPct || 0) / 100)}</td><td>{money(Number(item.lineTotal || 0) * Number(item.gst || 0) / 100)}</td><td>{money(item.lineTotal)}</td></tr>)}</tbody><tfoot><tr><td colSpan="10" className="text-right font-bold">Total Payable</td><td className="font-bold">{money(doc.totalAmount)}</td></tr><tr><td colSpan="10" className="text-right font-bold">Total Paid</td><td>{money(doc.paid)}</td></tr><tr><td colSpan="10" className="text-right font-bold">Total Remaining</td><td>{money(doc.sellDue)}</td></tr></tfoot></table></div>
      <div className="mt-5 overflow-x-auto"><h2 className="mb-2 font-semibold">Payment Methods</h2><table className="dt"><thead><tr>{['Date', 'Amount', 'Payment Method', 'Payment Note'].map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{displayedPayments.length ? displayedPayments.map((payment, i) => <tr key={i}><td>{doc.date ? new Date(doc.date).toLocaleDateString('en-GB') : '-'}</td><td>{money(payment.amount)}</td><td>{payment.method || '-'}</td><td>{payment.note || '-'}</td></tr>) : <tr><td colSpan="4" className="dt-empty">No payments recorded.</td></tr>}</tbody></table></div>
      <div className="mt-4 grid gap-2 text-[13px] md:grid-cols-2"><div><b>Sell note:</b> {doc.sellNote || '-'}</div><div><b>Staff note:</b> {doc.staffNote || '-'}</div></div>
    </div>
  );
}
