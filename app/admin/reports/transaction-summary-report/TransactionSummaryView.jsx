'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useOptions } from '@/components/useOptions';
import { useScope } from '@/components/ScopeContext';
import { fmt } from '@/lib/format';

const CATEGORIES = [
  { key: 'purchase', label: 'Purchase', icon: 'download' },
  { key: 'purchaseReturn', label: 'Purchase Return', icon: 'undo' },
  { key: 'netPurchase', label: 'Net Purchase', total: true, parts: ['purchase', 'purchaseReturn'] },
  { key: 'sale', label: 'Sale', icon: 'cart' },
  { key: 'saleReturn', label: 'Sale Return', icon: 'undo' },
  { key: 'netSale', label: 'Net Sale', total: true, parts: ['sale', 'saleReturn'] },
  { key: 'stockIn', label: 'Stock In', icon: 'box' },
  { key: 'stockOut', label: 'Stock Out', icon: 'box' },
  { key: 'netStockTransfer', label: 'Net Stock Transfer', total: true, parts: ['stockIn', 'stockOut'] },
];

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function makeFilters(location = '') {
  const today = localDate();
  return { fromDate: today, toDate: today, location };
}

function netFor(row, parts) {
  const [positive, negative] = parts.map((key) => row[key] || {});
  return {
    qty: (Number(positive.qty) || 0) - (Number(negative.qty) || 0),
    value: (Number(positive.value) || 0) - (Number(negative.value) || 0),
    docs: (Number(positive.docs) || 0) + (Number(negative.docs) || 0),
  };
}

function categoryData(row, category) {
  return category.total ? netFor(row, category.parts) : (row[category.key] || {});
}

function hasActivity(row) {
  return CATEGORIES.some((category) => {
    if (category.total) return false;
    const data = categoryData(row, category);
    return data.qty || data.value || data.docs;
  });
}

export default function TransactionSummaryView() {
  const router = useRouter();
  const { business, location, finYear } = useScope();
  const locationOptions = useOptions('companylocations');
  const [filters, setFilters] = useState(() => makeFilters(location));
  const [applied, setApplied] = useState(() => makeFilters(location));
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filtersVisible, setFiltersVisible] = useState(true);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');

  useEffect(() => {
    if (!detail) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setDetail(null);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [detail]);

  useEffect(() => {
    setFilters((current) => ({ ...current, location }));
    setApplied((current) => ({ ...current, location }));
  }, [location]);

  useEffect(() => {
    if (!business) {
      setRows([]);
      setError('Select a business in the top bar.');
      return undefined;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      business,
      location: applied.location || '',
      finYear: finYear || '',
      fromDate: applied.fromDate,
      toDate: applied.toDate,
    });
    setLoading(true);
    setError('');

    fetch(`/api/reports/transaction-summary-report?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not load the transaction summary.');
        return result;
      })
      .then((result) => setRows(result.rows || []))
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        setRows([]);
        setError(requestError.message || 'Could not reach the server.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [business, finYear, applied]);

  function search() {
    if (!filters.fromDate || !filters.toDate) {
      setError('Date From and Date To are required.');
      return;
    }
    setApplied({ ...filters });
  }

  function reset() {
    const blank = makeFilters(location);
    setFilters(blank);
    setApplied(blank);
    setError('');
  }

  async function openDetails(row, category) {
    if (['purchase', 'purchaseReturn', 'sale', 'saleReturn', 'stockIn', 'stockOut'].includes(category.key)) {
      const params = new URLSearchParams({
        business: business || '',
        location: row.locationId || applied.location || '',
        finYear: finYear || '',
        fromDate: applied.fromDate,
        toDate: applied.toDate,
      });
      const path = {
        purchase: 'purchase',
        purchaseReturn: 'purchase_return',
        sale: 'sale',
        saleReturn: 'sale_return',
        stockIn: 'stock_in',
        stockOut: 'stock_out',
      }[category.key];
      router.push(`/admin/reports/transaction-summary-report/${path}?${params}`);
      return;
    }

    setDetail({ locationName: row.locationName, category });
    setDetailLoading(true);
    setDetailError('');
    try {
      const params = new URLSearchParams({
        business,
        location: applied.location || '',
        finYear: finYear || '',
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        detailCategory: category.key,
        detailLocation: row.locationId || '',
      });
      const response = await fetch(`/api/reports/transaction-summary-report?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load these transactions.');
      setDetail((current) => current ? { ...current, rows: result.detailRows || [] } : current);
    } catch (requestError) {
      setDetailError(requestError.message || 'Could not load these transactions.');
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <Icon name="grid" size={18} /> Transaction Summary
        </h2>
        <p className="text-[13px] text-inkmuted">
          Purchases, sales and inter-branch transfers per location, with the documents behind each figure.
        </p>
      </div>

      {filtersVisible && (
        <div className="card">
          <div className="card-head">
            <span className="card-title"><Icon name="filter" size={15} /> Filters</span>
            <button type="button" className="ml-auto text-[13px] text-inkmuted" onClick={() => setFiltersVisible(false)}>
              Hide
            </button>
          </div>
          <div className="card-body">
            {error && <div className="flash flash-err">{error}</div>}
            <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
              <label className="block text-[13px] text-ink">
                <span className="mb-1 block">Date From</span>
                <input
                  type="date"
                  className="f-input"
                  value={filters.fromDate}
                  onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))}
                />
              </label>
              <label className="block text-[13px] text-ink">
                <span className="mb-1 block">Date To</span>
                <input
                  type="date"
                  className="f-input"
                  value={filters.toDate}
                  onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))}
                />
              </label>
              <label className="block text-[13px] text-ink">
                <span className="mb-1 block">Location</span>
                <MultiSelect
                  mode="single"
                  options={locationOptions.options}
                  value={filters.location}
                  onChange={(value) => setFilters((current) => ({ ...current, location: value }))}
                  placeholder="All Locations"
                  loading={locationOptions.loading}
                  error={locationOptions.error}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
              <span className="text-[12.5px] text-inkmuted">Dates are inclusive. Leave Location blank to read every location.</span>
              <span className="flex-1" />
              <button type="button" className="btn" onClick={reset}>
                <Icon name="refresh" size={14} /> Reset
              </button>
              <button type="button" className="btn btn-primary" onClick={search} disabled={loading}>
                {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
              </button>
            </div>
          </div>
        </div>
      )}

      {!filtersVisible && (
        <div className="mb-3 flex justify-end">
          <button type="button" className="btn" onClick={() => setFiltersVisible(true)}>
            <Icon name="filter" size={14} /> Show Filters
          </button>
        </div>
      )}

      {error && !filtersVisible && <div className="flash flash-err mb-3">{error}</div>}
      {loading && rows.length === 0 && <div className="card"><div className="card-body dt-empty"><span className="spin" /></div></div>}
      {!loading && rows.length === 0 && <div className="card"><div className="card-body dt-empty">No locations found.</div></div>}

      <div className="mt-3 space-y-3">
        {rows.map((row) => (
          <div key={row._id} className="card overflow-hidden">
            <div className="card-head">
              <span className="card-title"><Icon name="home" size={15} /> {row.locationName}</span>
              {!hasActivity(row) && <span className="pill pill-blue">No activity</span>}
            </div>
            <div className="overflow-x-auto">
              <table className="dt dt-nowrap-head">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th className="text-right">Quantity</th>
                    <th className="text-right">Value</th>
                    <th className="text-right">Docs</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map((category) => {
                    const data = categoryData(row, category);
                    return (
                      <tr key={category.key} className={category.total ? 'bg-[#f5f8fc] font-bold' : ''}>
                        <td>
                          {!category.total ? (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 text-brand-link hover:underline"
                              onClick={() => openDetails(row, category)}
                            >
                              <Icon name={category.icon} size={13} />
                              {category.label}
                            </button>
                          ) : category.label}
                        </td>
                        <td className="text-right">{fmt('amount', data.qty || 0)}</td>
                        <td className="text-right">{fmt('amount', data.value || 0)}</td>
                        <td className="text-right">{Number(data.docs) || 0}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {detail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget) setDetail(null); }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="transaction-summary-detail-title"
            className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0 flex-1">
                <h3 id="transaction-summary-detail-title" className="font-bold text-ink">
                  {detail.category.label} — {detail.locationName}
                </h3>
                <p className="text-[12.5px] text-inkmuted">{applied.fromDate} to {applied.toDate}</p>
              </div>
              <button type="button" className="btn" onClick={() => setDetail(null)} aria-label="Close details">
                <Icon name="x" size={15} /> Close
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto p-4">
              {detailError && <div className="flash flash-err mb-3">{detailError}</div>}
              {detailLoading ? (
                <div className="dt-empty"><span className="spin" /></div>
              ) : detail.rows?.length ? (
                <table className="dt dt-nowrap-head">
                  <thead>
                    <tr>
                      <th>Document No</th>
                      <th>Date</th>
                      <th className="text-right">Quantity</th>
                      <th className="text-right">Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.rows.map((transaction) => (
                      <tr key={transaction._id}>
                        <td>{transaction.number}</td>
                        <td>{fmt('date', transaction.date)}</td>
                        <td className="text-right">{fmt('amount', transaction.qty)}</td>
                        <td className="text-right">{fmt('amount', transaction.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="dt-empty">No transactions found for this category and date range.</div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
