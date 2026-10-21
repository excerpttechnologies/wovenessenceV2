'use client';
import { useMemo, useState } from 'react';
import Icon from './Icon';
import BarcodeSvg from './BarcodeSvg';
import { groupLines, summarise, qtyText, money } from '@/lib/challan';

/* ==========================================================================
   The printed Delivery Challan - one component, two formats.

   FORMAT A (Detailed)     everything: barcodes, supplier, rate, RSP, values.
                           The office copy and the receiving branch's copy.

   FORMAT B (Non-detailed) the same goods with every commercial figure
                           removed - no rate, no RSP, no supplier, no totals
                           in money. The driver's copy, which travels with the
                           goods and should not tell a third party what the
                           consignment cost.

   The two are ONE template with a `detailed` flag, not two files. The
   quantities, the grouping and the summary come from lib/challan.js and are
   computed once. That is what stops the two copies of a challan disagreeing
   about how much is in the consignment - the failure that actually matters,
   because the driver's copy is the one that gets checked at the door.

   Used by the stock-transfer challan and the sell delivery challan. A caller
   supplies a header and lines; nothing about either document type is known
   here.
   ========================================================================== */

const dateText = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-');

export default function ChallanDocument({
  title = 'Delivery Challan',
  docNo,
  docDate,
  from,
  to,
  meta = [],
  lines = [],
  remarks = '',
  /* extra summary cells a document type wants beside Qty / PC / MTR -
     the transfer challan uses them for Returned and Billable */
  extraSummary = [],
  signatures = ['Prepared By', 'Driver / Transporter', 'Received By'],
  /* optional filter shown next to the format toggle */
  scopeOptions = null,
  scopeValue = '',
  onScopeChange = null,
}) {
  const [detailed, setDetailed] = useState(true);

  const rows = useMemo(() => groupLines(lines), [lines]);
  const totals = useMemo(() => summarise(lines), [lines]);

  return (
    <>
      {/* controls are screen-only; the print stylesheet drops them */}
      <div className="card no-print mb-3">
        <div className="card-body flex flex-wrap items-center gap-3">
          <span className="text-[13px] font-semibold">Format:</span>
          <div className="flex overflow-hidden rounded-md border border-line">
            <button
              type="button"
              className={'px-3 py-1.5 text-[13px] ' + (detailed ? 'bg-brand text-white' : 'bg-white text-ink')}
              onClick={() => setDetailed(true)}
            >
              A · Detailed
            </button>
            <button
              type="button"
              className={'px-3 py-1.5 text-[13px] ' + (!detailed ? 'bg-brand text-white' : 'bg-white text-ink')}
              onClick={() => setDetailed(false)}
            >
              B · Non-detailed
            </button>
          </div>

          {scopeOptions && (
            <>
              <span className="ml-3 text-[13px] font-semibold">Show:</span>
              <select
                className="f-input max-w-[240px]"
                value={scopeValue}
                onChange={(e) => onScopeChange?.(e.target.value)}
              >
                {scopeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </>
          )}

          <span className="flex-1" />
          <span className="text-[12px] text-inkmuted">
            {detailed
              ? 'Includes barcodes, supplier, rate and RSP.'
              : 'Rate, RSP, supplier and values are hidden on this copy.'}
          </span>
          <button type="button" className="btn btn-primary" onClick={() => window.print()}>
            <Icon name="printer" size={14} /> Print
          </button>
        </div>
      </div>

      <div className="challan-sheet mx-auto max-w-[900px] bg-white p-6 text-[12px] text-ink shadow-sm print:shadow-none">
        {/* -------------------------------------------------- letterhead -- */}
        <div className="flex items-start justify-between border-b-2 border-ink pb-3">
          <div>
            <div className="text-[18px] font-bold">{title}</div>
            <div className="text-[11px] text-inkmuted">
              {detailed ? 'Detailed copy' : 'Non-detailed copy - not for commercial use'}
            </div>
          </div>
          {docNo && (
            <div className="text-right">
              {/* The document number as a scannable barcode. Scanning it opens
                  the transaction - the value encoded is the real document
                  number, nothing else. */}
              <BarcodeSvg value={docNo} height={40} displayValue className="block h-[52px] w-[190px]" />
              <div className="text-[11px] text-inkmuted">{title} No</div>
            </div>
          )}
        </div>

        {/* --------------------------------------------------- addresses -- */}
        <div className="grid grid-cols-2 gap-4 border-b border-line py-3">
          <Party label={from?.label || 'Despatched From'} party={from} />
          <Party label={to?.label || 'Delivered To'} party={to} />
        </div>

        <div className="grid grid-cols-4 gap-3 border-b border-line py-2 text-[11px]">
          <Meta label={title + ' No'} value={docNo || '-'} />
          <Meta label="Date" value={dateText(docDate)} />
          {meta.map((m) => <Meta key={m.label} label={m.label} value={m.value || '-'} />)}
        </div>

        {/* ------------------------------------------------------ lines -- */}
        <table className="mt-3 w-full border-collapse">
          <thead>
            <tr className="bg-[#f2f5f9] text-left">
              <Th w={34}>#</Th>
              <Th>Item</Th>
              {detailed && <Th>Supplier</Th>}
              <Th w={70}>HSN</Th>
              <Th w={60}>UOM</Th>
              <Th w={56} right>Pkts</Th>
              <Th w={70} right>Qty</Th>
              {detailed && <Th w={80} right>Rate</Th>}
              {detailed && <Th w={80} right>RSP</Th>}
              {detailed && <Th w={90} right>Value</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><Td colSpan={detailed ? 10 : 6}>Nothing to show.</Td></tr>
            )}
            {rows.map((r, i) => (
              <tr key={i} className="align-top">
                <Td>{i + 1}</Td>
                <Td>
                  <div className="font-semibold">{r.itemName || r.itemCode || r.description}</div>
                  {r.itemCode && <div className="text-[10px] text-inkmuted">Code: {r.itemCode}</div>}
                  {/* Barcodes only on the detailed copy - they are the
                      traceable reference, and the driver has no use for them. */}
                  {detailed && r.barcodes.length > 0 && (
                    <div className="mt-0.5 font-mono text-[10px] leading-tight text-inkmuted">
                      {r.barcodes.slice(0, 12).join(', ')}
                      {r.barcodes.length > 12 ? ' +' + (r.barcodes.length - 12) + ' more' : ''}
                    </div>
                  )}
                </Td>
                {detailed && <Td>{r.supplierName || '-'}</Td>}
                <Td>{r.hsn || '-'}</Td>
                <Td>{r.uom || r.uomType}</Td>
                <Td right>{r.count}</Td>
                <Td right>{qtyText(r.qty)}</Td>
                {detailed && <Td right>{money(r.rate)}</Td>}
                {detailed && <Td right>{money(r.rsp)}</Td>}
                {detailed && <Td right>{money(r.rate * r.qty)}</Td>}
              </tr>
            ))}
          </tbody>
        </table>

        {/* ---------------------------------------- the quantity summary -- */}
        <div className="mt-4 flex flex-wrap items-start justify-between gap-4 border-t-2 border-ink pt-3">
          <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-[12px]">
            <SumCell label="Total Quantity" value={qtyText(totals.totalQty)} strong />
            <SumCell label="Total PC" value={qtyText(totals.totalPc)} />
            <SumCell label="Total MTR" value={qtyText(totals.totalMtr)} />
            <SumCell label="Total Packets" value={totals.lineCount} />
            {extraSummary.map((s) => (
              <SumCell key={s.label} label={s.label} value={s.value} strong={s.strong} />
            ))}
          </div>

          {detailed && (
            <div className="min-w-[220px] text-[12px]">
              <SumRow label="Taxable Value" value={money(totals.taxable)} />
              <SumRow label="GST" value={money(totals.gst)} />
              <SumRow label="RSP Value" value={money(totals.rspValue)} />
              <div className="mt-1 border-t border-ink pt-1">
                <SumRow label="Net Value" value={money(totals.net)} strong />
              </div>
            </div>
          )}
        </div>

        {remarks && <div className="mt-3 text-[11px]"><b>Remarks:</b> {remarks}</div>}

        <div className="mt-10 grid grid-cols-3 gap-6 text-[11px]">
          {signatures.map((s) => (
            <Sign key={typeof s === 'string' ? s : s.label} label={typeof s === 'string' ? s : s.label} value={s.value} />
          ))}
        </div>
      </div>

      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff; }
          .challan-sheet { box-shadow: none; max-width: none; padding: 0; }
          @page { margin: 12mm; }
        }
      `}</style>
    </>
  );
}

/* ---------------------------------------------------------------- bits --- */

function Party({ label, party }) {
  if (!party) return <div />;
  return (
    <div>
      <div className="mb-1 text-[11px] font-bold uppercase text-inkmuted">{label}</div>
      <div className="font-semibold">{party.name || '-'}</div>
      {party.address && <div className="text-[11px]">{party.address}</div>}
      {party.gstn && <div className="text-[11px]">GSTIN: {party.gstn}</div>}
      {party.mobile && <div className="text-[11px]">Mobile: {party.mobile}</div>}
    </div>
  );
}

const Th = ({ children, w, right }) => (
  <th
    className={'border border-[#c9d2dd] px-1.5 py-1 text-[11px] font-bold ' + (right ? 'text-right' : '')}
    style={w ? { width: w } : undefined}
  >
    {children}
  </th>
);

const Td = ({ children, right, colSpan }) => (
  <td className={'border border-[#c9d2dd] px-1.5 py-1 ' + (right ? 'text-right' : '')} colSpan={colSpan}>
    {children}
  </td>
);

const Meta = ({ label, value }) => (
  <div><span className="text-inkmuted">{label}: </span><span className="font-semibold">{value}</span></div>
);

const SumCell = ({ label, value, strong }) => (
  <div>
    <div className="text-[10px] uppercase text-inkmuted">{label}</div>
    <div className={strong ? 'text-[15px] font-bold' : 'text-[13px] font-semibold'}>{value}</div>
  </div>
);

const SumRow = ({ label, value, strong }) => (
  <div className={'flex justify-between ' + (strong ? 'font-bold' : '')}>
    <span className="text-inkmuted">{label}</span><span>{value}</span>
  </div>
);

const Sign = ({ label, value }) => (
  <div>
    <div className="h-10 border-b border-ink" />
    <div className="pt-1 text-inkmuted">{label}</div>
    {value ? <div className="font-semibold">{value}</div> : null}
  </div>
);
