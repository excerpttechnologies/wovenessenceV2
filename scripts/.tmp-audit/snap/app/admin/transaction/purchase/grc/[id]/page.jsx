// 'use client';
// import { use } from 'react';
// import TransactionFormView from '@/components/TransactionFormView';
// import { FORM } from '../form';

// /* Edit Goods Receiptc Challans */

// export default function EditTransactionPurchaseGrcPage({ params }) {
//   const { id } = use(params);

//   return (
//     <TransactionFormView
//       id={id}
//       cfg={{
//         title: "Goods Receiptc Challans",
//         addTitle: "Edit Goods Receiptc Challans",
//         basePath: '/admin/',
//         slugPath: "transaction/purchase/grc",
//         endpoint: '/api/purchase-grc',
//         scope: ["business","location","finYear"],
//         docType: "Goods Receipt Challan",
//         form: FORM,
//       }}
//     />
//   );
// }




//sagara

'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Field from '@/components/Field';
import { FORM } from '../form';
import { useScope } from '@/components/ScopeContext';
import PurchaseInvoicePrintView from '@/components/PurchaseInvoicePrintView';

const fields = FORM.cards.flatMap((card) => card.fields || []);
const number = (value) => Number(value) || 0;

export default function EditTransactionPurchaseGrcPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const scope = useScope();
  const [data, setData] = useState({});
  const [supplierOption, setSupplierOption] = useState(null);
  const [rows, setRows] = useState([]);
  const [tab, setTab] = useState(searchParams.get('tab') === 'summary' ? 'summary' : 'items');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);
  const [invoiceId, setInvoiceId] = useState(null);
  const [showInvoice, setShowInvoice] = useState(false);
  const [invoiceStatus, setInvoiceStatus] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch(`/api/grc/${id}`)
      .then((response) => response.json())
      .then((result) => {
        if (result.error) throw new Error(result.error);
        const next = { ...result.grc };
        fields.forEach((field) => {
          const value = result.grc[field.k];
          next[field.k] = value == null ? '' : field.type === 'ref' ? String(value) : value;
        });
        setData(next);
        if (next.supplierId && result.grc.supplierName) {
          setSupplierOption({ value: next.supplierId, label: result.grc.supplierName });
        }
        setRows(result.rows || []);
        setInvoiceId(result.grc.purchaseInvoiceId || null);
      })
      .catch((error) => setStatus(error.message || 'Failed to load GRC'));
  }, [id]);

  const summaryRows = useMemo(() => rows.map((row) => {
    const qty = number(row.qty);
    const beforeGst = number(row.finalNet || row.purRate) * qty;
    const gstAmount = beforeGst * (number(row.gst) / 100);
    return {
      ...row,
      qty,
      beforeGst,
      gstAmount,
      netAmount: beforeGst + gstAmount,
    };
  }), [rows]);

  const summary = useMemo(() => summaryRows.reduce((result, row) => {
    result.quantity += row.qty;
    result.taxable += row.beforeGst;
    result.gst += row.gstAmount;
    result.net += row.netAmount;
    return result;
  }, { quantity: 0, taxable: 0, gst: 0, net: 0 }), [summaryRows]);

  async function submit() {
    setSaving(true);
    setStatus('');
    try {
      const response = await fetch(`/api/grc/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data, business: scope.business, location: scope.location, finYear: scope.finYear }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Update failed');
      router.push('/admin/transaction/purchase/grc');
    } catch (error) {
      setStatus(error.message || 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  const openBarcode = () => router.push(`/admin/transaction/purchase/grc/${id}/barcode-generation`);
  const set = (key, value) => setData((current) => ({ ...current, [key]: value }));
  const cell = (value) => value || '-';
  const totalTaxable = Number(data.taxable) || summary.taxable;
  /* GST falls back to the header the same way Taxable Value above it does.
     It used to read summary.gst alone, which is derived from the barcode
     rows - and the historical import carried header totals for every GRC but
     barcode rows for only a few. On an imported GRC with no rows the tax line
     therefore showed 0.00 while Taxable Value showed the real figure, and Net
     Purchases Value came out short by exactly the GST (GRC 05061: 20052.33
     instead of the 21055 the document records). Reading both halves from the
     same place is what keeps the block adding up. Nothing is invented - the
     header value is what the source document was imported with, and `gst` is
     not a form field, so Update never writes over it. */
  const totalGst = Number(data.gst) || summary.gst;
  const freightBeforeGst = Number(data.freightAmount) || 0;
  const discountAmount = (totalTaxable * (Number(data.discountPercent) || 0)) / 100;
  const roundOffDiscount = Number(data.roundOffDiscount) || 0;
  const roundOff = Number(data.roundOff) || 0;
  const netPurchasesValue = totalTaxable - discountAmount - roundOffDiscount
    + totalGst + freightBeforeGst + roundOff;

  async function generatePurchaseInvoice() {
    setInvoiceStatus('Generating...');
    try {
      const response = await fetch(`/api/purchase-grc/${id}`, { method: 'POST' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) { setInvoiceStatus(result.error || 'Could not generate invoice'); return; }
      setInvoiceId(result.id);
      setData((current) => ({ ...current, purchaseInvoiceId: result.id }));
      setInvoiceStatus(result.existing ? 'Purchase Invoice already generated' : 'Purchase Invoice generated');
    } catch {
      setInvoiceStatus('Could not generate invoice');
    }
  }

  if (!data.grcNumber && !status) return <div className="p-6 text-sm text-slate-500">Loading...</div>;

  return (
    <div className="mx-auto max-w-full p-4 text-slate-800">
      <div className="card">
        <div className="card-head flex items-center justify-between gap-3">
          <span className="card-title">Edit Goods Receipt Challan</span>
          <button type="button" onClick={openBarcode} className="btn btn-primary">Barcode Generation</button>
        </div>
        <div className="card-body">
          {status && <div className="mb-3 text-sm text-slate-600">{status}</div>}
          <div className="form-grid-4">
            {fields.map((field) => (
              <Field
                key={field.k}
                f={field}
                value={data[field.k]}
                onChange={set}
                selectedOption={field.k === 'supplierId' ? supplierOption : undefined}
              />
            ))}
          </div>
          <button type="button" className="btn btn-primary mx-auto mt-4 flex w-full max-w-[390px] justify-center" onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : 'Update'}
          </button>
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-head flex gap-2">
          {['items', 'summary'].map((key) => (
            <button key={key} type="button" onClick={() => setTab(key)} className={`btn ${tab === key ? 'btn-primary' : ''}`}>
              {key === 'items' ? 'Item With Barcode' : 'Item Summary'}
            </button>
          ))}
        </div>
        <div className="card-body overflow-x-auto">
          {tab === 'items' ? (
            <table className="dt min-w-[1500px]"><thead><tr>{['Item Code', 'Batch/Unique', 'Bill Sl No', 'Supplier Description', 'Qty', 'UOM', 'HSN', 'Pur Rate', 'Final Net', 'GST %', 'Retail Price', 'Offer Price', 'Barcode Generated', ''].map((heading) => <th key={heading}>{heading}</th>)}</tr></thead><tbody>
              {/* "No barcode items yet" is right for a GRC being built, but
                  misleading for an IMPORTED one - it reads as "none exist",
                  when the truth is the historical export carried no item
                  detail for this GRC. The header knows how much was received,
                  so say that rather than leaving the operator to wonder
                  whether the import dropped something. Nothing is fabricated;
                  the row count is still zero. */}
              {rows.length === 0 && (
                <tr><td colSpan={14} className="dt-empty">
                  {data.importedFrom
                    ? `No item detail was included for this GRC in the historical import${
                      data.totalQuantity ? ` - its header records a total quantity of ${data.totalQuantity}` : ''
                    }. Re-import once the source export includes this GRC's items.`
                    : 'No barcode items yet.'}
                </td></tr>
              )}
              {rows.map((row) => <tr key={row._id}><td>{cell(row.itemCode)}</td><td>{cell(row.batchUnique)}</td><td>{cell(row.billSlNo)}</td><td>{cell(row.supplierDescription)}</td><td>{cell(row.qty)}</td><td>{cell(row.uom)}</td><td>{cell(row.hsn)}</td><td>{cell(row.purRate)}</td><td>{cell(row.finalNet)}</td><td>{cell(row.gst)}</td><td>{cell(row.retailPrice)}</td><td>{cell(row.offerPrice)}</td><td>{cell(row.barcodeGenerated)}</td><td><button type="button" className="text-brand-link underline" onClick={openBarcode}>Edit</button></td></tr>)}
            </tbody></table>
          ) : (
            <table className="dt min-w-[900px]">
              <thead>
                <tr>
                  {['Sl No', 'Bill Sl No.', 'Item Name', 'QTY', 'Before GST Amount', 'GST Amount', 'Net Amount'].map((heading) => <th key={heading}>{heading}</th>)}
                </tr>
              </thead>
              <tbody>
                {summaryRows.length === 0 && (
                  <tr><td colSpan={7} className="dt-empty">
                    {data.importedFrom
                      ? 'The summary is derived from the barcode items, and none were included for this GRC in the historical import.'
                      : 'No summary items yet.'}
                  </td></tr>
                )}
                {summaryRows.map((row, index) => (
                  <tr key={row._id || `${row.billSlNo}-${index}`}>
                    <td>{index + 1}</td>
                    <td>{cell(row.billSlNo)}</td>
                    <td>{cell(row.itemName || row.supplierDescription || row.itemCode)}</td>
                    <td>{row.qty.toFixed(2)}</td>
                    <td>{row.beforeGst.toFixed(2)}</td>
                    <td>{row.gstAmount.toFixed(2)}</td>
                    <td>{row.netAmount.toFixed(2)}</td>
                  </tr>
                ))}
                {summaryRows.length > 0 && (
                  <tr className="font-semibold">
                    <td colSpan={3}>Total</td>
                    <td>{summary.quantity.toFixed(2)}</td>
                    <td>{summary.taxable.toFixed(2)}</td>
                    <td>{summary.gst.toFixed(2)}</td>
                    <td>{summary.net.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card mt-4">
        <div className="card-body p-0">
          <table className="w-full border-collapse text-[13.5px]">
            <tbody>
              <tr className="border-b border-line bg-[#f4f5f6]">
                <td className="w-[22%] border-r border-line py-2 pr-3 text-right text-brand-link">Taxable Value</td>
                <td className="w-[22%] border-r border-line" />
                <td className="w-[20%] border-r border-line" />
                <td className="w-[18%] border-r border-line text-center text-brand-link">+</td>
                <td className="py-2 pr-3 text-right text-brand-link">{totalTaxable.toFixed(2)}</td>
              </tr>
              <tr className="border-b border-line">
                <td className="border-r border-line py-2 pr-3 text-right text-brand-link">Discount(%)</td>
                <td className="border-r border-line" />
                <td className="border-r border-line px-3 py-1"><input className="f-input h-8" type="number" value={data.discountPercent || ''} onChange={(e) => set('discountPercent', e.target.value)} onWheel={(e) => e.currentTarget.blur()} /></td>
                <td className="border-r border-line text-center text-brand-link">-</td>
                <td className="py-2 pr-3 text-right text-brand-link">{discountAmount.toFixed(2)}</td>
              </tr>
              <tr className="border-b border-line bg-[#f4f5f6]">
                <td className="border-r border-line py-2 pr-3 text-right text-brand-link">Round Off Discount(Amt)</td>
                <td className="border-r border-line" />
                <td className="border-r border-line px-3 py-1"><input className="f-input h-8" type="number" value={data.roundOffDiscount || ''} onChange={(e) => set('roundOffDiscount', e.target.value)} onWheel={(e) => e.currentTarget.blur()} /></td>
                <td className="border-r border-line text-center text-brand-link">-</td>
                <td className="py-2 pr-3 text-right text-brand-link">{roundOffDiscount.toFixed(2)}</td>
              </tr>
              <tr className="border-b border-line">
                <td colSpan={2} className="border-r border-line py-2 pr-3 text-right text-brand-link">CGST + SGST (2.50 + 2.50) %</td>
                <td className="border-r border-line text-center text-brand-link">+</td>
                <td className="border-r border-line" />
                <td className="py-2 pr-3 text-right text-brand-link">{totalGst.toFixed(2)}</td>
              </tr>
              <tr className="border-b border-line bg-[#f4f5f6]">
                <td className="border-r border-line py-2 pr-3 text-right text-brand-link">Freight charges BEFORE GST (Amt)</td>
                <td className="border-r border-line" />
                <td className="border-r border-line px-3 py-1"><input className="f-input h-8 text-center" type="number" value={data.freightAmount || 0} onChange={(e) => set('freightAmount', e.target.value)} onWheel={(e) => e.currentTarget.blur()} /></td>
                <td className="border-r border-line text-center text-brand-link">+</td>
                <td className="py-2 pr-3 text-right text-brand-link">{freightBeforeGst.toFixed(2)}</td>
              </tr>
              <tr className="border-b border-line">
                <td colSpan={4} className="border-r border-line py-2 pr-3 text-right text-brand-link">Round Off</td>
                <td className="py-2 pr-3 text-right text-brand-link">{roundOff.toFixed(2)}</td>
              </tr>
              <tr className="bg-[#f4f5f6]">
                <td colSpan={4} className="border-r border-line py-2 pr-3 text-right font-semibold text-brand-link">Net Purchases Value</td>
                <td className="py-2 pr-3 text-right font-semibold text-brand-link">{netPurchasesValue.toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          {invoiceStatus && <div className="px-4 pt-3 text-sm text-cell">{invoiceStatus}</div>}
          <div className="flex flex-wrap justify-end gap-2 px-4 py-3">
            <button type="button" className="btn bg-[#198754] text-white" onClick={generatePurchaseInvoice} disabled={Boolean(invoiceId)}>Generate Purchase Invoice</button>
            {invoiceId && <button type="button" className="btn" onClick={() => setShowInvoice(true)}>View Purchase Invoice</button>}
            {invoiceId && <button type="button" className="btn" onClick={() => { setShowInvoice(true); setTimeout(() => window.print(), 250); }}>Download Purchase Invoice</button>}
            <button type="button" className="btn bg-[#10bddd] text-white" onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Submit GRC'}</button>
          </div>
        </div>
      </div>
      {showInvoice && invoiceId && <PurchaseInvoicePrintView id={invoiceId} onClose={() => setShowInvoice(false)} />}
    </div>
  );
}