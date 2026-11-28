'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import { useToast } from '@/components/ToastContext';
import { CLASSIFICATION_GROUPS, classificationGroupsFor } from '@/lib/productClassificationConstants';
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

export default function ClassificationOptionsPage({ type, label, isCustom = false }) {
  const router = useRouter();
  const { business, user, can } = useScope();
  const { showToast } = useToast();
  const canDeleteFilter = user?.role === 'Super Admin' || (can ? can('/admin/ecommerce/product-type', 'delete') : true);
  const baseGroups = useMemo(
    () => (isCustom ? CLASSIFICATION_GROUPS : classificationGroupsFor(type)),
    [isCustom, type]
  );
  const [dynamicGroups, setDynamicGroups] = useState([]);
  const groups = dynamicGroups.length ? dynamicGroups : baseGroups;
  const [group, setGroup] = useState(baseGroups[0]?.value || '');
  const groupLabel = groups.find((g) => g.value === group)?.label || group;
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
  /* Edit pop-up */
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  /* delete asks through the app's ConfirmDialog; client-side paging (30-10-2026) */
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);

  /* Whole-filter delete modal state */
  const [showDeleteFilter, setShowDeleteFilter] = useState(false);
  const [impactLoading, setImpactLoading] = useState(false);
  const [impact, setImpact] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingWholeFilter, setDeletingWholeFilter] = useState(false);
  const [deleteFilterError, setDeleteFilterError] = useState('');

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

  useEffect(() => {
    if (!business) {
      setDynamicGroups([]);
      return undefined;
    }
    let off = false;
    fetch('/api/v1/admin/product-types?all=1&business=' + encodeURIComponent(business), { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((d) => {
        if (off) return;
        const fromDb = (Array.isArray(d.types) ? d.types : [])
          .filter((pt) => pt?.value && pt.isActive !== false)
          .filter((pt) => !Array.isArray(pt.filters) || !pt.filters.length || pt.filters.includes(type) || baseGroups.some((g) => g.value === String(pt.value).toUpperCase()))
          .map((pt) => ({
            value: String(pt.value).trim().toUpperCase(),
            label: String(pt.label || pt.displayName || pt.value).trim(),
          }));
        const merged = [];
        const seen = new Set();
        [...fromDb, ...baseGroups].forEach((g) => {
          if (!g.value || seen.has(g.value)) return;
          seen.add(g.value);
          merged.push(g);
        });
        setDynamicGroups(merged);
        if (merged.length && !merged.some((g) => g.value === group)) {
          setGroup(merged[0].value);
        }
      })
      .catch(() => { if (!off) setDynamicGroups([]); });
    return () => { off = true; };
  }, [business, type, baseGroups]);

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

  async function saveEdit(e) {
    e.preventDefault();
    const name = editName.trim().replace(/\s+/g, ' ');
    if (!name) { setEditError('Enter a name.'); return; }
    if (!business || !editing || editSaving) return;
    setEditSaving(true);
    setError('');
    setEditError('');
    setFlash('');
    try {
      const r = await fetch('/api/v1/admin/product-classification-options/' + editing._id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, name }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not update it.');
      setEditing(null);
      setFlash('"' + (d.option?.name || name) + '" updated.');
      load();
    } catch (err) {
      setEditError(err.message || 'Could not update it.');
    } finally {
      setEditSaving(false);
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
      setFlash('"' + row.name + '" deleted.' + (d.usedCount ? ' Existing ' + d.usedCount + ' product(s) retain their saved reference.' : ''));
      setPendingDelete(null);
      load();
    } catch (err) {
      setPendingDelete(null);
      setError(err.message || 'Could not delete it.');
    } finally {
      setDeleting(false);
    }
  }

  async function openDeleteFilterModal() {
    if (!business || !type || !canDeleteFilter) return;
    setShowDeleteFilter(true);
    setImpactLoading(true);
    setImpact(null);
    setDeleteConfirmText('');
    setDeleteFilterError('');
    try {
      const r = await fetch(
        '/api/v1/admin/ecommerce-filters/by-key/' + encodeURIComponent(type) + '?business=' + encodeURIComponent(business),
        { cache: 'no-store' },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load filter impact.');
      setImpact(d.impact || { valuesCount: 0, productTypesCount: 0, productsCount: 0 });
    } catch (err) {
      setDeleteFilterError(err.message || 'Could not load filter impact.');
    } finally {
      setImpactLoading(false);
    }
  }

  async function confirmDeleteWholeFilter(e) {
    e.preventDefault();
    if (!business || !type || deletingWholeFilter || !canDeleteFilter) return;
    if (deleteConfirmText.trim().toLowerCase() !== String(label || '').trim().toLowerCase()) {
      setDeleteFilterError('Type "' + label + '" exactly to confirm.');
      return;
    }
    setDeletingWholeFilter(true);
    setDeleteFilterError('');
    try {
      const r = await fetch(
        '/api/v1/admin/ecommerce-filters/by-key/' + encodeURIComponent(type) + '?business=' + encodeURIComponent(business),
        { method: 'DELETE' },
      );
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not delete filter.');
      setShowDeleteFilter(false);
      showToast('"' + label + '" filter deleted.', 'success');
      window.dispatchEvent(new Event('ecommerce-filters-updated'));
      window.dispatchEvent(new Event('ecommerce-product-types-updated'));
      router.push('/admin/ecommerce/product-type');
    } catch (err) {
      setDeleteFilterError(err.message || 'Could not delete filter.');
    } finally {
      setDeletingWholeFilter(false);
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

      {/* EDIT POP-UP */}
      {editing && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/45 p-4" onMouseDown={() => { if (!editSaving) setEditing(null); }}>
          <form className="w-full max-w-[420px] rounded-lg bg-white shadow-pop" onMouseDown={(e) => e.stopPropagation()} onSubmit={saveEdit}>
            <div className="flex items-center border-b border-line px-4 py-3">
              <span className="text-[15px] font-bold">Edit {label} - {groupLabel}</span>
              <span className="flex-1" />
              <button type="button" aria-label="Close" className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white" disabled={editSaving} onClick={() => setEditing(null)}>
                <Icon name="x" size={12} />
              </button>
            </div>
            <div className="px-4 py-4">
              <label className="f-label">{label} name <span className="text-danger">*</span></label>
              <input
                className="f-input w-full"
                autoFocus
                value={editName}
                disabled={editSaving}
                onChange={(e) => { setEditName(e.target.value); setEditError(''); }}
              />
              {editError && <div className="f-err mt-1">{editError}</div>}
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" className="btn" disabled={editSaving} onClick={() => setEditing(null)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editSaving}>
                  <Icon name="save" size={14} /> {editSaving ? 'Saving...' : 'Save'}
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

        <div className="flex flex-wrap items-end gap-4">
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
          {business && canDeleteFilter && (
            <button
              type="button"
              title={'Delete ' + label + ' filter'}
              aria-label={'Delete ' + label + ' filter'}
              onClick={openDeleteFilterModal}
              className="inline-flex h-[34px] items-center gap-1.5 rounded border border-[#e0342c] bg-white px-3 text-[12px] font-semibold uppercase tracking-wide text-[#e0342c] transition hover:bg-[#e0342c] hover:text-white"
            >
              <Icon name="trash" size={13} />
              Delete
            </button>
          )}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="dt dt-nowrap-head">
            <thead>
              <tr><th style={{ width: 90 }}>Action</th><th style={{ width: 70 }}>Sl. No.</th><th>Name</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={3} className="text-center text-inkmuted">Loading...</td></tr>}
              {!loading && !shown.length && <tr><td colSpan={3} className="text-center text-inkmuted">{business ? (needle ? 'No matching records found.' : 'No records found. Please add new records.') : '-'}</td></tr>}
              {!loading && shown.map((row, i) => (
                <tr key={row._id}>
                  <td>
                    <span className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        title="Edit"
                        aria-label={'Edit ' + row.name}
                        className="act-btn act-blue"
                        onClick={() => { setEditing(row); setEditName(row.name || ''); setEditError(''); setFlash(''); }}
                      >
                        <Icon name="pencil" size={12} />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        aria-label={'Delete ' + row.name}
                        className="act-btn act-red"
                        onClick={() => setPendingDelete(row)}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    </span>
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
        message={pendingDelete ? 'It will be removed from active ' + label + ' (' + groupLabel + ') and filters. Existing products referencing it keep their saved data.' : undefined}
        busy={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
      />

      {showDeleteFilter && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onMouseDown={() => { if (!deletingWholeFilter) setShowDeleteFilter(false); }}
        >
          <form
            className="w-full max-w-[460px] rounded-lg bg-white shadow-pop"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={confirmDeleteWholeFilter}
          >
            <div className="flex items-center border-b border-line px-4 py-3">
              <span className="text-[15px] font-bold uppercase text-[#e0342c]">
                Delete {label}?
              </span>
              <span className="flex-1" />
              <button
                type="button"
                aria-label="Close"
                disabled={deletingWholeFilter}
                onClick={() => setShowDeleteFilter(false)}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white"
              >
                <Icon name="x" size={12} />
              </button>
            </div>
            <div className="space-y-3 px-4 py-4 text-[13px]">
              <p className="text-ink">
                This will permanently delete the entire <b>{String(label || '').toUpperCase()}</b> filter:
              </p>
              <ul className="list-disc space-y-1 pl-5 text-[12.5px] text-inkmuted">
                <li>Removed from the E-commerce sidebar menu</li>
                <li>Removed from all Product Types, modal icons, and Ecommerce Preview</li>
                <li>Removed from the Woven Essence storefront sidebar and filter panel</li>
                <li>Products themselves remain intact (tagged filter references are cleaned)</li>
              </ul>

              <div className="rounded border border-line bg-[#f8fafc] p-3 text-[12.5px]">
                <div className="mb-1 font-semibold uppercase tracking-wide text-ink">Impact Summary</div>
                {impactLoading ? (
                  <div className="text-inkmuted">Calculating impact...</div>
                ) : impact ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded border border-line bg-white p-2">
                      <div className="text-[16px] font-bold text-ink">{impact.valuesCount}</div>
                      <div className="text-[11px] text-inkmuted">Values</div>
                    </div>
                    <div className="rounded border border-line bg-white p-2">
                      <div className="text-[16px] font-bold text-ink">{impact.productTypesCount}</div>
                      <div className="text-[11px] text-inkmuted">Product Types</div>
                    </div>
                    <div className="rounded border border-line bg-white p-2">
                      <div className="text-[16px] font-bold text-ink">{impact.productsCount}</div>
                      <div className="text-[11px] text-inkmuted">Products</div>
                    </div>
                  </div>
                ) : null}
              </div>

              <div>
                <label className="f-label">
                  Type <span className="font-bold text-ink">{label}</span> to confirm
                </label>
                <input
                  className="f-input w-full"
                  autoFocus
                  placeholder={label}
                  value={deleteConfirmText}
                  disabled={deletingWholeFilter}
                  onChange={(e) => { setDeleteConfirmText(e.target.value); setDeleteFilterError(''); }}
                />
              </div>

              {deleteFilterError && <div className="f-err">{deleteFilterError}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn"
                  disabled={deletingWholeFilter}
                  onClick={() => setShowDeleteFilter(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    deletingWholeFilter ||
                    impactLoading ||
                    deleteConfirmText.trim().toLowerCase() !== String(label || '').trim().toLowerCase()
                  }
                  className="inline-flex items-center gap-1.5 rounded bg-[#e0342c] px-3.5 py-2 text-[12.5px] font-semibold text-white transition hover:bg-[#c52821] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Icon name="trash" size={13} />
                  {deletingWholeFilter ? 'Deleting...' : 'Delete filter'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
