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
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);

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
        '/api/v1/admin/product-types?business=' +
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
    setEditName(row.label || '');
    setEditFilters(
      Array.isArray(row.filters)
        ? row.filters.filter((filter) =>
          Object.prototype.hasOwnProperty.call(FILTER_TYPES, filter))
        : []
    );
    setEditError('');
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
          filters: editFilters,
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
   * Delete Product Type.
   */
  async function remove(row) {
    if (
      !window.confirm(
        'Delete Product Type "' + row.label + '"?'
      )
    ) {
      return;
    }

    setError('');
    setFlash('');

    try {
      const q = new URLSearchParams({
        business,
        value: row.value,
      });

      const r = await fetch(
        '/api/v1/admin/product-types?' + q.toString(),
        { method: 'DELETE' }
      );

      const d = await r.json().catch(() => ({}));

      if (!r.ok) {
        throw new Error(d.error || 'Could not delete it.');
      }

      setFlash('"' + row.label + '" deleted.');

      await load();
    } catch (err) {
      setError(err.message || 'Could not delete it.');
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
            className="w-full max-w-[480px] rounded-lg bg-white shadow-pop"
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

              <div className="mt-4">
                <div className="f-label">Applicable filters</div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {Object.entries(FILTER_TYPES).map(([type, label]) => (
                    <label
                      key={type}
                      className="flex cursor-pointer items-center gap-2 rounded border border-line px-3 py-2 text-[13px]"
                    >
                      <input
                        type="checkbox"
                        checked={editFilters.includes(type)}
                        disabled={editSaving}
                        onChange={(e) => {
                          setEditFilters((current) => e.target.checked
                            ? [...current, type]
                            : current.filter((filter) => filter !== type));
                        }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
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
                <th style={{ minWidth: 180 }}>Product Type</th>
                <th style={{ minWidth: 280 }}>Filters</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr>
                  <td
                    colSpan={4}
                    className="text-center text-inkmuted"
                  >
                    Loading...
                  </td>
                </tr>
              )}

              {!loading && !shown.length && (
                <tr>
                  <td
                    colSpan={4}
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
                            title="Delete"
                            aria-label={'Delete ' + row.label}
                            className="flex h-7 w-7 items-center justify-center rounded bg-danger text-white"
                            onClick={() => remove(row)}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </div>
                      </td>

                      {/* Serial Number */}
                      <td>{i + 1}</td>

                      {/* Product Type */}
                      <td>{row.label}</td>

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
                                {FILTER_TYPES[type]}
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