'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import ProductImage from './ProductImage';

/* ==========================================================================
   The customer profile the till shows once a customer is chosen.

   The panel that was here listed the fields on the customer record and
   nothing else - useful for confirming a phone number, no use at all for the
   question an operator actually asks at the counter, which is "what has this
   person bought before".

   Three tabs, all from one request to /api/customer/<id>/history:
     Details      the master record, as before
     Purchases    previous bills, expandable to their lines
     Returns      what has come back, so a serial returner is visible

   Collapsed by default. It sits above the item table, and a panel that opens
   itself to full height every time a customer is selected pushes the scan row
   off the screen - which is the row the operator needs.
   ========================================================================== */

const money = (v) => Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateText = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '-');

const DETAIL_FIELDS = [
  ['contactId', 'Customer No'], ['businessName', 'Business Name'], ['gstNo', 'GST No'],
  ['mobile', 'Mobile'], ['email', 'Email'], ['address', 'Address'],
  ['city', 'City'], ['state', 'State'], ['priceList', 'Price List'],
  ['creditLimit', 'Credit Limit'], ['remarks', 'Remarks'],
];

export default function CustomerProfilePanel({ customerId, business, fallbackCustomer }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState('purchases');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (!customerId || customerId === 'walkin') { setData(null); setOpen(false); return undefined; }
    let off = false;
    setLoading(true);
    const qs = new URLSearchParams({ business: business || '', limit: '20' });
    fetch('/api/customer/' + customerId + '/history?' + qs, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!off) setData(d); })
      .catch(() => {})
      .finally(() => { if (!off) setLoading(false); });
    return () => { off = true; };
  }, [customerId, business]);

  /* A walk-in has no profile; render nothing rather than an empty card. */
  if (!customerId || customerId === 'walkin') return null;

  const c = data?.customer || fallbackCustomer || {};
  const s = data?.summary || {};
  const name = c.businessName || c.name || 'Customer';

  return (
    <div className="mx-4 mb-2 rounded border border-line bg-[#f7f9fc]">
      {/* -------------------------------------------------- header bar -- */}
      <button
        type="button"
        className="flex w-full items-center gap-3 px-3 py-2 text-left"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <Icon name={open ? 'chevD' : 'chevR'} size={14} />
        <span className="text-[13px] font-bold">{name}</span>
        {c.contactId && <span className="text-[11px] text-inkmuted">[{c.contactId}]</span>}
        {c.mobile && <span className="text-[12px] text-inkmuted">{c.mobile}</span>}

        <span className="flex-1" />

        {loading && <span className="text-[11px] text-inkmuted">Loading history...</span>}

        {!loading && data && (
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <Stat label="Bills" value={s.invoiceCount} />
            <Stat label="Spent" value={money(s.totalSpent)} />
            {s.totalDue > 0 && <Stat label="Due" value={money(s.totalDue)} tone="text-danger" />}
            {s.returnCount > 0 && <Stat label="Returns" value={s.returnCount} tone="text-danger" />}
            <Stat label="Last" value={dateText(s.lastPurchase)} />
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-line px-3 py-2">
          <div className="mb-2 flex gap-1">
            {[['purchases', 'Purchases'], ['returns', 'Returns'], ['details', 'Details']].map(([k, label]) => (
              <button
                key={k}
                type="button"
                className={'rounded px-2.5 py-1 text-[12px] ' + (tab === k ? 'bg-brand text-white' : 'bg-white text-ink border border-line')}
                onClick={() => setTab(k)}
              >
                {label}
                {k === 'purchases' && data ? ' (' + (data.invoices || []).length + ')' : ''}
                {k === 'returns' && data ? ' (' + (data.returns || []).length + ')' : ''}
              </button>
            ))}
          </div>

          {/* ------------------------------------------- purchases ----- */}
          {tab === 'purchases' && (
            <>
              {(data?.topItems || []).length > 0 && (
                <div className="mb-2">
                  <div className="mb-1 text-[11px] font-semibold uppercase text-inkmuted">Buys most often</div>
                  <div className="flex flex-wrap gap-2">
                    {data.topItems.map((t) => (
                      <span key={t.itemCode} className="flex items-center gap-2 rounded border border-line bg-white px-2 py-1 text-[11px]">
                        <ProductImage src={t.image} alt={t.itemName} size={28} />
                        <span>
                          <b className="block max-w-[160px] truncate">{t.itemName}</b>
                          <span className="text-inkmuted">{t.qty} pcs · {money(t.value)}</span>
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="max-h-64 overflow-auto">
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Invoice</th><th>Date</th><th>Items</th>
                      <th className="text-right">Total</th><th className="text-right">Paid</th>
                      <th className="text-right">Due</th><th>Status</th><th />
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.invoices || []).length === 0 && (
                      <tr><td colSpan={8} className="dt-empty">No previous purchases.</td></tr>
                    )}
                    {(data?.invoices || []).map((inv) => (
                      <Fragmentish key={inv._id}>
                        <tr className="cursor-pointer" onClick={() => setExpanded(expanded === inv._id ? null : inv._id)}>
                          <td className="font-semibold">{inv.invoiceNo}</td>
                          <td>{dateText(inv.date)}</td>
                          <td>{inv.itemCount}</td>
                          <td className="text-right">{money(inv.totalAmount)}</td>
                          <td className="text-right">{money(inv.paid)}</td>
                          <td className={'text-right ' + (inv.sellDue > 0 ? 'text-danger font-semibold' : '')}>{money(inv.sellDue)}</td>
                          <td>{inv.paymentStatus}</td>
                          <td><Icon name={expanded === inv._id ? 'chevD' : 'chevR'} size={12} /></td>
                        </tr>
                        {expanded === inv._id && (
                          <tr>
                            <td colSpan={8} className="bg-white">
                              <div className="flex flex-wrap gap-2 p-2">
                                {inv.items.map((l, i) => (
                                  <span key={l.barcodeNo || i} className="flex items-center gap-2 rounded border border-line px-2 py-1 text-[11px]">
                                    <ProductImage src={l.image} alt={l.itemName} size={30} />
                                    <span>
                                      <b className="block max-w-[180px] truncate">{l.itemName || l.itemCode}</b>
                                      <span className="text-inkmuted">
                                        {l.barcodeNo ? l.barcodeNo + ' · ' : ''}{l.qty} × {money(l.rate)}
                                      </span>
                                    </span>
                                  </span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragmentish>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* --------------------------------------------- returns ----- */}
          {tab === 'returns' && (
            <div className="max-h-64 overflow-auto">
              <table className="dt">
                <thead>
                  <tr><th>Credit Note</th><th>Against</th><th>Date</th><th>Items</th><th className="text-right">Refunded</th><th>Reason</th></tr>
                </thead>
                <tbody>
                  {(data?.returns || []).length === 0 && (
                    <tr><td colSpan={6} className="dt-empty">Nothing returned.</td></tr>
                  )}
                  {(data?.returns || []).map((r) => (
                    <tr key={r._id}>
                      <td className="font-semibold">{r.invoiceNo}</td>
                      <td>{r.parentInvoice}</td>
                      <td>{dateText(r.date)}</td>
                      <td>{r.itemCount}</td>
                      <td className="text-right">{money(r.refundAmount)}</td>
                      <td>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* --------------------------------------------- details ----- */}
          {tab === 'details' && (
            <div className="grid grid-cols-1 gap-x-4 gap-y-1 text-[12px] sm:grid-cols-2 lg:grid-cols-4">
              {DETAIL_FIELDS
                .filter(([k]) => c[k] !== undefined && c[k] !== null && String(c[k]).trim() !== '')
                .map(([k, label]) => (
                  <div key={k} className="min-w-0">
                    <span className="text-inkmuted">{label}: </span>
                    <span className="break-words font-medium text-ink">{String(c[k])}</span>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone = '' }) {
  return (
    <span className={tone}>
      <span className="text-inkmuted">{label}: </span>
      <b>{value ?? '-'}</b>
    </span>
  );
}

/* A <tbody> may only contain <tr>; React.Fragment is the way to return two of
   them from one map iteration without an illegal wrapper element. */
function Fragmentish({ children }) {
  return <>{children}</>;
}
