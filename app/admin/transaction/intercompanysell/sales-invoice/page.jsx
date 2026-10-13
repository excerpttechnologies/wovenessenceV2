'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';

/* Inter Company Sell > Sales Invoice - CONSIGNMENT BILLING, from the
   SENDER's side.

   The sender ships on an IC Delivery Challan, the receiver approves the
   goods in and sells them at its POS. This screen is where the sender then
   invoices - for exactly the units the receiver has sold.

   ONE PAGE, TWO SECTIONS (user, 30-09-2026 - no tabs): the work to do sits
   on top, the record of it below, the same shape as Receive Delivery
   Challan.

     Not Billed   every unit from this branch's challans that the receiver
                  has SOLD and nobody has invoiced yet. Tick the units,
                  press Save Billed - one invoice per receiver.
     Billed       the lines of the invoices already raised.

   The data comes from /api/ic-item-invoice, which reads the receiver-side
   barcode rows (they carry the challan they came on) and stamps the billed
   ones - so a unit can never be invoiced twice, and a unit the receiver
   has not sold never appears here at all.

   NOT the older hidden salesinvoice screen: that one bills whole challans
   whether sold or not. This bills sold items only. */

const money = (v) => String(Math.trunc(Number(v || 0)));
/* the popup's figures keep the paise - an invoice is an exact document */
const money2 = (v) => Number(v || 0).toFixed(2);
const qtyText = (v) => String(Math.round((Number(v) || 0) * 100) / 100);
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-');
const day = (v) => (v ? new Date(v).toLocaleDateString('en-GB') : '-');

export default function IcItemSalesInvoicePage() {
  const scope = useScope();
  const [pending, setPending] = useState([]);     // sold, not invoiced
  const [billed, setBilled] = useState([]);       // invoice lines
  const [loading, setLoading] = useState(false);
  const [flash, setFlash] = useState(null);
  const [picked, setPicked] = useState([]);
  /* the billed invoice open in the View popup */
  const [viewInv, setViewInv] = useState(null);
  const [saving, setSaving] = useState(false);
  /* the billed invoice open in the Generate E-Invoice popup, and what the
     popup is doing: { inv, busy, error, problems, result } */
  const [einv, setEinv] = useState(null);

  const printEinvoice = (invoiceId) =>
    window.open('/admin/transaction/intercompanysell/sales-invoice/print/' + invoiceId + '?einv=1', '_blank');

  /* E-Invoice button: no IRN yet -> the Generate popup; IRN already
     generated -> straight to the e-invoice print */
  const openEinvoice = (inv) => {
    if (inv.einvoice?.status === 'GENERATED') { printEinvoice(inv.invoiceId); return; }
    setEinv({ inv, busy: false, error: '', problems: [], result: null });
  };

  async function generateEinvoice() {
    if (!einv || einv.busy) return;
    setEinv((s) => ({ ...s, busy: true, error: '', problems: [] }));
    try {
      const r = await fetch('/api/ic-item-invoice/' + einv.inv.invoiceId + '/einvoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate' }),
      });
      const d = await r.json();
      if (!r.ok) {
        setEinv((s) => ({ ...s, busy: false, error: d.error || 'Could not generate the e-invoice.', problems: d.problems || [] }));
        return;
      }
      setEinv((s) => ({ ...s, busy: false, result: { ...d.einvoice, mode: d.mode } }));
      load();
    } catch {
      setEinv((s) => ({ ...s, busy: false, error: 'Could not reach the server.' }));
    }
  }

  const load = useCallback(async () => {
    if (!scope.business) { setPending([]); setBilled([]); return; }
    setLoading(true);
    setPicked([]);
    const ask = (view) => {
      const qs = new URLSearchParams({
        business: scope.business,
        finYear: scope.finYear || '',
        view,
      });
      return fetch('/api/ic-item-invoice?' + qs, { cache: 'no-store' }).then((r) => r.json());
    };
    try {
      /* both halves of the story in one go - the endpoint answers one view
         per request, so it is asked twice */
      const [nb, b] = await Promise.all([ask('notbilled'), ask('billed')]);
      if (nb.error || b.error) {
        setFlash({ type: 'err', msg: nb.error || b.error });
        setPending([]);
        setBilled([]);
        return;
      }
      setPending(Array.isArray(nb.rows) ? nb.rows : []);
      setBilled(Array.isArray(b.rows) ? b.rows : []);
    } catch {
      setPending([]);
      setBilled([]);
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setLoading(false);
    }
  }, [scope.business, scope.finYear]);

  useEffect(() => { load(); }, [load]);

  /* a confirmation should not sit on screen forever; errors stay */
  useEffect(() => {
    if (!flash || flash.type !== 'ok') return undefined;
    const t = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(t);
  }, [flash]);

  /* RECEIVER FILTER above Not Billed (user, 13-10-2026): company, then a
     location of that company. EVERY company this branch can bill is offered
     (the same list the Delivery Challan's destination uses), with or
     without items waiting - one with nothing simply shows an empty list.
     Changing either clears the ticks, so nothing hidden can be billed by
     accident. */
  const [fCompany, setFCompany] = useState('');
  const [fLocation, setFLocation] = useState('');
  const [companyOptions, setCompanyOptions] = useState([]);
  const [locationOptions, setLocationOptions] = useState([]);
  useEffect(() => {
    setFCompany('');
    setFLocation('');
    if (!scope.business) { setCompanyOptions([]); return undefined; }
    let off = false;
    fetch('/api/ic-destinations?business=' + scope.business, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!off) setCompanyOptions((d.options || []).map((o) => [String(o.value), o.label])); })
      .catch(() => { if (!off) setCompanyOptions([]); });
    return () => { off = true; };
  }, [scope.business]);
  useEffect(() => {
    if (!fCompany) { setLocationOptions([]); return undefined; }
    let off = false;
    fetch('/api/options?ref=companylocations&business=' + fCompany, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (off) return;
        const opts = (d.options || []).map((o) => [String(o.value), o.label]);
        setLocationOptions(opts);
        /* picking a company selects its location straight away (user,
           13-10-2026) - the first one when it has several; "All locations"
           is still in the list */
        if (opts.length) setFLocation(opts[0][0]);
      })
      .catch(() => { if (!off) setLocationOptions([]); });
    return () => { off = true; };
  }, [fCompany]);
  const visible = useMemo(() => pending.filter((r) =>
    (!fCompany || r.toBusinessId === fCompany) && (!fLocation || r.toLocationId === fLocation)),
  [pending, fCompany, fLocation]);
  const pickCompany = (v) => { setFCompany(v); setFLocation(''); setPicked([]); };
  const pickLocation = (v) => { setFLocation(v); setPicked([]); };

  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const allTicked = visible.length > 0 && visible.every((r) => picked.includes(r.key));
  const toggleAll = () => setPicked(allTicked ? [] : visible.map((r) => r.key));

  const pickedRows = useMemo(() => visible.filter((r) => picked.includes(r.key)), [visible, picked]);
  const pickedValue = pickedRows.reduce((a, r) => a + Number(r.netAmount || 0), 0);
  /* one invoice per receiver - say up front how many will be raised */
  const pickedReceivers = new Set(pickedRows.map((r) => r.toBusinessId || r.toBusinessName)).size;

  /* THE INVOICE(S) SAVE WILL RAISE, previewed under the ticked items (user,
     13-10-2026 - as on the client's other system). Grouped by receiver and
     totalled exactly as POST /api/ic-item-invoice does - paise-rounded sums,
     Net Value rounded to the rupee, Round Off the difference - so the
     preview and the saved invoice carry the same figures. */
  const previewGroups = useMemo(() => {
    const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
    const groups = new Map();
    pickedRows.forEach((r) => {
      const k = r.toBusinessId || r.toBusinessName || '';
      if (!groups.has(k)) groups.set(k, { key: k, name: r.toBusinessName || '-', rows: [] });
      groups.get(k).rows.push(r);
    });
    return [...groups.values()].map((g) => {
      const sum = (f) => r2(g.rows.reduce((a, l) => a + Number(l[f] || 0), 0));
      const taxable = sum('beforeTax');
      const igst = sum('igstAmount');
      const cgst = sum('cgstAmount');
      const sgst = sum('sgstAmount');
      const gross = r2(taxable + igst + cgst + sgst);
      const netValue = Math.round(gross);
      /* "(2.5 + 2.5)%" when every line shares one slab, like the demo */
      const slabs = [...new Set(g.rows.map((l) => Number(l.cgstPct || 0) + '+' + Number(l.sgstPct || 0)))];
      const igstSlabs = [...new Set(g.rows.map((l) => Number(l.igstPct || 0)))];
      return {
        ...g,
        taxable,
        igst,
        cgst,
        sgst,
        roundOff: r2(netValue - gross),
        netValue,
        slab: slabs.length === 1 ? ' (' + slabs[0].replace('+', ' + ') + ')%' : '',
        igstSlab: igstSlabs.length === 1 ? ' (' + igstSlabs[0] + ')%' : '',
      };
    });
  }, [pickedRows]);
  const previewRows = previewGroups.flatMap((g) => g.rows);

  async function saveBilled() {
    if (!picked.length || saving) return;
    setSaving(true);
    setFlash(null);
    try {
      const r = await fetch('/api/ic-item-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
          data: { barcodeIds: picked },
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        setFlash({ type: 'err', msg: d.error || 'Could not save.' });
        load();
        return;
      }
      setFlash({
        type: 'ok',
        msg: (d.invoices || []).map((inv) =>
          'Invoice ' + inv.invoiceNo + ' raised on ' + inv.toBusinessName
          + ' for ' + inv.count + ' item(s), ' + money(inv.netValue) + '.').join(' '),
      });
      load();
    } catch {
      setFlash({ type: 'err', msg: 'Could not reach the server.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center border-b border-line pb-2">
        <span className="card-title">Inter Company Sales Invoices</span>
        <span className="flex-1" />
        <button type="button" className="btn" onClick={load}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      {flash && (
        <div className={'mb-3 flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>
      )}

      {/* ------------------------------------------- receiver filter -- */}
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[240px] flex-col gap-1">
          <span className="field-label">Company</span>
          <select className="f-input" value={fCompany} onChange={(e) => pickCompany(e.target.value)}>
            <option value="">All companies</option>
            {companyOptions.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        <label className="flex min-w-[240px] flex-col gap-1">
          <span className="field-label">Location</span>
          <select className="f-input" value={fLocation} disabled={!fCompany} onChange={(e) => pickLocation(e.target.value)}>
            <option value="">{fCompany ? 'All locations' : 'Pick a company first'}</option>
            {locationOptions.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
          </select>
        </label>
        {(fCompany || fLocation) && (
          <button type="button" className="btn" onClick={() => pickCompany('')}>
            <Icon name="refresh" size={14} /> Reset
          </button>
        )}
      </div>

      {/* -------------------------------------------------- NOT BILLED -- */}
      <div className="mb-2 flex items-center border-b border-line pb-2">
        <span className="card-title">Not Billed</span>
        {visible.length > 0 && (
          <span className="ml-2 rounded bg-[#fff3cd] px-2 py-0.5 text-[11.5px] font-semibold text-warnyellow">
            {visible.length} sold item(s) waiting to be billed
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="dt">
          <thead>
            <tr>
              <th style={{ width: 40 }}>
                <input
                  type="checkbox"
                  aria-label="Select every item"
                  checked={allTicked}
                  disabled={!visible.length}
                  onChange={toggleAll}
                />
              </th>
              <th style={{ width: 170 }}>Receiver</th>
              <th style={{ width: 150 }}>DC No</th>
              <th style={{ width: 110 }}>Barcode</th>
              <th>Item</th>
              <th className="!text-right" style={{ width: 60 }}>Qty</th>
              <th className="!text-right" style={{ width: 80 }}>Rate</th>
              <th className="!text-right" style={{ width: 90 }}>Amount</th>
              <th style={{ width: 170 }}>Sold On</th>
              <th style={{ width: 110 }}>POS Invoice</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} className="dt-empty">Loading...</td></tr>}
            {!loading && !scope.business && (
              <tr><td colSpan={10} className="dt-empty">Select a Business in the top bar.</td></tr>
            )}
            {!loading && scope.business && !pending.length && (
              <tr><td colSpan={10} className="dt-empty">Nothing sold by your receivers is waiting to be billed.</td></tr>
            )}
            {!loading && pending.length > 0 && !visible.length && (
              <tr><td colSpan={10} className="dt-empty">Nothing waiting to be billed for this company / location.</td></tr>
            )}
            {!loading && visible.map((r) => (
              <tr
                key={r.key}
                className={picked.includes(r.key) ? 'bg-[#f0f7ff]' : 'cursor-pointer'}
                onClick={() => toggle(r.key)}
              >
                <td onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={'Bill ' + (r.barcodeNo || r.itemName)}
                    checked={picked.includes(r.key)}
                    onChange={() => toggle(r.key)}
                  />
                </td>
                <td className="font-semibold">{r.toBusinessName || '-'}</td>
                <td>{r.dcNo || '-'}</td>
                <td className="font-mono text-[12px]">{r.barcodeNo || '-'}</td>
                <td>{r.itemName || r.itemCode || '-'}</td>
                <td className="!text-right">{qtyText(r.qty)}</td>
                <td className="!text-right">{money(r.unitRate)}</td>
                <td className="!text-right">{money(r.netAmount)}</td>
                <td className="whitespace-nowrap">{when(r.soldAt)}</td>
                <td>{r.posInvoiceNo || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------ SELECTED ITEMS -- the
          invoice lines and totals the ticked units will be billed at */}
      {previewRows.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 flex items-center border-b border-line pb-2">
            <span className="card-title">Selected Items</span>
          </div>
          <div className="overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  <th style={{ width: 44 }}>Sl No</th>
                  <th>DC Code</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th style={{ width: 90 }}>HSN Code</th>
                  <th style={{ width: 80 }}>GST Slab</th>
                  <th style={{ width: 60 }}>UOM</th>
                  <th className="!text-right" style={{ width: 60 }}>Qty</th>
                  <th className="!text-right" style={{ width: 85 }}>Unit Rate</th>
                  <th className="!text-right" style={{ width: 75 }}>Discount %</th>
                  <th className="!text-right" style={{ width: 80 }}>R.Off Discount</th>
                  <th className="!text-right" style={{ width: 85 }}>Final Rate</th>
                  <th className="!text-right" style={{ width: 95 }}>Before Tax</th>
                  <th className="!text-right" style={{ width: 85 }}>IGST Amount</th>
                  <th className="!text-right" style={{ width: 85 }}>CGST Amount</th>
                  <th className="!text-right" style={{ width: 85 }}>SGST Amount</th>
                  <th className="!text-right" style={{ width: 95 }}>Net Amount</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((l, n) => (
                  <tr key={l.key}>
                    <td className="text-center">{n + 1}</td>
                    <td>{l.dcNo || '-'}</td>
                    <td>{l.itemCode || l.barcodeNo || '-'}</td>
                    <td>{l.itemName || '-'}</td>
                    <td>{l.hsn || '-'}</td>
                    <td>GST {Number(l.igstPct || 0) || (Number(l.cgstPct || 0) + Number(l.sgstPct || 0))}%</td>
                    <td>{l.uom || '-'}</td>
                    <td className="!text-right">{qtyText(l.qty)}</td>
                    <td className="!text-right">{money2(l.unitRate)}</td>
                    <td className="!text-right">{money2(l.discountPct)}</td>
                    <td className="!text-right">{money2(l.roffDiscount)}</td>
                    <td className="!text-right">{money2(l.finalRate)}</td>
                    <td className="!text-right">{money2(l.beforeTax)}</td>
                    <td className="!text-right">{money2(l.igstAmount)}</td>
                    <td className="!text-right">{money2(l.cgstAmount)}</td>
                    <td className="!text-right">{money2(l.sgstAmount)}</td>
                    <td className="!text-right font-semibold">{money2(l.netAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* one totals block per invoice Save will raise */}
          <div className="mt-3 flex flex-wrap justify-end gap-4">
            {previewGroups.map((g) => (
              <div key={g.key} className="min-w-[320px] rounded border border-line p-3 text-[13px]">
                {previewGroups.length > 1 && <div className="mb-1 font-semibold">{g.name}</div>}
                <div className="flex justify-between gap-6"><span>Taxable Value</span><span>{money2(g.taxable)}</span></div>
                {(g.cgst > 0 || g.sgst > 0) && (
                  <div className="flex justify-between gap-6"><span>CGST + SGST{g.slab}</span><span>{money2(g.cgst + g.sgst)}</span></div>
                )}
                {g.igst > 0 && (
                  <div className="flex justify-between gap-6"><span>IGST{g.igstSlab}</span><span>{money2(g.igst)}</span></div>
                )}
                <div className="flex justify-between gap-6"><span>Round Off</span><span>{money2(g.roundOff)}</span></div>
                <div className="mt-1 flex justify-between gap-6 border-t border-line pt-1 text-[14px] font-bold">
                  <span>Net Value</span><span>{money2(g.netValue)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5 mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!picked.length || saving}
          onClick={saveBilled}
        >
          {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Save 
        </button>
        <span className="text-[13px] text-inkmuted">
          {picked.length
            ? picked.length + ' item(s) ticked, ' + money(pickedValue)
              + (pickedReceivers > 1 ? ' - ' + pickedReceivers + ' invoices will be raised, one per receiver.' : '.')
            : 'Tick the sold items to bill.'}
        </span>
      </div>

      {/* ------------------------------------------------------ BILLED -- */}
      <div className="mb-2 flex items-center border-b border-line pb-2">
        <span className="card-title">Billed</span>
      </div>

      <div className="overflow-x-auto">
        <table className="dt">
          <thead>
            <tr>
              <th style={{ width: 130 }}>Invoice No</th>
              <th style={{ width: 95 }}>Date</th>
              <th style={{ width: 200 }}>Receiver</th>
              <th>DC No(s)</th>
              <th className="!text-right" style={{ width: 60 }}>Items</th>
              <th className="!text-right" style={{ width: 60 }}>Qty</th>
              <th className="!text-right" style={{ width: 90 }}>Amount</th>
              <th style={{ width: 70 }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8} className="dt-empty">Loading...</td></tr>}
            {!loading && !billed.length && (
              <tr><td colSpan={8} className="dt-empty">Nothing billed yet.</td></tr>
            )}
            {!loading && billed.map((inv) => (
              <tr key={inv.invoiceId}>
                <td className="font-semibold">{inv.invoiceNo || '-'}</td>
                <td>{day(inv.invoiceDate)}</td>
                <td>{inv.toBusinessName || '-'}</td>
                <td className="text-[12px]">{(inv.dcNos || []).join(', ') || '-'}</td>
                <td className="!text-right">{inv.itemCount}</td>
                <td className="!text-right">{qtyText(inv.totalQty)}</td>
                <td className="!text-right">{money(inv.netValue)}</td>
                <td>
                  <span className="inline-flex items-center gap-1.5">
                    <button type="button" className="act-btn act-blue" title="View" onClick={() => setViewInv(inv)}>
                      <Icon name="eye" size={12} />
                    </button>
                    {/* the Tax Invoice, in its own tab, ready to print */}
                    <button type="button" className="act-btn act-slate" title="Print" onClick={() => window.open('/admin/transaction/intercompanysell/sales-invoice/print/' + inv.invoiceId, '_blank')}>
                      <Icon name="printer" size={12} />
                    </button>
                    {/* E-Invoice: YELLOW until an IRN is generated (click
                        opens Generate E-Invoice), GREEN once it has one
                        (click prints it) */}
                    {inv.einvoice?.status === 'GENERATED' ? (
                      <button type="button" className="act-btn act-green" title={'Print E-Invoice (IRN ' + inv.einvoice.irn + ')'} onClick={() => openEinvoice(inv)}>
                        <Icon name="file" size={12} />
                      </button>
                    ) : (
                      <button type="button" className="act-btn border-[#eab308] bg-[#fde047] text-[#713f12]" title="E-Invoice not generated - click to generate" onClick={() => openEinvoice(inv)}>
                        <Icon name="file" size={12} />
                      </button>
                    )}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --------------------------------- Generate E-Invoice popup -- */}
      {einv && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={() => { if (!einv.busy) setEinv(null); }}
        >
          <div
            className="my-16 w-full max-w-lg rounded-lg bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-line px-5 py-3">
              <span className="card-title">{einv.result ? 'E-Invoice Generated' : 'Generate E-Invoice'}</span>
            </div>

            <div className="space-y-2 p-5 text-[13px]">
              <div className="grid grid-cols-[110px_1fr] gap-y-1">
                <span className="text-inkmuted">Invoice No</span><b>{einv.inv.invoiceNo || '-'}</b>
                <span className="text-inkmuted">Date</span><span>{day(einv.inv.invoiceDate)}</span>
                <span className="text-inkmuted">Receiver</span><span>{einv.inv.toBusinessName || '-'}</span>
                <span className="text-inkmuted">Net Value</span><span>{money2(einv.inv.netValue)}</span>
              </div>

              {einv.result && (
                <div className="rounded border border-[#c3e9d4] bg-[#e9f7ef] p-3">
                  <div className="font-semibold text-okgreen">E-Invoice generated successfully.</div>
                  <div className="mt-1 break-all"><b>IRN:</b> {einv.result.irn}</div>
                  <div><b>Ack No:</b> {einv.result.ackNo}</div>
                  <div><b>Ack Date:</b> {when(einv.result.ackDate)}</div>
                  {einv.result.mode === 'mock' && (
                    <div className="mt-1 text-[12px] font-semibold text-warnyellow">TEST (mock) IRN - not registered with GST.</div>
                  )}
                </div>
              )}

              {!einv.result && !einv.error && (
                <div>Generate the e-invoice (IRN) for this invoice?</div>
              )}

              {einv.error && (
                <div className="flash flash-err">
                  {einv.error}
                  {einv.problems.length > 0 && (
                    <ul className="ml-5 list-disc">{einv.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  )}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              {einv.result ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => { printEinvoice(einv.inv.invoiceId); setEinv(null); }}>
                    <Icon name="printer" size={14} /> Print E-Invoice
                  </button>
                  <button type="button" className="btn" onClick={() => setEinv(null)}>Close</button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn-primary" disabled={einv.busy} onClick={generateEinvoice}>
                    {einv.busy ? <span className="spin" /> : <Icon name="file" size={14} />} Generate
                  </button>
                  <button type="button" className="btn" disabled={einv.busy} onClick={() => setEinv(null)}>Cancel</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------- View Sales Invoice popup -- */}
      {viewInv && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onMouseDown={() => setViewInv(null)}
        >
          <div
            className="my-6 w-full max-w-6xl rounded-lg bg-white shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-3">
              <span className="card-title">View Sales Invoice</span>
              <span className="flex-1" />
              <button
                type="button"
                aria-label="Close"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-danger text-white"
                onClick={() => setViewInv(null)}
              >
                <Icon name="x" size={14} />
              </button>
            </div>

            <div className="p-5">
              <div className="mb-3 grid gap-x-8 gap-y-1 text-[13px] md:grid-cols-2">
                <div><b>Receiver</b> : {viewInv.toBusinessName || '-'}</div>
                <div><b>SI Date</b> : {day(viewInv.invoiceDate)}</div>
                <div><b>SI No</b> : {viewInv.invoiceNo || '-'}</div>
                <div><b>Financial Year</b> : {viewInv.finYear || '-'}</div>
                <div className="md:col-span-2"><b>Dc Codes</b> : {(viewInv.dcNos || []).join(', ') || '-'}</div>
              </div>

              <div className="overflow-x-auto">
                <table className="dt">
                  <thead>
                    <tr>
                      <th style={{ width: 44 }}>Sl No</th>
                      <th>Dc Code</th>
                      <th>Item Code</th>
                      <th>Item Name</th>
                      <th style={{ width: 90 }}>HSN</th>
                      <th style={{ width: 80 }}>GST Slab</th>
                      <th style={{ width: 60 }}>UOM</th>
                      <th className="!text-right" style={{ width: 70 }}>Quantity</th>
                      <th className="!text-right" style={{ width: 90 }}>Unit Rate</th>
                      <th className="!text-right" style={{ width: 95 }}>Before GST</th>
                      <th className="!text-right" style={{ width: 90 }}>IGST Amount</th>
                      <th className="!text-right" style={{ width: 90 }}>CGST Amount</th>
                      <th className="!text-right" style={{ width: 90 }}>SGST Amount</th>
                      <th className="!text-right" style={{ width: 95 }}>Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(viewInv.items || []).map((l, n) => (
                      <tr key={n}>
                        <td className="text-center">{n + 1}</td>
                        <td>{l.dcNo || '-'}</td>
                        <td>{l.itemCode || l.barcodeNo || '-'}</td>
                        <td>{l.itemName || '-'}</td>
                        <td>{l.hsn || '-'}</td>
                        <td>GST {Number(l.igstPct || 0) || (Number(l.cgstPct || 0) + Number(l.sgstPct || 0))}%</td>
                        <td>{l.uom || '-'}</td>
                        <td className="!text-right">{qtyText(l.qty)}</td>
                        <td className="!text-right">{money2(l.unitRate)}</td>
                        <td className="!text-right">{money2(l.beforeTax)}</td>
                        <td className="!text-right">{money2(l.igstAmount)}</td>
                        <td className="!text-right">{money2(l.cgstAmount)}</td>
                        <td className="!text-right">{money2(l.sgstAmount)}</td>
                        <td className="!text-right font-semibold">{money2(l.netAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td colSpan={7}>Totals</td>
                      <td className="!text-right">{qtyText(viewInv.totalQty)}</td>
                      <td />
                      <td className="!text-right">{money2(viewInv.taxableValue)}</td>
                      <td className="!text-right">{money2(viewInv.igstTotal)}</td>
                      <td className="!text-right">{money2(viewInv.cgstTotal)}</td>
                      <td className="!text-right">{money2(viewInv.sgstTotal)}</td>
                      <td className="!text-right">{money2(viewInv.taxableValue + viewInv.igstTotal + viewInv.cgstTotal + viewInv.sgstTotal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="mt-2 flex justify-end gap-8 text-[13px]">
                <span><b>Round Off</b> : {money2(viewInv.roundOff)}</span>
                <span className="text-[14px]"><b>Net Value</b> : <b>{money2(viewInv.netValue)}</b></span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
