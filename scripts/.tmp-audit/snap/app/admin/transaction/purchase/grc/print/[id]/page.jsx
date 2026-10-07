// 'use client';
// import { use } from 'react';
// import GrcPrintView from '@/components/GrcPrintView';

// /* GRC Print - /admin/transaction/purchase/grc/print/<id>
//    Reached from the Action ▾ menu on the Goods Receipt Challan list. */

// export default function GrcPrintPage({ params }) {
//   const { id } = use(params);
//   return <GrcPrintView id={id} />;
// }




//sagar

'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

/* Printable GRC receipt: header fields + the complete line-item grid,
   matching what was saved from GCRBarcodeGeneration.jsx. Opens in a normal
   page (not a popup) so the browser's own print dialog (Ctrl/Cmd+P or the
   button below) handles pagination. Print-only styling hides the button
   and any app chrome via the @media print rules. */
export default function GrcPrintPage() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/grc/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message || 'Failed to load'));
  }, [id]);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-slate-500">Loading...</div>;

  const { grc, rows } = data;

  const totalQty = rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
  const totalGst = rows.reduce((s, r) => s + (parseFloat(r.gst) || 0), 0);
  const totalNet = rows.reduce(
    (s, r) => s + (parseFloat(r.finalNet || r.purRate) || 0) * (parseFloat(r.qty) || 0),
    0
  );

  return (
    <div className="max-w-5xl mx-auto p-6 text-slate-800 text-sm print:p-0">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      <div className="no-print flex justify-end mb-4">
        <button
          onClick={() => window.print()}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded shadow-sm"
        >
          Print
        </button>
      </div>

      <div className="border border-slate-300 rounded-lg p-6">
        <h1 className="text-lg font-bold mb-1">Goods Receipt Challan</h1>
        <p className="text-xs text-slate-500 mb-4">GRC No: {grc.grcNumber}</p>

        <div className="grid grid-cols-3 gap-3 mb-6 text-xs">
          <Field label="GRC Date" value={fmtDate(grc.grcDate)} />
          <Field label="Vendor Doc No" value={grc.vendorDocNo} />
          <Field label="Vendor Doc Date" value={fmtDate(grc.vendorDocDate)} />
          <Field label="Occasion" value={grc.occasion} />
          <Field label="Total Quantity" value={grc.totalQuantity} />
          <Field label="GST" value={grc.gst} />
          <Field label="Taxable" value={grc.taxable} />
          <Field label="Net Amount" value={grc.netAmount} />
        </div>

        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="bg-slate-100">
              {[
                'Sl No', 'Old Barcode', 'Item Code', 'Batch/Unique', 'Description', 'Qty', 'UOM',
                'HSN', 'Pur Rate', 'Disc', 'Final Net', 'GST %', 'Retail Price', 'Offer Price',
                'Barcode',
              ].map((h) => (
                <th key={h} className="border border-slate-300 px-2 py-1 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r._id || i}>
                <td className="border border-slate-200 px-2 py-1">{i + 1}</td>
                <td className="border border-slate-200 px-2 py-1">{r.oldBarcode}</td>
                <td className="border border-slate-200 px-2 py-1">{r.itemCode}</td>
                <td className="border border-slate-200 px-2 py-1">{r.batchUnique}</td>
                <td className="border border-slate-200 px-2 py-1">{r.supplierDescription}</td>
                <td className="border border-slate-200 px-2 py-1">{r.qty}</td>
                <td className="border border-slate-200 px-2 py-1">{r.uom}</td>
                <td className="border border-slate-200 px-2 py-1">{r.hsn}</td>
                <td className="border border-slate-200 px-2 py-1">{r.purRate}</td>
                <td className="border border-slate-200 px-2 py-1">{r.disc}</td>
                <td className="border border-slate-200 px-2 py-1">{r.finalNet}</td>
                <td className="border border-slate-200 px-2 py-1">{r.gst}</td>
                <td className="border border-slate-200 px-2 py-1">{r.retailPrice}</td>
                <td className="border border-slate-200 px-2 py-1">{r.offerPrice}</td>
                <td className="border border-slate-200 px-2 py-1 font-mono">{r.barcodeGenerated}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="bg-slate-100 font-semibold">
              <td colSpan={5} className="border border-slate-300 px-2 py-1 text-right">Totals</td>
              <td className="border border-slate-300 px-2 py-1">{totalQty}</td>
              <td colSpan={5} className="border border-slate-300"></td>
              <td className="border border-slate-300 px-2 py-1">{totalGst.toFixed(2)}</td>
              <td colSpan={2} className="border border-slate-300"></td>
              <td className="border border-slate-300 px-2 py-1">₹ {totalNet.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div className="text-slate-400 uppercase tracking-wide text-[10px]">{label}</div>
      <div className="font-medium">{value || '-'}</div>
    </div>
  );
}

function fmtDate(d) {
  if (!d) return '';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString();
}