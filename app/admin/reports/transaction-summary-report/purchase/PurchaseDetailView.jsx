'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useOptions } from '@/components/useOptions';
import { useScope } from '@/components/ScopeContext';
import { download, fmt, printTable, toXlsHtml } from '@/lib/format';

const COLUMNS = [
  { key: 'number', label: 'DOCUMENT NO' },
  { key: 'date', label: 'DATE' },
  { key: 'party', label: 'PARTY' },
  { key: 'itemName', label: 'ITEM NAME' },
  { key: 'itemCode', label: 'ITEM CODE' },
  { key: 'qty', label: 'QTY' },
  { key: 'rate', label: 'RATE' },
  { key: 'value', label: 'VALUE' },
  { key: 'imageUrl', label: 'IMAGE' },
];
const SALE_COLUMNS = [
  { key: 'number', label: 'DOCUMENT NO' },
  { key: 'date', label: 'DATE' },
  { key: 'customer', label: 'CUSTOMER' },
  { key: 'supplier', label: 'SUPPLIER' },
  { key: 'itemName', label: 'ITEM NAME' },
  { key: 'itemCode', label: 'ITEM CODE' },
  { key: 'qty', label: 'QTY' },
  { key: 'rate', label: 'RATE' },
  { key: 'value', label: 'VALUE' },
  { key: 'imageUrl', label: 'IMAGE' },
];
const STOCK_COLUMNS = [
  { key: 'number', label: 'DOCUMENT NO' },
  { key: 'date', label: 'DATE' },
  { key: 'party', label: 'PARTY' },
  { key: 'itemName', label: 'ITEM NAME' },
  { key: 'itemCode', label: 'ITEM CODE' },
  { key: 'qty', label: 'QTY' },
  { key: 'rate', label: 'RATE' },
  { key: 'value', label: 'VALUE' },
  { key: 'imageUrl', label: 'IMAGE' },
];

function localDate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function readFilters(params, globalLocation) {
  return {
    fromDate: params.get('fromDate') || localDate(),
    toDate: params.get('toDate') || localDate(),
    location: params.get('location') || globalLocation || '',
  };
}

function exportValue(row, key) {
  if (key === 'date') return fmt('date', row.date);
  if (key === 'qty' || key === 'rate' || key === 'value') return fmt('amount', row[key]);
  return row[key] || '';
}

export default function PurchaseDetailView({
  isReturn = false, isSale = false, isSaleReturn = false, isStockIn = false, isStockOut = false,
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { business: activeBusiness, location: activeLocation, finYear: activeFinYear } = useScope();
  const locationOptions = useOptions('companylocations');
  const [filters, setFilters] = useState(() => readFilters(searchParams, activeLocation));
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({ documents: 0, lines: 0, qty: 0, value: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);

  const business = searchParams.get('business') || activeBusiness || '';
  const finYear = searchParams.get('finYear') || activeFinYear || '';
  const title = isStockOut ? 'Stock Out' : isStockIn ? 'Stock In' : isSaleReturn ? 'Sale Return' : isSale ? 'Sale' : isReturn ? 'Purchase Return' : 'Purchase';
  const pluralTitle = `${title} Lines`;
  const columns = isStockIn || isStockOut ? STOCK_COLUMNS : isSale || isSaleReturn ? SALE_COLUMNS : COLUMNS;
  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns.includes(column.key)),
    [columns, hiddenColumns]
  );

  const load = useCallback(async (nextFilters) => {
    if (!business) {
      setRows([]);
      setTotals({ documents: 0, lines: 0, qty: 0, value: 0 });
      setError('Select a business in the top bar.');
      return;
    }
    if (!nextFilters.fromDate || !nextFilters.toDate) {
      setError('Date From and Date To are required.');
      return;
    }

    const params = new URLSearchParams({
      business,
      location: nextFilters.location || '',
      finYear,
      fromDate: nextFilters.fromDate,
      toDate: nextFilters.toDate,
    });
    setLoading(true);
    setError('');
    try {
      const endpoint = isStockOut ? 'stock-out' : isStockIn ? 'stock-in' : isSaleReturn ? 'sale-return' : isSale ? 'sale' : isReturn ? 'purchase-return' : 'purchase';
      const response = await fetch(`/api/reports/transaction-summary-report/${endpoint}?${params}`, {
        cache: 'no-store',
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Could not load ${title.toLowerCase()} lines.`);
      setRows(result.rows || []);
      setTotals(result.totals || { documents: 0, lines: 0, qty: 0, value: 0 });
      setPage(1);
    } catch (requestError) {
      setRows([]);
      setTotals({ documents: 0, lines: 0, qty: 0, value: 0 });
      setError(requestError.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [business, finYear, isReturn, isSale, isSaleReturn, isStockIn, isStockOut, title]);

  useEffect(() => {
    load(readFilters(searchParams, activeLocation));
  }, [load, searchParams, activeLocation]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [
      row.number, row.party, row.customer, row.supplier, row.itemName, row.itemCode,
    ].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [rows, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / perPage));
  const pageRows = filteredRows.slice((page - 1) * perPage, page * perPage);
  const start = filteredRows.length ? (page - 1) * perPage + 1 : 0;
  const end = Math.min(page * perPage, filteredRows.length);

  function applyFilters() {
    if (!filters.fromDate || !filters.toDate) {
      setError('Date From and Date To are required.');
      return;
    }
    load(filters);
  }

  function resetFilters() {
    const reset = readFilters(new URLSearchParams(), activeLocation);
    setFilters(reset);
    load(reset);
  }

  function rowValues(row) {
    return visibleColumns.map((column) => exportValue(row, column.key));
  }

  function exportRows() {
    const headers = visibleColumns.map((column) => column.label);
    const data = filteredRows.map((row) => rowValues(row));
    download(
      `${isStockOut ? 'stock-out' : isStockIn ? 'stock-in' : isSaleReturn ? 'sale-return' : isSale ? 'sale' : isReturn ? 'purchase-return' : 'purchase'}-lines.xls`,
      toXlsHtml(pluralTitle, headers, data, visibleColumns.flatMap((column, index) =>
        ['qty', 'rate', 'value'].includes(column.key) ? [index] : []
      )),
      'application/vnd.ms-excel'
    );
  }

  function printRows() {
    printTable(pluralTitle, visibleColumns.map((column) => column.label),
      filteredRows.map((row) => rowValues(row)));
  }

  function backToSummary() {
    router.push('/admin/reports/transaction-summary-report');
  }

  return (
    <>
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
            <Icon name={isStockOut ? 'upload' : isStockIn ? 'download' : isSale || isSaleReturn ? 'cart' : isReturn ? 'upload' : 'download'} size={18} /> {title} Detail
          </h2>
          <p className="text-[13px] text-inkmuted">
            Line-level documents behind the summary figure. Click an item code to open its Barcode Report in a new tab.
          </p>
        </div>
        <button type="button" className="btn" onClick={backToSummary}>
          <Icon name="back" size={14} /> Back to Summary
        </button>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="filter" size={15} /> Filters</span>
          <button type="button" className="ml-auto text-[13px] text-inkmuted" onClick={() => setFiltersVisible((visible) => !visible)}>
            {filtersVisible ? '⌃ Hide' : '⌄ Show'}
          </button>
        </div>
        {filtersVisible && (
          <div className="card-body">
            {error && <div className="flash flash-err mb-3">{error}</div>}
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
              <span className="text-[12.5px] text-inkmuted">Filters apply as you change them.</span>
              <span className="flex-1" />
              <button type="button" className="btn" onClick={resetFilters} disabled={loading}>
                <Icon name="refresh" size={14} /> Reset
              </button>
              <button type="button" className="btn btn-primary" onClick={applyFilters} disabled={loading}>
                {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Refresh
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: 'TOTAL DOCUMENTS', value: fmt('amount', totals.documents), icon: 'file' },
          { label: 'TOTAL LINES', value: Number(totals.lines || 0).toLocaleString(), icon: 'grid' },
          { label: 'TOTAL QTY', value: fmt('amount', totals.qty), icon: 'box' },
          { label: 'TOTAL VALUE', value: fmt('amount', totals.value), icon: 'cash' },
        ].map((stat) => (
          <div key={stat.label} className="card flex items-center gap-3 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e7efff] text-brand">
              <Icon name={stat.icon} size={17} />
            </span>
            <div>
              <div className="text-[11px] font-medium text-inkmuted">{stat.label}</div>
              <div className="text-[15px] font-bold text-ink">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card mt-3 overflow-hidden">
        <div className="card-head">
          <span className="card-title"><Icon name="grid" size={15} /> {pluralTitle}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#f7f9fc] px-3 py-2.5">
          <select
            className="f-input !w-auto"
            value={perPage}
            onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}
            aria-label="Rows per page"
          >
            {[15, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
          </select>
          <div className="relative">
            <button type="button" className="btn" onClick={() => setColumnsOpen((open) => !open)}>
              <Icon name="cols" size={14} /> Columns
            </button>
            {columnsOpen && (
              <div className="absolute left-0 top-full z-20 mt-1 min-w-44 rounded border border-line bg-white p-2 shadow-lg">
                {columns.map((column) => (
                  <label key={column.key} className="flex items-center gap-2 px-2 py-1 text-[12px] text-ink">
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.includes(column.key)}
                      onChange={() => setHiddenColumns((current) => current.includes(column.key)
                        ? current.filter((key) => key !== column.key)
                        : [...current, column.key])}
                    />
                    {column.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button type="button" className="btn" onClick={exportRows} disabled={!filteredRows.length}>
            <Icon name="file" size={14} /> Export to Excel
          </button>
          <button type="button" className="btn" onClick={printRows} disabled={!filteredRows.length}>
            <Icon name="printer" size={14} /> Print
          </button>
          <span className="flex-1" />
          <label className="relative min-w-[220px] flex-1 sm:max-w-[320px]">
            <Icon name="search" size={14} className="absolute left-2.5 top-2.5 text-inkmuted" />
            <input
              type="search"
              className="f-input !pl-8"
              placeholder="Search document, supplier or item"
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            />
          </label>
          <button type="button" className="btn" aria-label="Refresh" onClick={applyFilters} disabled={loading}>
            <Icon name="refresh" size={14} />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="dt dt-nowrap-head">
            <thead>
              <tr>
                {visibleColumns.map((column) => <th key={column.key}>{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={Math.max(visibleColumns.length, 1)} className="dt-empty"><span className="spin" /></td></tr>
              )}
              {!loading && pageRows.map((row) => (
                <tr key={row._id}>
                  {visibleColumns.map((column) => (
                    <td key={column.key} className={['qty', 'rate', 'value'].includes(column.key) ? 'text-right' : ''}>
                      {column.key === 'itemCode' && row.itemCode ? (
                        <a
                          className="text-brand-link hover:underline"
                          href={`/admin/reports/barcode-report?itemCode=${encodeURIComponent(row.itemCode)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {row.itemCode}
                        </a>
                      ) : column.key === 'imageUrl' ? (
                        row.imageUrl
                          ? <img src={row.imageUrl} alt={row.itemName || 'Item'} className="mx-auto h-9 w-9 rounded object-cover" />
                          : <span className="text-inkmuted">-</span>
                      ) : column.key === 'date' ? fmt('date', row.date)
                        : ['qty', 'rate', 'value'].includes(column.key) ? fmt('amount', row[column.key])
                          : row[column.key] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
              {!loading && pageRows.length === 0 && (
                <tr>
                  <td colSpan={Math.max(visibleColumns.length, 1)} className="dt-empty">
                    <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-[#f1f4f9] text-inkmuted">
                      <Icon name="bag" size={19} />
                    </div>
                    <div className="font-medium text-ink">No records found</div>
                    <div className="mt-1 text-[12px] text-inkmuted">
                      No {title.toLowerCase()} documents found for the selected period and location.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#f7f9fc] px-3 py-2.5 text-[12px] text-inkmuted">
          <span>Showing {start}-{end} of {filteredRows.length}</span>
          <div className="flex items-center gap-2">
            <button type="button" className="btn !px-2.5 !py-1" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
              Previous
            </button>
            <span>Page {page} of {pageCount}</span>
            <button type="button" className="btn !px-2.5 !py-1" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount}>
              Next
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
