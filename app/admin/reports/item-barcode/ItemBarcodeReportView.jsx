'use client';

import { useEffect, useState } from 'react';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useOptions } from '@/components/useOptions';
import { useScope } from '@/components/ScopeContext';

const EMPTY_FILTERS = {
  location: '',
  itemId: '',
  grcNo: '',
  billNo: '',
  supplierId: '',
};

function Field({ label, children }) {
  return (
    <label className="block min-w-0 text-[12px] text-[#26364b]">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(2) : '0.00';
}

function ItemImageCell({ row }) {
  const sources = [...new Set(
    [row.imageUrl, row.itemImageUrl, row.legacyImageUrl].filter(Boolean)
  )];
  const sourceKey = [row._id, ...sources].join('|');
  const [failed, setFailed] = useState({ key: '', count: 0 });
  const failedCount = failed.key === sourceKey ? failed.count : 0;

  const source = sources[failedCount];
  if (!source) return '-';

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt={row.itemName || row.itemCode || 'Item'}
      className="h-10 w-10 rounded object-cover"
      loading="lazy"
      onError={() => setFailed((current) => ({
        key: sourceKey,
        count: (current.key === sourceKey ? current.count : 0) + 1,
      }))}
    />
  );
}

export default function ItemBarcodeReportView() {
  const { business, location, finYear, isLocationLocked } = useScope();
  const [draft, setDraft] = useState(EMPTY_FILTERS);
  const [applied, setApplied] = useState(null);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const locations = useOptions('companylocations', '', Boolean(business));
  const items = useOptions('item', '', Boolean(business));
  const suppliers = useOptions('supplier', '', Boolean(business));

  useEffect(() => {
    if (!applied || !business) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({
      reportType: 'item-barcode',
      business,
      location: (isLocationLocked ? location : applied.location) || '',
      finYear: finYear || '',
      page: String(page),
      perPage: '15',
      itemId: applied.itemId,
      grcNo: applied.grcNo,
      billNo: applied.billNo,
      supplierId: applied.supplierId,
    });

    setLoading(true);
    setError('');
    fetch(`/api/reports/barcode-report?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load item barcodes.');
        return data;
      })
      .then(setResult)
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        setResult(null);
        setError(requestError.message || 'Could not reach the server.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [applied, business, finYear, page]);

  function setFilter(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function search(event) {
    event.preventDefault();
    if (!business) {
      setError('Select a business in the top bar.');
      return;
    }
    setError('');
    setPage(1);
    setApplied({ ...draft });
  }

  const rows = result?.sections?.[0]?.rows || [];
  const total = Number(result?.total) || 0;
  const pages = Math.max(1, Number(result?.pages) || 1);
  const first = total ? (page - 1) * 15 + 1 : 0;
  const last = Math.min(page * 15, total);

  return (
    <>
      <section className="card">
        <header className="card-head">
          <span className="card-title">Item Barcode Report</span>
        </header>
        <form className="card-body" onSubmit={search}>
          {error && <div className="flash flash-err mb-3">{error}</div>}
          <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Business Location">
              <MultiSelect
                mode="single"
                options={locations.options}
                loading={locations.loading}
                error={locations.error}
                disabled={isLocationLocked}
                value={isLocationLocked ? (location || locations.options[0]?.value || '') : draft.location}
                placeholder={isLocationLocked ? (locations.options[0]?.label || 'Assigned Location') : 'All Locations'}
                onChange={(value) => { if (!isLocationLocked) setFilter('location', value); }}
              />
            </Field>
            <Field label="Items">
              <MultiSelect
                mode="single"
                options={items.options}
                loading={items.loading}
                error={items.error}
                value={draft.itemId}
                placeholder="Select..."
                onChange={(value) => setFilter('itemId', value)}
              />
            </Field>
            <Field label="GRC Number">
              <input
                className="f-input"
                value={draft.grcNo}
                placeholder="Enter GRC Number"
                onChange={(event) => setFilter('grcNo', event.target.value)}
              />
            </Field>
            <Field label="Bill No.">
              <input
                className="f-input"
                value={draft.billNo}
                placeholder="Enter Bill No"
                onChange={(event) => setFilter('billNo', event.target.value)}
              />
            </Field>
            <Field label="Supplier">
              <MultiSelect
                mode="single"
                options={suppliers.options}
                loading={suppliers.loading}
                error={suppliers.error}
                value={draft.supplierId}
                placeholder="Select Supplier"
                onChange={(value) => setFilter('supplierId', value)}
              />
            </Field>
          </div>
          <div className="mt-4">
            <button type="submit" className="btn btn-primary min-w-[155px]" disabled={loading || !business}>
              {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
            </button>
          </div>
        </form>
      </section>

      {applied && (
        <section className="card mt-4">
          <header className="card-head">
            <span className="card-title">Barcodes</span>
            <span className="pill pill-blue">{total} records</span>
          </header>
          <div className="card-body">
            <div className="overflow-x-auto">
              <table className="dt dt-nowrap-head">
                <thead>
                  <tr>
                    <th>Image</th>
                    <th>Barcode</th>
                    <th>Item</th>
                    <th>GRC Number</th>
                    <th>Bill No.</th>
                    <th>Supplier</th>
                    <th className="text-right">Qty</th>
                    <th className="text-right">Purchase Rate</th>
                    <th className="text-right">RSP</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={9} className="dt-empty"><span className="spin" /></td></tr>
                  ) : rows.length ? rows.map((row) => (
                    <tr key={row._id}>
                      <td>
                        <ItemImageCell row={row} />
                      </td>
                      <td>{row.barcodeNo || row.barcodeGenerated || '-'}</td>
                      <td>{row.itemName || row.itemCode || '-'}</td>
                      <td>{row.grcNo || '-'}</td>
                      <td>{row.billNo || '-'}</td>
                      <td>{row.supplier || '-'}</td>
                      <td className="text-right">{row.qty || '-'}</td>
                      <td className="text-right">{amount(row.purRate)}</td>
                      <td className="text-right">{amount(row.retailPrice)}</td>
                    </tr>
                  )) : (
                    <tr><td colSpan={9} className="dt-empty">No item barcodes match these filters.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
              <span>Showing {first}–{last} of {total}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  Previous
                </button>
                <span>Page {page} of {pages}</span>
                <button
                  type="button"
                  className="btn"
                  disabled={page >= pages || loading}
                  onClick={() => setPage((current) => Math.min(pages, current + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </>
  );
}
