'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import { classificationGroupsFor } from '@/lib/productClassificationConstants';
import NumberedPager from '@/components/NumberedPager';
import ConfirmDialog from '@/components/ConfirmDialog';

/* E-commerce -> By Weave / By Fabric / By Craft / By Occasion / By Colour
   (28-10-2026). One screen per classification type, for the business picked
   in the top bar.

   It uses the SAME API as the pickers on product-eccom/add
   (/api/v1/admin/product-classification-options), so a name added here is
   saved exactly where "Add New By ..." saves it and shows up in that picker
   straight away.

   29-10-2026: the names are kept in byweave / byfabric / ... (no longer in
   productclassificationoption) and each one belongs to a GROUP - the
   e-commerce category (Sarees, Fabrics, Plain Fabrics, Dupatta, Simple). Pick
   the group at the top; the list and Add work on that group only, and the
   product-eccom picker shows the names of the product's own Product Type.
   Delete removes the name and unticks it on the e-commerce products. */

export default function ClassificationOptionsPage({ type, label }) {
  const { business } = useScope();
  const groups = classificationGroupsFor(type);
  const [group, setGroup] = useState(groups[0]?.value || '');
  const groupLabel = groups.find((g) => g.value === group)?.label || '';
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  /* the Add pop-up (28-10-2026): open, and its own error line */
  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState('');
  /* delete asks through the app's ConfirmDialog; client-side paging (30-10-2026) */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  const load = useCallback(async () => {
    if (!business || !group) { setRows([]); return; }
    setLoading(true);
    setError('');
    try {
      const q = new URLSearchParams({ business, type, productType: group });
      const r = await fetch('/api/v1/admin/product-classification-options?' + q, { cache: 'no-store' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load the list.');
      setRows(d.options?.[type] || []);
    } catch (e) {
      setRows([]);
      setError(e.message || 'Could not load the list.');
    } finally {
      setLoading(false);
    }
  }, [business, type, group]);

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
      const r = await fetch('/api/v1/admin/product-classification-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, type, productType: group, name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not add it.');
      setNewName('');
      setShowAdd(false);
      setFlash('"' + name + '" added to ' + groupLabel + '.');
      load();
    } catch (err) {
      setAddError(err.message || 'Could not add it.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row || deleting) return;
    setDeleting(true);
    setError('');
    setFlash('');
    try {
      const r = await fetch('/api/v1/admin/product-classification-options/' + row._id, { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not delete it.');
      setFlash('"' + row.name + '" deleted.' + (d.productsUpdated ? ' Removed from ' + d.productsUpdated + ' product(s).' : ''));
      setPendingDelete(null);
      load();
    } catch (err) {
      setPendingDelete(null);
      setError(err.message || 'Could not delete it.');
    } finally {
      setDeleting(false);
    }
  }

  const needle = search.trim().toLowerCase();
  const filtered = needle ? rows.filter((row) => String(row.name || '').toLowerCase().includes(needle)) : rows;
  const pages = Math.max(1, Math.ceil(filtered.length / perPage));
  const curPage = Math.min(page, pages);
  const offset = (curPage - 1) * perPage;
  const shown = filtered.slice(offset, offset + perPage);

  useEffect(() => { setPage(1); }, [search, type, business, group]);

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{label}</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={() => { setFlash(''); setError(''); load(); }} disabled={!business || loading}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
        <button type="button" className="btn btn-primary ml-2" disabled={!business} onClick={() => { setNewName(''); setAddError(''); setFlash(''); setShowAdd(true); }}>
          <Icon name="plus" size={14} /> Add
        </button>
      </div>

      {/* ADD POP-UP (28-10-2026) */}
      {showAdd && (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 p-4 pt-24" onMouseDown={() => { if (!saving) setShowAdd(false); }}>
          <form className="w-full max-w-[420px] rounded-lg bg-white shadow-pop" onMouseDown={(e) => e.stopPropagation()} onSubmit={add}>
            <div className="flex items-center border-b border-line px-4 py-3">
              <span className="text-[15px] font-bold">Add {label} - {groupLabel}</span>
              <span className="flex-1" />
              <button type="button" aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white" disabled={saving} onClick={() => setShowAdd(false)}>
                <Icon name="x" size={12} />
              </button>
            </div>
            <div className="px-4 py-4">
              <label className="f-label">{label} name <span className="text-danger">*</span></label>
              <input
                className="f-input w-full"
                placeholder={'e.g. ' + (type === 'byColour' ? 'Rani Pink' : type === 'byFabric' ? 'Tussar Silk Fabric' : 'New name')}
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

        <div className="flex flex-wrap gap-4">
          <div className="w-full max-w-[220px]">
            <label className="f-label">Group</label>
            <select className="f-input w-full" value={group} onChange={(e) => { setGroup(e.target.value); setFlash(''); setError(''); }}>
              {groups.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </div>
          <div className="w-full max-w-[320px]">
            <label className="f-label">Search</label>
            <input className="f-input w-full" placeholder="Search..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="dt dt-nowrap-head">
            <thead>
              <tr><th style={{ width: 90 }}>Action</th><th style={{ width: 70 }}>Sl. No.</th><th>Name</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={3} className="text-center text-inkmuted">Loading...</td></tr>}
              {!loading && !shown.length && <tr><td colSpan={3} className="text-center text-inkmuted">{business ? 'Nothing in ' + groupLabel + ' yet - use Add.' : '-'}</td></tr>}
              {!loading && shown.map((row, i) => (
                <tr key={row._id}>
                  <td>
                    <button type="button" title="Delete" aria-label={'Delete ' + row.name} className="act-btn act-red" onClick={() => setPendingDelete(row)}>
                      <Icon name="trash" size={12} />
                    </button>
                  </td>
                  <td>{offset + i + 1}</td>
                  <td>{row.name}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && business && (
          <NumberedPager page={curPage} pages={pages} total={filtered.length} shown={shown.length} perPage={perPage} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} />
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        recordName={pendingDelete ? pendingDelete.name : ''}
        message={pendingDelete ? 'It will be removed from ' + label + ' (' + groupLabel + ') and taken off the e-commerce products that have it.' : undefined}
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
