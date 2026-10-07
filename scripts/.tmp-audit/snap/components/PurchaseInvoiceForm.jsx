'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Field from './Field';
import MultiSelect from './MultiSelect';
import { useScope } from './ScopeContext';
import { useOptions } from './useOptions';

/* ==========================================================================
   Add / Edit Purchase Invoice.

   Line maths, taken from a posted invoice on the live system (26/00338):

     Discount    = Purchase Rate x Discount%      370.00 x 7%   = 25.90
     Final Rate  = Purchase Rate - Discount       370.00-25.90  = 344.10
     Before Tax  = Final Rate x QTY               344.10 x 10   = 3441.00
     IGST        = Before Tax x GST slab %        3441.00 x 5%  = 172.05
     Net Amount  = Before Tax + IGST + CGST + SGST              = 3613.05

   Totals block:
     Taxable Value      = sum of Before Tax
     IGST (n)%          = sum of IGST
     Round Off          = whole rupee correction on the final figure
     Net Purchases Value= Taxable + GST + freight - discounts + round off

   CGST/SGST stay zero for inter-state supply; the slab carries all three, so
   an intra-state HSN splits automatically without changing this file.
   ========================================================================== */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (v) => Math.round(num(v) * 100) / 100;
const money = (v) => r2(v).toFixed(2);

const BLANK = {
  itemId: '', itemCode: '', itemName: '', hsn: '', slabName: '',
  igstPct: 0, cgstPct: 0, sgstPct: 0,
  uom: '', qty: '', cuts: '', purchaseRate: '', discountPct: '', roffDiscount: '',
  rsp: '', wsp: '', dp: '', attribute: '',
};

/* one line's derived figures */
function compute(r) {
  const rate = num(r.purchaseRate);
  const qty = num(r.qty);
  const discount = r2(rate * (num(r.discountPct) / 100));
  const finalRate = r2(rate - discount - num(r.roffDiscount));
  const beforeTax = r2(finalRate * qty);
  const igst = r2(beforeTax * (num(r.igstPct) / 100));
  const cgst = r2(beforeTax * (num(r.cgstPct) / 100));
  const sgst = r2(beforeTax * (num(r.sgstPct) / 100));
  return { discount, finalRate, beforeTax, igst, cgst, sgst, netAmount: r2(beforeTax + igst + cgst + sgst) };
}

export default function PurchaseInvoiceForm({ cfg, id }) {
  const router = useRouter();
  const scope = useScope();
  const isEdit = Boolean(id);

  const headerFields = (cfg.form.cards || []).find((c) => c.type === 'fields')?.fields || [];
  const sourceCard = (cfg.form.cards || []).find((c) => c.type === 'source');
  const gridCols = (cfg.form.cards || []).find((c) => c.type === 'grid')?.cols || [];

  const [data, setData] = useState(() => {
    const d = {};
    headerFields.forEach((f) => { d[f.k] = f.def !== undefined ? f.def : ''; });
    return d;
  });
  const [rows, setRows] = useState([]);
  const [sourceIds, setSourceIds] = useState([]);
  const [grcOptions, setGrcOptions] = useState([]);
  const [freight, setFreight] = useState('');
  const [headDiscountPct, setHeadDiscountPct] = useState('');
  const [headRoffDiscount, setHeadRoffDiscount] = useState('');
  const [errors, setErrors] = useState({});
  const [flash, setFlash] = useState(null);
  const [saving, setSaving] = useState(false);

  const items = useOptions('item');

  /* ------------------------------------------------------- load on edit -- */
  useEffect(() => {
    if (!id) return;
    fetch(cfg.endpoint + '/' + id)
      .then((r) => r.json())
      .then((d) => {
        if (!d.doc) return;
        setData((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            const v = d.doc[k];
            if (v !== null && v !== undefined) next[k] = typeof v === 'object' ? String(v) : v;
          });
          return next;
        });
        setRows(d.doc.items || []);
        setFreight(d.doc.freightBeforeGst ?? '');
        setHeadDiscountPct(d.doc.discountPercent ?? '');
        setHeadRoffDiscount(d.doc.roundOffDiscount ?? '');
      });
  }, [id, cfg.endpoint]);

  /* ------------------------------------- unconverted GRCs for the supplier */
  useEffect(() => {
    if (!sourceCard || !data.supplierId) { setGrcOptions([]); return; }

    const qs = new URLSearchParams({
      perPage: '200', unconverted: sourceCard.unconvertedBy || '',
      supplierId: data.supplierId,
      business: scope.business || '', location: scope.location || '', finYear: scope.finYear || '',
    });

    fetch(sourceCard.endpoint + '?' + qs)
      .then((r) => r.json())
      .then((d) => setGrcOptions((d.rows || []).map((x) => ({
        value: String(x._id), label: x.grcNumber || '(no number)', row: x,
      }))))
      .catch(() => setGrcOptions([]));
  }, [sourceCard, data.supplierId, scope.business, scope.location, scope.finYear]);

  /* picking GRCs copies their header details onto the invoice */
  useEffect(() => {
    if (!sourceIds.length) return;
    const first = grcOptions.find((o) => o.value === sourceIds[0]);
    if (!first) return;

    const g = first.row;
    setData((d) => ({
      ...d,
      grcNumber: g.grcNumber || '',
      vendorDocNo: g.vendorDocNo || '',
      grcDate: g.grcDate ? String(g.grcDate).slice(0, 10) : '',
      vendorDocDate: g.vendorDocDate ? String(g.vendorDocDate).slice(0, 10) : '',
      purchaseGroupId: g.purchaseGroupId ? String(g.purchaseGroupId) : '',
      purchaseTermId: g.purchaseTermId ? String(g.purchaseTermId) : '',
      agentId: g.agentId ? String(g.agentId) : '',
      logisticId: g.logisticId ? String(g.logisticId) : '',
      vendorGstNo: g.vendorGstNo || d.vendorGstNo,
    }));
  }, [sourceIds, grcOptions]);

  /* ------------------------------------------------------------- rows ---- */
  const addRow = () => setRows((r) => [...r, { ...BLANK }]);
  const dropRow = (i) => setRows((r) => r.filter((_, x) => x !== i));
  const setCell = (i, k, v) => setRows((r) => r.map((x, xi) => (xi === i ? { ...x, [k]: v } : x)));

  /* picking an item fills code, name, HSN, slab, UOM, RSP and WSP */
  const pickItem = useCallback(async (i, itemId) => {
    setCell(i, 'itemId', itemId);
    if (!itemId) return;

    try {
      const r = await fetch('/api/item/' + itemId + '/detail');
      const { item } = await r.json();
      if (!item) return;

      /* first slab whose amount band is open or matches; HSNs here carry one */
      const slab = item.slabs[0] || null;

      setRows((prev) => prev.map((x, xi) => (xi !== i ? x : {
        ...x,
        itemId,
        itemCode: item.itemCode,
        itemName: item.name,
        hsn: item.hsnCode,
        uom: item.uom,
        rsp: item.rsp ?? '',
        wsp: item.wsp ?? '',
        slabName: slab ? slab.name : '',
        igstPct: slab ? slab.igst : 0,
        cgstPct: slab ? slab.cgst : 0,
        sgstPct: slab ? slab.sgst : 0,
      })));
    } catch { /* leave the row as typed */ }
  }, []);

  /* ------------------------------------------------------------ totals --- */
  const totals = useMemo(() => {
    const calc = rows.map(compute);
    const taxable = r2(calc.reduce((a, c) => a + c.beforeTax, 0));
    const igst = r2(calc.reduce((a, c) => a + c.igst, 0));
    const cgst = r2(calc.reduce((a, c) => a + c.cgst, 0));
    const sgst = r2(calc.reduce((a, c) => a + c.sgst, 0));
    const qty = r2(rows.reduce((a, r) => a + num(r.qty), 0));

    const headDisc = r2(taxable * (num(headDiscountPct) / 100));
    const gross = r2(taxable - headDisc - num(headRoffDiscount) + igst + cgst + sgst + num(freight));

    /* whole-rupee correction, as "Round Off -0.21" on the live invoice */
    const net = Math.round(gross);
    const roundOff = r2(net - gross);

    /* the slab % to print beside "IGST (n) %" */
    const pct = rows.find((r) => num(r.igstPct))?.igstPct || 0;

    return { calc, taxable, igst, cgst, sgst, qty, headDisc, roundOff, net: r2(net), pct };
  }, [rows, headDiscountPct, headRoffDiscount, freight]);

  /* ------------------------------------------------------------- save ---- */
  async function submit() {
    setSaving(true);
    setFlash(null);
    try {
      const lines = rows.map((r) => {
        const c = compute(r);
        return {
          itemId: r.itemId, itemCode: r.itemCode, itemName: r.itemName,
          hsn: r.hsn, slabName: r.slabName, uom: r.uom,
          qty: num(r.qty), cuts: num(r.cuts),
          purchaseRate: num(r.purchaseRate), discountPct: num(r.discountPct),
          discount: c.discount, roffDiscount: num(r.roffDiscount),
          finalRate: c.finalRate, beforeTax: c.beforeTax,
          igstAmount: c.igst, cgstAmount: c.cgst, sgstAmount: c.sgst,
          netAmount: c.netAmount,
          rsp: num(r.rsp), wsp: num(r.wsp), dp: num(r.dp), attribute: r.attribute || '',
        };
      });

      const payload = {
        data: {
          ...data,
          sourceIds,
          items: lines,
          taxableValue: totals.taxable,
          discountPercent: num(headDiscountPct),
          roundOffDiscount: num(headRoffDiscount),
          igstTotal: totals.igst, cgstTotal: totals.cgst, sgstTotal: totals.sgst,
          freightBeforeGst: num(freight),
          roundOff: totals.roundOff,
          netPurchaseAmt: totals.net,
          totalPayable: totals.net,
          totalQuantity: totals.qty,
        },
        business: scope.business, location: scope.location, finYear: scope.finYear,
      };

      const r = await fetch(cfg.endpoint + (id ? '/' + id : ''), {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const d = await r.json();

      if (r.status === 422) {
        setErrors(d.errors || {});
        setFlash({ type: 'err', msg: 'Please correct the highlighted fields.' });
        return;
      }
      if (!r.ok) { setFlash({ type: 'err', msg: d.error || 'Save failed' }); return; }

      router.push(cfg.basePath + cfg.slugPath);
    } finally {
      setSaving(false);
    }
  }

  const set = (k, v) => { setData((d) => ({ ...d, [k]: v })); setErrors((e) => ({ ...e, [k]: undefined })); };

  const NUMERIC = { qty: 'QTY/MTR', cuts: 'No. of Cuts', purchaseRate: 'Purchase Rate', discountPct: 'Discount' };

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{cfg.addTitle}</span>
      </div>

      <div className="card-body">
        {flash && <div className={'flash ' + (flash.type === 'err' ? 'flash-err' : 'flash-ok')}>{flash.msg}</div>}

        <div className="form-grid-4">
          {headerFields.map((f) => (
            <Field key={f.k} f={f} value={data[f.k]} error={errors[f.k]} onChange={set} />
          ))}
        </div>

        {/* GRC List */}
        {sourceCard && (
          <div className="form-section">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="f-label">{sourceCard.label}<span className="f-req">*</span></label>
                <MultiSelect
                  options={grcOptions.map(({ value, label }) => ({ value, label }))}
                  value={sourceIds}
                  placeholder="Select..."
                  onChange={setSourceIds}
                />
              </div>
              <div className="info-box">
                <div className="flex items-center gap-1.5 font-bold"><Icon name="eye" size={14} /> Info</div>
                <ol className="list-decimal pl-5">
                  {(sourceCard.info || ['Displays GRCs linked to the selected supplier that have not yet been converted into purchase invoices.']).map((t, i) => <li key={i}>{t}</li>)}
                </ol>
              </div>
            </div>
          </div>
        )}

        {/* line items */}
        <div className="mt-4 overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>{gridCols.map((c) => <th key={c}>{c}</th>)}<th style={{ width: 46 }} /></tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={gridCols.length + 1} className="dt-empty">No Item Found</td></tr>
              )}
              {rows.map((r, i) => {
                const c = totals.calc[i];
                return (
                  <tr key={i}>
                    <td className="text-center">{i + 1}</td>
                    <td style={{ minWidth: 170 }}>
                      <MultiSelect
                        mode="single"
                        options={items.options}
                        loading={items.loading}
                        value={r.itemId}
                        placeholder="Select item"
                        onChange={(v) => pickItem(i, v)}
                      />
                      {r.itemCode && <div className="pt-1 text-[11.5px] text-inkmuted">{r.itemCode}</div>}
                    </td>
                    <td>{r.itemName}</td>
                    <td>{r.hsn}</td>
                    <td>{r.slabName}</td>
                    <td>{r.uom}</td>
                    {Object.entries(NUMERIC).map(([k]) => (
                      <td key={k}>
                        <input
                          type="number" className="f-input h-8 w-[86px]"
                          value={r[k] ?? ''}
                          onWheel={(e) => e.currentTarget.blur()}
                          onChange={(e) => setCell(i, k, e.target.value)}
                        />
                      </td>
                    ))}
                    <td>
                      <input
                        type="number" className="f-input h-8 w-[86px]"
                        value={r.roffDiscount ?? ''}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => setCell(i, 'roffDiscount', e.target.value)}
                      />
                    </td>
                    <td className="text-right">{money(c.finalRate)}</td>
                    <td className="text-right">{money(c.beforeTax)}</td>
                    <td className="text-right">{money(c.igst)}</td>
                    <td className="text-right">{money(c.cgst)}</td>
                    <td className="text-right">{money(c.sgst)}</td>
                    <td className="text-right font-bold">{money(c.netAmount)}</td>
                    <td className="text-right">{r.rsp === '' ? '' : money(r.rsp)}</td>
                    <td className="text-right">{r.wsp === '' ? '' : money(r.wsp)}</td>
                    <td>
                      <input
                        type="number" className="f-input h-8 w-[76px]"
                        value={r.dp ?? ''}
                        onWheel={(e) => e.currentTarget.blur()}
                        onChange={(e) => setCell(i, 'dp', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="f-input h-8 w-[110px]"
                        value={r.attribute ?? ''}
                        onChange={(e) => setCell(i, 'attribute', e.target.value)}
                      />
                    </td>
                    <td>
                      <button type="button" className="act-btn bg-danger" onClick={() => dropRow(i)}>
                        <Icon name="trash" size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button type="button" className="btn mt-3" onClick={addRow}>
          <Icon name="plus" size={13} /> Add Row
        </button>

        {/* totals */}
        <div className="mt-5 flex justify-end">
          <table className="tot-tbl">
            <tbody>
              <tr>
                <td>Taxable Value</td><td className="text-center">+</td>
                <td className="text-right">{money(totals.taxable)}</td>
              </tr>
              <tr>
                <td>Discount(%)</td><td className="text-center">&minus;</td>
                <td className="text-right">
                  <input
                    type="number" className="f-input h-8 w-[110px] text-right"
                    value={headDiscountPct}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setHeadDiscountPct(e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <td>RoundOff Discount(Amt)</td><td className="text-center">&minus;</td>
                <td className="text-right">
                  <input
                    type="number" className="f-input h-8 w-[110px] text-right"
                    value={headRoffDiscount}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setHeadRoffDiscount(e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <td>IGST ({money(totals.pct)}) %</td><td className="text-center">+</td>
                <td className="text-right">{money(totals.igst)}</td>
              </tr>
              {(totals.cgst > 0 || totals.sgst > 0) && (
                <>
                  <tr><td>CGST</td><td className="text-center">+</td><td className="text-right">{money(totals.cgst)}</td></tr>
                  <tr><td>SGST</td><td className="text-center">+</td><td className="text-right">{money(totals.sgst)}</td></tr>
                </>
              )}
              <tr>
                <td>Freight charges BEFORE GST (Amt)</td><td className="text-center">+</td>
                <td className="text-right">
                  <input
                    type="number" className="f-input h-8 w-[110px] text-right"
                    value={freight}
                    onWheel={(e) => e.currentTarget.blur()}
                    onChange={(e) => setFreight(e.target.value)}
                  />
                </td>
              </tr>
              <tr>
                <td>Round Off</td><td />
                <td className="text-right">{money(totals.roundOff)}</td>
              </tr>
              <tr className="font-bold">
                <td>Net Purchases Value</td><td />
                <td className="text-right">{money(totals.net)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <button type="button" className="btn btn-primary btn-submit" onClick={submit} disabled={saving}>
          {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Submit
        </button>
      </div>
    </div>
  );
}
