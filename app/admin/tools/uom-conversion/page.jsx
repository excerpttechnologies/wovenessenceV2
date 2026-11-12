'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';

/* Tools > UOM Conversion.

   The approved piece <-> metre factors. Barcode Split and Barcode Merge stop
   rather than guess when a conversion is missing, so this is where a factor
   has to be added before a PCS/MTR line can be saved.

   An item-specific row wins over a business-wide one. The factor is
   directional: "1 MTR = 4 PCS" is stored as from MTR / to PCS / 4, and the
   reverse direction is derived automatically. */

const inputCls =
  'w-full rounded-md border border-line bg-white px-2.5 py-2 text-[13px] text-ink outline-none focus:border-brand';
const labelCls = 'block text-[11px] font-semibold uppercase tracking-wide text-inkmuted';

export default function UomConversionPage() {
  const { business } = useScope();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ itemCode: '', fromUom: 'MTR', toUom: 'PCS', factor: '', notes: '' });
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ perPage: '200' });
      if (business) qs.set('business', business);
      const res = await fetch('/api/uom-conversion?' + qs, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load conversions.');
      setRows(data.rows || []);
      setTotal(data.total || 0);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => { load(); }, [load]);

  async function add(event) {
    event.preventDefault();
    setError('');
    if (!(Number(form.factor) > 0)) {
      setError('The factor must be greater than 0.');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/uom-conversion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, business }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The conversion could not be saved.');
      setForm({ itemCode: '', fromUom: 'MTR', toUom: 'PCS', factor: '', notes: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(row) {
    if (!window.confirm('Deactivate this conversion? Existing splits keep the factor they stored; new splits will need another approved factor.')) return;
    const res = await fetch('/api/uom-conversion/' + row._id, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data.error || 'Could not deactivate.');
      return;
    }
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[18px] font-bold tracking-tight">UOM Conversion</h1>
          <p className="text-[12.5px] text-inkmuted">
            Approved PCS / MTR factors used by Barcode Split and Barcode Merge. No universal factor is assumed.
          </p>
        </div>
        <div className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}><Icon name="refresh" size={14} /> Refresh</button>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Add Conversion</span></div>
        <div className="card-body">
          <form onSubmit={add} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div>
              <label className={labelCls}>Item Code (optional)</label>
              <input className={inputCls} value={form.itemCode} onChange={(e) => setForm((f) => ({ ...f, itemCode: e.target.value }))} placeholder="All items if blank" />
            </div>
            <div>
              <label className={labelCls}>From UOM</label>
              <select className={inputCls} value={form.fromUom} onChange={(e) => setForm((f) => ({ ...f, fromUom: e.target.value }))}>
                <option value="MTR">MTR</option>
                <option value="PCS">PCS</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>To UOM</label>
              <select className={inputCls} value={form.toUom} onChange={(e) => setForm((f) => ({ ...f, toUom: e.target.value }))}>
                <option value="PCS">PCS</option>
                <option value="MTR">MTR</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Factor</label>
              <input className={inputCls} type="number" min="0" step="0.0001" value={form.factor} onChange={(e) => setForm((f) => ({ ...f, factor: e.target.value }))} placeholder="1 MTR = ? PCS" />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <input className={inputCls} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-end">
              <button type="submit" className="btn btn-primary w-full" disabled={saving}><Icon name="plus" size={14} /> {saving ? 'Saving...' : 'Add'}</button>
            </div>
          </form>
          <p className="mt-2 text-[12px] text-inkmuted">
            Example: 1 MTR = 4 PCS is stored as From MTR, To PCS, Factor 4. The reverse conversion (PCS to MTR) is derived as 1/4 automatically.
          </p>
          {error && <div className="mt-3 rounded-md border border-[#f3b4b0] bg-[#fdeeed] px-3 py-2 text-[13px] text-danger">{error}</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head"><span className="card-title">Configured Conversions</span><span className="card-sub">{total} row(s)</span></div>
        <div className="card-body overflow-x-auto">
          <table className="dt min-w-[900px]">
            <thead>
              <tr><th>Name</th><th>Item Code</th><th>From</th><th>To</th><th>Factor</th><th>Reverse</th><th>Status</th><th>Notes</th><th>Action</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={9} className="dt-empty"><span className="spin" /></td></tr>}
              {!loading && !rows.length && (
                <tr><td colSpan={9} className="dt-empty">No conversions configured yet. A PCS/MTR split will be refused until one exists.</td></tr>
              )}
              {!loading && rows.map((row) => (
                <tr key={row._id}>
                  <td>{row.name}</td>
                  <td>{row.itemCode || <span className="text-inkmuted">All items</span>}</td>
                  <td>{row.fromUom}</td>
                  <td>{row.toUom}</td>
                  <td className="font-semibold">{row.factor}</td>
                  <td>{row.factor > 0 ? Math.round((1 / row.factor) * 10000) / 10000 : '—'}</td>
                  <td><span className={'pill ' + (row.status === 'Inactive' ? 'pill-red' : 'pill-green')}>{row.status}</span></td>
                  <td>{row.notes || '—'}</td>
                  <td>
                    {row.status !== 'Inactive' && (
                      <button type="button" className="act-btn bg-danger" title="Deactivate" onClick={() => deactivate(row)}><Icon name="trash" size={12} /></button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
