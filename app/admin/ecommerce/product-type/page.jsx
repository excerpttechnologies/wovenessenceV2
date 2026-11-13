'use client';

import { useCallback, useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';

/* E-commerce -> Product Type */

const FILTER_TYPES = {
  byWeave: 'By Weave',
  byFabric: 'By Fabric',
  byCraft: 'By Craft',
  byOccasion: 'By Occasion',
  byColour: 'By Colour',
};

/* defaults mirror the stored filterConfig entry shape in
   lib/ecommerceFilterConfig.js - the server re-validates anyway. */
const defaultFilterMeta = (key, index) => ({
  displayLabel: '',
  displayOrder: index,
  isActive: true,
  isVisible: true,
  isFilterable: true,
  selectionMode: 'multiple',
});

const defaultGroupConfig = (row) => ({
  displayName: row?.displayName || row?.label || '',
  slug: row?.ecommerceSlug || '',
  description: row?.description || '',
  displayOrder: row?.displayOrder ?? 0,
  isActive: row?.isActive !== false,
  ecommerceVisible: row?.ecommerceVisible !== false,
});

export default function ProductTypePage() {
  const { business } = useScope();

  const [rows, setRows] = useState([]);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');

  const [search, setSearch] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editFilters, setEditFilters] = useState([]);
  const [editFilterMeta, setEditFilterMeta] = useState({});
  const [editEcom, setEditEcom] = useState(null);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [addError, setAddError] = useState('');

  /*
   * Load Product Types.
   */
  const load = useCallback(async () => {
    if (!business) {
      setRows([]);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const r = await fetch(
        '/api/v1/admin/product-types?all=1&business=' +
          encodeURIComponent(business),
        { cache: 'no-store' }
      );

      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(d.error || 'Could not load the list.');
      }

      setRows((d.types || []).filter((type) => type.value));
    } catch (e) {
      setRows([]);
      setError(e.message || 'Could not load the list.');
    } finally {
      setLoading(false);
    }
  }, [business]);

  useEffect(() => {
    load();
  }, [load]);

  /*
   * Flash message disappears after 4 seconds.
   */
  useEffect(() => {
    if (!flash) return undefined;

    const t = setTimeout(() => setFlash(''), 4000);

    return () => clearTimeout(t);
  }, [flash]);

  /*
   * Add Product Type.
   */
  async function add(e) {
    e.preventDefault();

    const name = newName.trim();

    if (!name) {
      setAddError('Enter a name.');
      return;
    }

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

      if (!r.ok) {
        throw new Error(d.error || 'Could not add it.');
      }

      setNewName('');
      setShowAdd(false);
      setFlash('"' + name + '" added.');

      await load();
    } catch (err) {
      setAddError(err.message || 'Could not add it.');
    } finally {
      setSaving(false);
    }
  }

  function startEdit(row) {
    setEditing(row);
    setEditName(row.label || '');    /* per-filter configuration - stored filterConfig entries (an array on
       the producttypes document) win, defaults fill the gaps. A key that is
       only described by filterConfig is still assigned to the group. */
    const storedList = Array.isArray(row.filterConfig) ? row.filterConfig : [];
    const stored = {};
    storedList.forEach((entry) => {
      const key = String(entry?.key || entry?.field || '');
      if (key) stored[key] = entry;
    });
    const listed = Array.isArray(row.filters) ? row.filters : [];
    const filters = [...new Set([...listed, ...Object.keys(stored)])]
      .filter((filter) => Object.prototype.hasOwnProperty.call(FILTER_TYPES, filter))
      .sort((a, b) => {
        const orderA = Number(stored[a]?.displayOrder);
        const orderB = Number(stored[b]?.displayOrder);
        return (Number.isFinite(orderA) ? orderA : 0) - (Number.isFinite(orderB) ? orderB : 0);
      });
    setEditFilters(filters);
    const meta = {};
    filters.forEach((key, index) => {
      meta[key] = { ...defaultFilterMeta(key, index), ...(stored[key] || {}) };
    });
    Object.keys(stored).forEach((key) => {
      if (!meta[key] && Object.prototype.hasOwnProperty.call(FILTER_TYPES, key)) {
        meta[key] = { ...defaultFilterMeta(key, filters.length), ...stored[key] };
      }
    });
    setEditFilterMeta(meta);
    setEditEcom(defaultGroupConfig(row));
    setEditError('');
    setPreview(null);
    setPreviewError('');
  }

  const setFilterMeta = (key, patch) => {
    setEditFilterMeta((current) => ({
      ...current,
      [key]: { ...(current[key] || defaultFilterMeta(key, 0)), ...patch },
    }));
  };

  /* Reorder the filters assigned to the group: up/down only swaps the
     neighbours' displayOrder, the master records are untouched. */
  const moveFilter = (key, direction) => {
    setEditFilters((current) => {
      const index = current.indexOf(key);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      setEditFilterMeta((meta) => {
        const updated = { ...meta };
        next.forEach((filterKey, order) => {
          updated[filterKey] = {
            ...(updated[filterKey] || defaultFilterMeta(filterKey, order)),
            displayOrder: order,
          };
        });
        return updated;
      });
      return next;
    });
  };

  /* Live values from the same builder the storefront uses. */
  async function loadPreview() {
    if (!business || !editing || previewLoading) return;
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const q = new URLSearchParams({ business, value: editing.value });
      const r = await fetch('/api/v1/admin/product-types/preview?' + q.toString(), {
        cache: 'no-store',
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not load the preview.');
      setPreview(d);
    } catch (err) {
      setPreview(null);
      setPreviewError(err.message || 'Could not load the preview.');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function saveEdit(e) {
    e.preventDefault();
    const name = editName.trim().replace(/\s+/g, ' ');

    if (!name) {
      setEditError('Enter a product type name.');
      return;
    }
    if (!business || !editing || editSaving) return;

    setEditSaving(true);
    setEditError('');
    setError('');

    try {
      const r = await fetch('/api/v1/admin/product-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business,
          value: editing.value,
          name,
          displayName: editEcom?.displayName ?? '',
          description: editEcom?.description ?? '',
          ecommerceSlug: editEcom?.slug ?? '',
          displayOrder: editEcom?.displayOrder ?? 0,
          isActive: editEcom?.isActive !== false,
          ecommerceVisible: editEcom?.ecommerceVisible !== false,
          filterConfig: editFilters.map((key, index) => {
            const meta = editFilterMeta[key] || defaultFilterMeta(key, index);
            const order = Number(meta.displayOrder);
            return { key, ...meta, displayOrder: Number.isFinite(order) ? order : index };
          }),
        }),
      });
      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(d.error || 'Could not update product type.');
      }

      setEditing(null);
      setFlash('"' + name + '" updated.');
      await load();
    } catch (e) {
      setEditError(e.message || 'Could not update product type.');
    } finally {
      setEditSaving(false);
    }
  }

  /*
   * Enable / Disable Product Type. Groups are never destroyed - disabling
   * only takes the group off the website, products and history stay.
   */
  async function toggleActive(row) {
    const next = row.isActive === false;
    if (!next && !window.confirm('Disable Product Type "' + row.label + '"? It will be removed from the website, but its products are kept.')) {
      return;
    }
    setError('');
    setFlash('');
    try {
      const r = await fetch('/api/v1/admin/product-types', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, value: row.value, name: row.label, isActive: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not update it.');
      setFlash('"' + row.label + '" ' + (next ? 'enabled.' : 'disabled.'));
      await load();
    } catch (err) {
      setError(err.message || 'Could not update it.');
    }
  }

  /*
   * Search Product Types.
   */
  const needle = search.trim().toLowerCase();

  const shown = needle
    ? rows.filter((row) =>
        String(row.label || '')
          .toLowerCase()
          .includes(needle)
      )
    : rows;

  return (
    <div className="card">
      {/* Header */}
      <div className="card-head">
        <span className="card-title">Product Type</span>

        <span className="flex-1" />

        <button
          type="button"
          className="btn btn-ghost"
          onClick={async () => {
            setFlash('');
            setError('');

            await load();
          }}
          disabled={!business || loading}
        >
          <Icon name="refresh" size={14} />
          Refresh
        </button>

        <button
          type="button"
          className="btn btn-primary ml-2"
          disabled={!business}
          onClick={() => {
            setNewName('');
            setAddError('');
            setFlash('');
            setShowAdd(true);
          }}
        >
          <Icon name="plus" size={14} />
          Add
        </button>
      </div>

      {/* Add Product Type Modal */}
      {showAdd && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 p-4 pt-24"
          onMouseDown={() => {
            if (!saving) setShowAdd(false);
          }}
        >
          <form
            className="w-full max-w-[420px] rounded-lg bg-white shadow-pop"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={add}
          >
            <div className="flex items-center border-b border-line px-4 py-3">
              <span className="text-[15px] font-bold">
                Add Product Type
              </span>

              <span className="flex-1" />

              <button
                type="button"
                aria-label="Close"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white"
                disabled={saving}
                onClick={() => setShowAdd(false)}
              >
                <Icon name="x" size={12} />
              </button>
            </div>

            <div className="px-4 py-4">
              <label className="f-label">
                Product Type name{' '}
                <span className="text-danger">*</span>
              </label>

              <input
                className="f-input w-full"
                placeholder="e.g. Blouse"
                autoFocus
                value={newName}
                disabled={saving}
                onChange={(e) => {
                  setNewName(e.target.value);
                  setAddError('');
                }}
              />

              {addError && (
                <div className="f-err mt-1">{addError}</div>
              )}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={saving}
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={saving}
                >
                  <Icon name="plus" size={14} />
                  {saving ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-[80] flex items-start justify-center bg-black/45 p-4 pt-24"
          onMouseDown={() => {
            if (!editSaving) setEditing(null);
          }}
        >
          <form
            className="w-full max-w-[680px] rounded-lg bg-white shadow-pop"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
          >
            <div className="flex items-center border-b border-line px-4 py-3">
              <span className="text-[15px] font-bold">Edit Product Type</span>
              <span className="flex-1" />
              <button
                type="button"
                aria-label="Close"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white"
                disabled={editSaving}
                onClick={() => setEditing(null)}
              >
                <Icon name="x" size={12} />
              </button>
            </div>

            <div className="px-4 py-4">
              <label className="f-label">
                Product Type name <span className="text-danger">*</span>
              </label>
              <input
                className="f-input w-full"
                value={editName}
                disabled={editSaving}
                onChange={(e) => {
                  setEditName(e.target.value);
                  setEditError('');
                }}
              />

              {/* Ecommerce group settings - what the storefront product-groups
                  API exposes for this type. */}
              <div className="mt-4 rounded border border-line p-3">
                <div className="f-label">E-commerce group</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="f-label">Display name</label>
                    <input
                      className="f-input w-full"
                      value={editEcom?.displayName ?? ''}
                      disabled={editSaving}
                      placeholder={editName || 'e.g. Sarees'}
                      onChange={(e) => setEditEcom((c) => ({ ...(c || {}), displayName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="f-label">Collection slug</label>
                    <input
                      className="f-input w-full"
                      value={editEcom?.slug ?? ''}
                      disabled={editSaving}
                      placeholder="auto from display name"
                      onChange={(e) => setEditEcom((c) => ({ ...(c || {}), slug: e.target.value }))}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="f-label">Description</label>
                    <textarea
                      className="f-input w-full"
                      rows={2}
                      value={editEcom?.description ?? ''}
                      disabled={editSaving}
                      onChange={(e) => setEditEcom((c) => ({ ...(c || {}), description: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="f-label">Display order</label>
                    <input
                      className="f-input w-full"
                      type="number"
                      value={editEcom?.displayOrder ?? 0}
                      disabled={editSaving}
                      onChange={(e) => setEditEcom((c) => ({ ...(c || {}), displayOrder: Number(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="flex items-end gap-4 pb-1">
                    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={editEcom?.isActive !== false}
                        disabled={editSaving}
                        onChange={(e) => setEditEcom((c) => ({ ...(c || {}), isActive: e.target.checked }))}
                      />
                      Active
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                      <input
                        type="checkbox"
                        checked={editEcom?.ecommerceVisible !== false}
                        disabled={editSaving}
                        onChange={(e) => setEditEcom((c) => ({ ...(c || {}), ecommerceVisible: e.target.checked }))}
                      />
                      Visible on store
                    </label>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="f-label">Filters for this group</div>
                <div className="space-y-2">
                  {Object.entries(FILTER_TYPES).map(([type, label]) => {
                    const included = editFilters.includes(type);
                    const meta = editFilterMeta[type] || defaultFilterMeta(type, 0);
                    return (
                      <div key={type} className="rounded border border-line">
                        <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[13px]">
                          <input
                            type="checkbox"
                            checked={included}
                            disabled={editSaving}
                            onChange={(e) => {
                              const on = e.target.checked;
                              setEditFilters((current) => on
                                ? [...current, type]
                                : current.filter((filter) => filter !== type));
                              if (on) setFilterMeta(type, {});
                            }}
                          />
                          <span className="font-medium">{label}</span>
                          {!included && (
                            <span className="text-[11px] text-inkmuted">not used by this type</span>
                          )}
                          {included && (
                            <>
                              <span className="flex-1" />
                              <span
                                role="button"
                                tabIndex={0}
                                title="Move up"
                                className={editFilters.indexOf(type) === 0 ? 'text-inkmuted' : 'text-ink'}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  moveFilter(type, -1);
                                }}
                              >
                                <Icon name="chevR" size={14} className="-rotate-90" />
                              </span>
                              <span
                                role="button"
                                tabIndex={0}
                                title="Move down"
                                className={editFilters.indexOf(type) === editFilters.length - 1 ? 'text-inkmuted' : 'text-ink'}
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  moveFilter(type, 1);
                                }}
                              >
                                <Icon name="chevR" size={14} className="rotate-90" />
                              </span>
                            </>
                          )}
                        </label>
                        {included && (
                          <div className="grid grid-cols-2 gap-2 border-t border-line px-3 py-2 sm:grid-cols-4">
                            <div className="col-span-2 sm:col-span-1">
                              <label className="f-label">Label</label>
                              <input
                                className="f-input w-full"
                                value={meta.displayLabel || ''}
                                placeholder={label}
                                disabled={editSaving}
                                onChange={(e) => setFilterMeta(type, { displayLabel: e.target.value })}
                              />
                            </div>
                            <div>
                              <label className="f-label">Order</label>
                              <input
                                className="f-input w-full"
                                type="number"
                                value={meta.displayOrder ?? 0}
                                disabled={editSaving}
                                onChange={(e) => setFilterMeta(type, { displayOrder: Number(e.target.value) || 0 })}
                              />
                            </div>
                            <div>
                              <label className="f-label">Selection</label>
                              <select
                                className="f-input w-full"
                                value={meta.selectionMode || 'multiple'}
                                disabled={editSaving}
                                onChange={(e) => setFilterMeta(type, { selectionMode: e.target.value })}
                              >
                                <option value="multiple">Multiple</option>
                                <option value="single">Single</option>
                              </select>
                            </div>
                            <div className="col-span-2 flex flex-wrap items-center gap-x-4 gap-y-1 sm:col-span-1 sm:flex-col sm:items-start sm:justify-center">
                              <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                                <input
                                  type="checkbox"
                                  checked={meta.isActive !== false}
                                  disabled={editSaving}
                                  onChange={(e) => setFilterMeta(type, { isActive: e.target.checked })}
                                />
                                Active
                              </label>
                              <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                                <input
                                  type="checkbox"
                                  checked={meta.isVisible !== false}
                                  disabled={editSaving}
                                  onChange={(e) => setFilterMeta(type, { isVisible: e.target.checked })}
                                />
                                Visible on store
                              </label>
                              <label className="flex cursor-pointer items-center gap-1.5 text-[12px]">
                                <input
                                  type="checkbox"
                                  checked={meta.isFilterable !== false}
                                  disabled={editSaving}
                                  onChange={(e) => setFilterMeta(type, { isFilterable: e.target.checked })}
                                />
                                Filterable
                              </label>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="mt-4 rounded border border-line p-3">
                <div className="flex items-center gap-2">
                  <div className="f-label mb-0">Ecommerce preview</div>
                  <span className="flex-1" />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={previewLoading || editSaving}
                    onClick={loadPreview}
                  >
                    <Icon name="eye" size={14} />
                    {previewLoading ? 'Loading...' : 'Load live values'}
                  </button>
                </div>
                {previewError && <div className="f-err mt-1">{previewError}</div>}
                {preview && (
                  <div className="mt-2 text-[13px]">
                    <div className="text-inkmuted">
                      {preview.productCount} eligible product(s) - {preview.filters.length} active filter(s)
                    </div>
                    {preview.filters.map((filter) => (
                      <div key={filter.key} className="mt-1">
                        <span className="font-medium">{filter.displayLabel || filter.label}</span>
                        <span className="text-inkmuted"> ({filter.selectionMode})</span>
                        <div className="text-[12px] text-inkmuted">
                          {filter.options.length
                            ? filter.options.map((option) => option.name + ' (' + option.count + ')').join(', ')
                            : 'No live values for this filter.'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editError && <div className="f-err mt-2">{editError}</div>}

              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={editSaving}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={editSaving}
                >
                  <Icon name="save" size={14} />
                  {editSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Body */}
      <div className="card-body">
        {!business && (
          <div className="flash flash-err">
            Select a company in the top bar.
          </div>
        )}

        {flash && <div className="flash flash-ok">{flash}</div>}

        {error && <div className="flash flash-err">{error}</div>}

        {/* Search */}
        <div className="w-full max-w-[320px]">
          <label className="f-label">Search</label>

          <input
            className="f-input w-full"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Product Type Table */}
        <div className="mt-4 overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                <th style={{ width: 90 }}>Action</th>
                <th style={{ width: 70 }}>Sl. No.</th>
                <th style={{ minWidth: 160 }}>Product Type</th>
                <th style={{ minWidth: 140 }}>Group</th>
                <th style={{ minWidth: 140 }}>Slug</th>
                <th style={{ width: 90 }}>Store</th>
                <th style={{ minWidth: 280 }}>Filters</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-inkmuted"
                  >
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && !shown.length && (
                <tr>
                  <td
                    colSpan={7}
                    className="text-center text-inkmuted"
                  >
                    {business
                      ? 'No product types yet - use Add.'
                      : '-'}
                  </td>
                </tr>
              )}

              {!loading &&
                shown.map((row, i) => {
                  const applicableFilters =
                    (Array.isArray(row.filters) ? row.filters : [])
                      .filter((type) =>
                        Object.prototype.hasOwnProperty.call(FILTER_TYPES, type));

                  return (
                    <tr key={row.value}>
                      {/* Action */}
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Edit"
                            aria-label={'Edit ' + row.label}
                            className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white"
                            onClick={() => startEdit(row)}
                          >
                            <Icon name="pencil" size={14} />
                          </button>
                          <button
                            type="button"
                            title={row.isActive === false ? 'Enable' : 'Disable'}
                            aria-label={(row.isActive === false ? 'Enable ' : 'Disable ') + row.label}
                            className={
                              'flex h-7 w-7 items-center justify-center rounded text-white '
                              + (row.isActive === false ? 'bg-emerald-600' : 'bg-danger')
                            }
                            onClick={() => toggleActive(row)}
                          >
                            <Icon name={row.isActive === false ? 'check' : 'x'} size={14} />
                          </button>
                        </div>
                      </td>

                      {/* Serial Number */}
                      <td>{i + 1}</td>

                      {/* Product Type */}
                      <td>{row.label}</td>

                      {/* Ecommerce group */}
                      <td>{row.displayName || row.label}</td>
                      <td className="font-mono text-[12px]">{row.ecommerceSlug || '-'}</td>
                      <td>
                        {row.isActive === false ? (
                          <span className="inline-flex rounded bg-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            Disabled
                          </span>
                        ) : row.ecommerceVisible === false ? (
                          <span className="inline-flex rounded bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                            Hidden
                          </span>
                        ) : (
                          <span className="inline-flex rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800">
                            Live
                          </span>
                        )}
                      </td>

                      {/* Dynamic Filters */}
                      <td>
                        {applicableFilters.length === 0 ? (
                          <div className="text-[12px] text-inkmuted">
                            No filters configured.
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {applicableFilters.map((type) => (
                              <span
                                key={type}
                                className="inline-flex items-center gap-1 rounded border border-line bg-white px-2 py-1 text-[12px]"
                              >
                                {(() => {
                                  const entry = (Array.isArray(row.filterConfig) ? row.filterConfig : [])
                                    .find((f) => String(f?.key || f?.field || '') === type);
                                  return entry?.displayLabel || entry?.label || FILTER_TYPES[type];
                                })()}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {!loading && business && (
          <div className="mt-2 text-[12px] text-inkmuted">
            {shown.length} of {rows.length} shown
          </div>
        )}
      </div>
    </div>
  );
}