'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';

/* E-commerce -> Product Type (29-10-2026). Uses the same API as the Product
   Type dropdown on product-eccom/add (/api/v1/admin/product-types), so a type
   added here shows in that dropdown straight away. The built-in types
   (Sarees, Fabrics, Plain Fabrics, Dupatta, Other) carry the website's
   categories and cannot be deleted; an added type can, while no e-commerce
   product uses it. */

const BUILT_IN = ['SAREES', 'FABRICS', 'PLAIN FABRICS', 'DUPATTA', 'OTHER'];

export default function ProductTypePage() {
  const { business } = useScope();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState('');

  const load = useCallback(async () => {
    if (!business) { setRows([]); return; }
    setLoading(true);
    setError('');
    try {
      const r = await fetch('/api/v1/admin/product-types?business=' + encodeURIComponent(business), { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load the list.');
      setRows((d.types || []).filter((type) => type.value));
    } catch (e) {
      setRows([]);
      setError(e.message || 'Could not load the list.');
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => { load(); }, [load]);

  /* the green "added" / "deleted" message goes away by itself after 4 s */
  useEffect(() => {
    if (!flash) return undefined;
    const t = setTimeout(() => setFlash(''), 4000);
    return () => clearTimeout(t);
  }, [flash]);

  async function add(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) { setAddError('Enter a name.'); return; }
    if (!business || saving) return;
    setSaving(true);
    setError('');
    setAddError('');
    setFlash('');
    try {
      const r = await fetch('/api/v1/admin/product-types', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not add it.');
      setNewName('');
      setShowAdd(false);
      setFlash('"' + name + '" added.');
      load();
    } catch (err) {
      setAddError(err.message || 'Could not add it.');
    } finally {
      setSaving(false);
    }
  }

  async function remove(row) {
    if (!window.confirm('Delete Product Type "' + row.label + '"?')) return;
    setError('');
    setFlash('');
    try {
      const q = new URLSearchParams({ business, value: row.value });
      const r = await fetch('/api/v1/admin/product-types?' + q, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not delete it.');
      setFlash('"' + row.label + '" deleted.');
      load();
    } catch (err) {
      setError(err.message || 'Could not delete it.');
    }
  }

  const needle = search.trim().toLowerCase();
  const shown = needle ? rows.filter((row) => String(row.label || '').toLowerCase().includes(needle)) : rows;

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Product Type</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={() => { setFlash(''); setError(''); load(); }} disabled={!business || loading}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
        <button type="button" className="btn btn-primary ml-2" disabled={!business} onClick={() => { setNewName(''); setAddError(''); setFlash(''); setShowAdd(true); }}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 p-4 pt-24" onMouseDown={() => { if (!saving) setShowAdd(false); }}>
          <form className="w-full max-w-[420px] rounded-lg bg-white shadow-pop" onMouseDown={(e) => e.stopPropagation()} onSubmit={add}>
            <div className="flex items-center border-b border-line px-4 py-3">
              <span className="text-[15px] font-bold">Add Product Type</span>
              <span className="flex-1" />
              <button type="button" aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white" disabled={saving} onClick={() => setShowAdd(false)}>
                <Icon name="x" size={12} />
              </button>
            </div>
            <div className="px-4 py-4">
              <label className="f-label">Product Type name <span className="text-danger">*</span></label>
              <input
                className="f-input w-full"
                placeholder="e.g. Blouse"
                autoFocus
                value={newName}
                disabled={saving}
                onChange={(e) => { setNewName(e.target.value); setAddError(''); }}
              />
              {addError && <div className="f-err mt-1">{addError}</div>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="btn" disabled={saving} onClick={() => setShowAdd(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  <Icon name="plus" size={14} /> {saving ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <div className="card-body">
        {!business && <div className="flash flash-err">Select a company in the top bar.</div>}
        {flash && <div className="flash flash-ok">{flash}</div>}
        {error && <div className="flash flash-err">{error}</div>}

        <div className="w-full max-w-[320px]">
          <label className="f-label">Search</label>
          <input className="f-input w-full" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="dt">
            <thead>
              <tr><th style={{ width: 70 }}>Sl. No.</th><th>Name</th><th style={{ width: 90 }}>Action</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={3} className="text-center text-inkmuted">Loading...</td></tr>}
              {!loading && !shown.length && <tr><td colSpan={3} className="text-center text-inkmuted">{business ? 'No product types yet - use Add.' : '-'}</td></tr>}
              {!loading && shown.map((row, i) => (
                <tr key={row.value}>
                  <td>{i + 1}</td>
                  <td>{row.label}</td>
                  <td>
                    {BUILT_IN.includes(row.value) ? (
                      <span className="text-[12px] text-inkmuted">Built-in</span>
                    ) : (
                      <button type="button" title="Delete" aria-label={'Delete ' + row.label} className="flex h-7 w-7 items-center justify-center rounded bg-danger text-white" onClick={() => remove(row)}>
                        <Icon name="trash" size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && business && <div className="mt-2 text-[12px] text-inkmuted">{shown.length} of {rows.length} shown</div>}
      </div>
    </div>
  );
}
