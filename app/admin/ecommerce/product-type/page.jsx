'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useScope } from '@/components/ScopeContext';
import { LuPlus } from 'react-icons/lu';
import {
  BUILT_IN_FILTER_DEFS,
  FILTER_ICON_CHOICES,
  resolveFilterIconComponent,
} from '@/lib/ecommerceFilterIcons';

/* E-commerce -> Product Type */

const suggestFilterKey = (input) => {
  const raw = String(input || '').trim();
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(raw)) {
    return (raw.charAt(0).toLowerCase() + raw.slice(1)).slice(0, 48);
  }
  const words = raw
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  return words
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join('');
};

const suggestFilterSlug = (input) =>
  String(input || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);

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
  const [filterDefs, setFilterDefs] = useState(() => BUILT_IN_FILTER_DEFS);
  const [newFilters, setNewFilters] = useState(() => BUILT_IN_FILTER_DEFS.map((f) => f.key));
  const [addError, setAddError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  /* Custom Filter creation modal */
  const [showAddFilter, setShowAddFilter] = useState(false);
  const [filterName, setFilterName] = useState('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterKey, setFilterKey] = useState('');
  const [filterSlug, setFilterSlug] = useState('');
  const [filterKeyEdited, setFilterKeyEdited] = useState(false);
  const [filterSlugEdited, setFilterSlugEdited] = useState(false);
  const [filterLabelEdited, setFilterLabelEdited] = useState(false);
  const [filterIcon, setFilterIcon] = useState('tag');
  const [filterActive, setFilterActive] = useState(true);
  const [filterVisible, setFilterVisible] = useState(true);
  const [filterSaving, setFilterSaving] = useState(false);
  const [filterError, setFilterError] = useState('');

  const activeFilterDefs = useMemo(
    () => filterDefs.filter((f) => f.isActive !== false),
    [filterDefs]
  );
  const filterMap = useMemo(
    () => Object.fromEntries(filterDefs.map((f) => [f.key, f])),
    [filterDefs]
  );

  /*
   * Load Product Types + Registered Filters.
   */
  const load = useCallback(async () => {
    if (!business) {
      setRows([]);
      setFilterDefs(BUILT_IN_FILTER_DEFS);
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [ptRes, fRes] = await Promise.all([
        fetch('/api/v1/admin/product-types?all=1&business=' + encodeURIComponent(business), { cache: 'no-store' }),
        fetch('/api/v1/admin/ecommerce-filters?includeInactive=1&business=' + encodeURIComponent(business), { cache: 'no-store' }),
      ]);

      const d = await ptRes.json().catch(() => ({}));
      const fd = fRes.ok ? await fRes.json().catch(() => ({})) : {};

      if (!ptRes.ok) {
        throw new Error(d.error || 'Could not load the list.');
      }

      if (Array.isArray(fd.filters) && fd.filters.length) {
        setFilterDefs(fd.filters);
      } else {
        setFilterDefs(BUILT_IN_FILTER_DEFS);
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
        body: JSON.stringify({
          business,
          name,
          filters: newFilters,
          filterConfig: newFilters.map((key, index) => ({
            key,
            ...defaultFilterMeta(key, index),
            displayLabel: filterMap[key]?.name || filterMap[key]?.label || key,
          })),
        }),
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
      .filter((filter) => Boolean(filterMap[filter]))
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
      if (!meta[key] && filterMap[key]) {
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

  const openAddFilterModal = () => {
    setFilterName('');
    setFilterLabel('');
    setFilterKey('');
    setFilterSlug('');
    setFilterKeyEdited(false);
    setFilterSlugEdited(false);
    setFilterLabelEdited(false);
    setFilterIcon('tag');
    setFilterActive(true);
    setFilterVisible(true);
    setFilterError('');
    setShowAddFilter(true);
  };

  async function saveCustomFilter(e) {
    e.preventDefault();
    if (!business || filterSaving) return;
    const trimmedName = filterName.trim().replace(/\s+/g, ' ');
    const trimmedLabel = (filterLabel.trim() || trimmedName).replace(/\s+/g, ' ');
    const nextKey = (filterKey.trim() || suggestFilterKey(trimmedLabel));
    const nextSlug = (filterSlug.trim() || suggestFilterSlug(trimmedLabel));

    if (!trimmedName) {
      setFilterError('Enter a filter name.');
      return;
    }
    if (!nextKey) {
      setFilterError('Enter a valid filter key.');
      return;
    }
    if (!nextSlug) {
      setFilterError('Enter a valid slug.');
      return;
    }

    setFilterSaving(true);
    setFilterError('');
    try {
      const res = await fetch('/api/v1/admin/ecommerce-filters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business,
          name: trimmedName,
          label: trimmedLabel,
          key: nextKey,
          slug: nextSlug,
          icon: filterIcon,
          isActive: filterActive,
          ecommerceVisible: filterVisible,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not create filter.');

      const created = data.filter;
      if (created) {
        setFilterDefs((cur) => {
          const filtered = cur.filter((f) => f.key !== created.key);
          return [...filtered, created];
        });
        if (editing) {
          setEditFilters((cur) => (cur.includes(created.key) ? cur : [...cur, created.key]));
          setFilterMeta(created.key, {
            displayLabel: created.name || created.label,
            displayOrder: editFilters.length,
            isActive: created.isActive !== false,
            isVisible: created.ecommerceVisible !== false,
          });
        }
        if (showAdd) {
          setNewFilters((cur) => (cur.includes(created.key) ? cur : [...cur, created.key]));
        }
        window.dispatchEvent(new Event('ecommerce-filters-updated'));
        setFlash(`Filter "${created.name}" created.`);
      }
      setShowAddFilter(false);
    } catch (err) {
      setFilterError(err.message || 'Could not create filter.');
    } finally {
      setFilterSaving(false);
    }
  }

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

  async function confirmDelete() {
    const row = pendingDelete;
    if (!row || !business || deleting) return;
    setDeleting(true);
    setError('');
    setFlash('');
    try {
      const q = new URLSearchParams({
        business,
        value: row.value || '',
        ...(row._id ? { id: row._id } : {}),
      });
      const r = await fetch('/api/v1/admin/product-types?' + q.toString(), { method: 'DELETE' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Could not delete product type.');
      setPendingDelete(null);
      setFlash('"' + (row.label || row.value) + '" deleted.');
      await load();
    } catch (err) {
      setPendingDelete(null);
      setError(err.message || 'Could not delete product type.');
    } finally {
      setDeleting(false);
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
            setNewFilters(activeFilterDefs.map((f) => f.key));
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
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/45 p-4"
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

              <div className="mt-3">
                <div className="f-label">Filters for this type</div>
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-[#f8fafc] p-2">
                  {activeFilterDefs.map((def) => {
                    const checked = newFilters.includes(def.key);
                    const FilterIcon = resolveFilterIconComponent(def.icon, def.key);
                    const tooltip = def.name || def.label || def.key;
                    return (
                      <button
                        key={def.key}
                        type="button"
                        title={tooltip}
                        aria-label={tooltip}
                        aria-pressed={checked}
                        disabled={saving}
                        onClick={() => {
                          setNewFilters((cur) => (checked
                            ? cur.filter((k) => k !== def.key)
                            : [...new Set([...cur, def.key])]));
                        }}
                        className={
                          'inline-flex h-9 w-9 items-center justify-center rounded-md border transition ' +
                          (checked
                            ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30'
                            : 'border-line bg-white text-inkmuted hover:border-slate-300 hover:bg-slate-50 hover:text-ink')
                        }
                      >
                        <FilterIcon size={17} />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    title="Add Filter"
                    aria-label="Add Filter"
                    disabled={saving}
                    onClick={openAddFilterModal}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-primary/60 bg-primary/5 text-primary transition hover:border-primary hover:bg-primary/15"
                  >
                    <LuPlus size={17} />
                  </button>
                </div>
              </div>

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
          className="fixed inset-0 z-[80] flex items-center justify-center overflow-y-auto bg-black/45 p-4"
          onMouseDown={() => {
            if (!editSaving) setEditing(null);
          }}
        >
          <form
            className="flex max-h-[90vh] w-full max-w-[680px] flex-col overflow-hidden rounded-lg bg-white shadow-pop"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
          >
            <div className="flex shrink-0 items-center border-b border-line px-4 py-3">
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

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
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
                  <div className="sm:col-span-2">
                    <label className="f-label">Display name</label>
                    <input
                      className="f-input w-full"
                      value={editEcom?.displayName ?? ''}
                      disabled={editSaving}
                      placeholder={editName || 'e.g. Sarees'}
                      onChange={(e) => setEditEcom((c) => ({ ...(c || {}), displayName: e.target.value }))}
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
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <div className="f-label mb-0">Filters for this group</div>
                  <span className="text-[11px] text-inkmuted">{editFilters.length} selected</span>
                </div>

                {/* Icon-only filter toggle bar + Add Filter (+) button */}
                <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-[#f8fafc] p-2.5">
                  {activeFilterDefs.map((def) => {
                    const included = editFilters.includes(def.key);
                    const FilterIcon = resolveFilterIconComponent(def.icon, def.key);
                    const tooltip = def.name || def.label || def.key;
                    return (
                      <button
                        key={def.key}
                        type="button"
                        title={tooltip}
                        aria-label={tooltip}
                        aria-pressed={included}
                        disabled={editSaving}
                        onClick={() => {
                          setEditFilters((current) =>
                            included
                              ? current.filter((filter) => filter !== def.key)
                              : [...current, def.key]
                          );
                          if (!included) setFilterMeta(def.key, {});
                        }}
                        className={
                          'inline-flex h-9 w-9 items-center justify-center rounded-md border transition ' +
                          (included
                            ? 'border-primary bg-primary/10 text-primary shadow-sm ring-1 ring-primary/30'
                            : 'border-line bg-white text-inkmuted hover:border-slate-300 hover:bg-slate-50 hover:text-ink')
                        }
                      >
                        <FilterIcon size={17} />
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    title="Add Filter"
                    aria-label="Add Filter"
                    disabled={editSaving}
                    onClick={openAddFilterModal}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-dashed border-primary/60 bg-primary/5 text-primary transition hover:border-primary hover:bg-primary/15"
                  >
                    <LuPlus size={17} />
                  </button>
                </div>

                {/* Per-filter display configuration for enabled filters */}
                <div className="space-y-2">
                  {editFilters.length === 0 && (
                    <div className="rounded border border-dashed border-line px-3 py-2 text-[12px] text-inkmuted">
                      No filters enabled for this group. Click filter icons above to enable them.
                    </div>
                  )}
                  {editFilters.map((type, idx) => {
                    const def = filterMap[type];
                    const label = def?.name || def?.label || type;
                    const FilterIcon = resolveFilterIconComponent(def?.icon, type);
                    const meta = editFilterMeta[type] || defaultFilterMeta(type, idx);
                    return (
                      <div key={type} className="rounded border border-line">
                        <div className="flex items-center gap-2 px-3 py-2 text-[13px]">
                          <span className="inline-flex h-6 w-6 items-center justify-center rounded bg-slate-100 text-primary">
                            <FilterIcon size={14} />
                          </span>
                          <span className="font-medium">{label}</span>
                          {def?.isActive === false && (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                              Filter inactive
                            </span>
                          )}
                          <span className="flex-1" />
                          <button
                            type="button"
                            title="Move up"
                            aria-label={'Move ' + label + ' up'}
                            disabled={idx === 0 || editSaving}
                            className={idx === 0 ? 'text-inkmuted opacity-40' : 'text-ink hover:text-primary'}
                            onClick={() => moveFilter(type, -1)}
                          >
                            <Icon name="chevR" size={14} className="-rotate-90" />
                          </button>
                          <button
                            type="button"
                            title="Move down"
                            aria-label={'Move ' + label + ' down'}
                            disabled={idx === editFilters.length - 1 || editSaving}
                            className={idx === editFilters.length - 1 ? 'text-inkmuted opacity-40' : 'text-ink hover:text-primary'}
                            onClick={() => moveFilter(type, 1)}
                          >
                            <Icon name="chevR" size={14} className="rotate-90" />
                          </button>
                          <button
                            type="button"
                            title={'Disable ' + label}
                            aria-label={'Disable ' + label}
                            disabled={editSaving}
                            className="ml-1 text-inkmuted hover:text-danger"
                            onClick={() => setEditFilters((cur) => cur.filter((f) => f !== type))}
                          >
                            <Icon name="x" size={13} />
                          </button>
                        </div>
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
            </div>

            <div className="flex shrink-0 justify-end gap-2 border-t border-line bg-white px-4 py-3">
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
                <th style={{ width: 110 }}>Action</th>
                <th style={{ width: 70 }}>Sl. No.</th>
                <th style={{ minWidth: 160 }}>Product Type</th>
                <th style={{ minWidth: 140 }}>Group</th>
                <th style={{ width: 90 }}>Store</th>
                <th style={{ minWidth: 280 }}>Filters</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-inkmuted"
                  >
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && !shown.length && (
                <tr>
                  <td
                    colSpan={6}
                    className="text-center text-inkmuted"
                  >
                    {business
                      ? (needle ? 'No matching records found.' : 'No records found. Please add new records.')
                      : '-'}
                  </td>
                </tr>
              )}

              {!loading &&
                shown.map((row, i) => {
                  const applicableFilters =
                    (Array.isArray(row.filters) ? row.filters : [])
                      .filter((type) => Boolean(filterMap[type]));

                  return (
                    <tr key={row.value}>
                      {/* Action */}
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            title="Edit"
                            aria-label={'Edit ' + row.label}
                            className="act-btn act-blue"
                            onClick={() => startEdit(row)}
                          >
                            <Icon name="pencil" size={13} />
                          </button>
                          <button
                            type="button"
                            title={row.isActive === false ? 'Enable' : 'Disable'}
                            aria-label={(row.isActive === false ? 'Enable ' : 'Disable ') + row.label}
                            className={
                              'act-btn '
                              + (row.isActive === false ? 'act-green' : 'act-amber')
                            }
                            onClick={() => toggleActive(row)}
                          >
                            <Icon name={row.isActive === false ? 'check' : 'x'} size={13} />
                          </button>
                          <button
                            type="button"
                            title="Delete"
                            aria-label={'Delete ' + row.label}
                            className="act-btn act-red"
                            onClick={() => setPendingDelete(row)}
                          >
                            <Icon name="trash" size={13} />
                          </button>
                        </div>
                      </td>

                      {/* Serial Number */}
                      <td>{i + 1}</td>

                      {/* Product Type */}
                      <td>{row.label}</td>

                      {/* Ecommerce group */}
                      <td>{row.displayName || row.label}</td>
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
                            {applicableFilters.map((type) => {
                              const def = filterMap[type];
                              const FilterIcon = resolveFilterIconComponent(def?.icon, type);
                              const entry = (Array.isArray(row.filterConfig) ? row.filterConfig : [])
                                .find((f) => String(f?.key || f?.field || '') === type);
                              const text = entry?.displayLabel || entry?.label || def?.name || def?.label || type;
                              return (
                                <span
                                  key={type}
                                  className="inline-flex items-center gap-1.5 rounded border border-line bg-white px-2 py-1 text-[12px]"
                                >
                                  <FilterIcon size={12} className="text-primary" />
                                  {text}
                                </span>
                              );
                            })}
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

      {/* Add Custom Filter Modal */}
      {showAddFilter && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 p-4"
          onMouseDown={() => {
            if (!filterSaving) setShowAddFilter(false);
          }}
        >
          <form
            className="w-full max-w-[460px] rounded-lg bg-white shadow-pop"
            onMouseDown={(e) => e.stopPropagation()}
            onSubmit={saveCustomFilter}
          >
            <div className="flex items-center border-b border-line px-4 py-3">
              <span className="text-[15px] font-bold">Add Custom Filter</span>
              <span className="flex-1" />
              <button
                type="button"
                aria-label="Close"
                className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e0342c] text-white"
                disabled={filterSaving}
                onClick={() => setShowAddFilter(false)}
              >
                <Icon name="x" size={12} />
              </button>
            </div>

            <div className="space-y-3 px-4 py-4">
              <div>
                <label className="f-label">
                  Filter Name <span className="text-danger">*</span>
                </label>
                <input
                  className="f-input w-full"
                  placeholder="e.g. By Material"
                  autoFocus
                  value={filterName}
                  disabled={filterSaving}
                  onChange={(e) => {
                    const val = e.target.value;
                    setFilterName(val);
                    if (!filterLabelEdited) setFilterLabel(val);
                    if (!filterKeyEdited) setFilterKey(suggestFilterKey(val));
                    if (!filterSlugEdited) setFilterSlug(suggestFilterSlug(val));
                    setFilterError('');
                  }}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="f-label">Filter Label</label>
                  <input
                    className="f-input w-full"
                    placeholder="e.g. By Material"
                    value={filterLabel}
                    disabled={filterSaving}
                    onChange={(e) => {
                      setFilterLabelEdited(true);
                      setFilterLabel(e.target.value);
                      setFilterError('');
                    }}
                  />
                </div>
                <div>
                  <label className="f-label">Filter Key</label>
                  <input
                    className="f-input w-full font-mono text-[12px]"
                    placeholder="e.g. byMaterial"
                    value={filterKey}
                    disabled={filterSaving}
                    onChange={(e) => {
                      setFilterKeyEdited(true);
                      setFilterKey(e.target.value);
                      setFilterError('');
                    }}
                  />
                </div>
              </div>

              <div>
                <label className="f-label">Sidebar Route Slug</label>
                <input
                  className="f-input w-full font-mono text-[12px]"
                  placeholder="e.g. by-material"
                  value={filterSlug}
                  disabled={filterSaving}
                  onChange={(e) => {
                    setFilterSlugEdited(true);
                    setFilterSlug(e.target.value);
                    setFilterError('');
                  }}
                />
                <div className="mt-1 text-[11px] text-inkmuted">
                  Menu page: <span className="font-mono">/admin/ecommerce/filters/{filterSlug || 'custom-filter'}</span>
                </div>
              </div>

              <div>
                <label className="f-label">Icon</label>
                <div className="flex flex-wrap gap-1.5 rounded border border-line bg-[#f8fafc] p-2">
                  {FILTER_ICON_CHOICES.map((choice) => {
                    const ChoiceIcon = choice.Icon;
                    const active = filterIcon === choice.key;
                    return (
                      <button
                        key={choice.key}
                        type="button"
                        title={choice.label}
                        aria-label={choice.label}
                        aria-pressed={active}
                        disabled={filterSaving}
                        onClick={() => setFilterIcon(choice.key)}
                        className={
                          'inline-flex h-8 w-8 items-center justify-center rounded border transition ' +
                          (active
                            ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary/30'
                            : 'border-line bg-white text-inkmuted hover:border-slate-300 hover:text-ink')
                        }
                      >
                        <ChoiceIcon size={15} />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-5 pt-1">
                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={filterActive}
                    disabled={filterSaving}
                    onChange={(e) => setFilterActive(e.target.checked)}
                  />
                  Active
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                  <input
                    type="checkbox"
                    checked={filterVisible}
                    disabled={filterSaving}
                    onChange={(e) => setFilterVisible(e.target.checked)}
                  />
                  Visible on E-commerce Store
                </label>
              </div>

              {filterError && <div className="f-err">{filterError}</div>}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  className="btn"
                  disabled={filterSaving}
                  onClick={() => setShowAddFilter(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={filterSaving}
                >
                  <Icon name="save" size={14} />
                  {filterSaving ? 'Creating...' : 'Create Filter'}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        danger
        busy={deleting}
        title="Delete Product Type"
        message={
          pendingDelete
            ? `Delete "${pendingDelete.label || pendingDelete.value}"? This will fail cleanly if any products still reference it.`
            : ''
        }
        confirmLabel="Delete"
        onCancel={() => !deleting && setPendingDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}