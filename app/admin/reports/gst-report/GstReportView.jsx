  'use client';
  import { useCallback, useEffect, useMemo, useState } from 'react';
  import Icon from '@/components/Icon';
  import MultiSelect from '@/components/MultiSelect';
  import { useOptions } from '@/components/useOptions';
  import { useScope } from '@/components/ScopeContext';
  import { download, fmt, toXlsHtml } from '@/lib/format';

  const TYPES = [
    { key: 'POS B2B', label: 'POS B2B', group: 'POS' },
    { key: 'POS B2C', label: 'POS B2C', group: 'POS' },
    { key: 'POSR B2B', label: 'POSR B2B', group: 'POSR' },
    { key: 'POSR B2C', label: 'POSR B2C', group: 'POSR' },
    { key: 'SI B2B', label: 'SI B2B', group: 'SI B2B' },
    { key: 'SR B2B', label: 'SR B2B', group: 'SR B2B' },
    { key: 'ICSI B2B', label: 'ICSI B2B', group: 'ICSI' },
    { key: 'ICSI B2C', label: 'ICSI B2C', group: 'ICSI' },
    { key: 'ICSR B2B', label: 'ICSR B2B', group: 'ICSR' },
    { key: 'ICSR B2C', label: 'ICSR B2C', group: 'ICSR' },
    { key: 'Purchase', label: 'Purchase', group: 'Purchase' },
    { key: 'Purchase Return', label: 'Purchase Return', group: 'Purchase Return' },
  ];

  const TABS = ['All', 'POS', 'POSR', 'SI B2B', 'SR B2B', 'ICSI', 'ICSR'];

  const COLUMNS = [
    { key: 'type', label: 'TYPE' },
    { key: 'invoiceDate', label: 'INVDATE', format: 'date' },
    { key: 'customerName', label: 'CUSTNAME' },
    { key: 'gstn', label: 'GSTN' },
    { key: 'invoiceNo', label: 'INVNO' },
    { key: 'return', label: 'RETURN' },
    { key: 'branch', label: 'BRANCH' },
    { key: 'itemName', label: 'ITEM NAME' },
    { key: 'itemCode', label: 'ITEM CODE' },
    { key: 'itemNameNew', label: 'ITEMNAMENEW' },
    { key: 'qty', label: 'QTY', numeric: true },
    { key: 'taxRate', label: 'TAX RATE', numeric: true },
    { key: 'rate', label: 'RATE', numeric: true },
    { key: 'basicAmount', label: 'BASICAMOUNT', numeric: true },
    { key: 'taxableAmount', label: 'TAXABLE AMOUNT', numeric: true },
    { key: 'igstPercent', label: 'IGSTPER', numeric: true },
    { key: 'igstAmount', label: 'IGSTAMT', numeric: true },
    { key: 'cgstPercent', label: 'CGSTPER', numeric: true },
    { key: 'cgstAmount', label: 'CGSTAMT', numeric: true },
    { key: 'sgstPercent', label: 'SGSTPER', numeric: true },
    { key: 'sgstAmount', label: 'SGSTAMT', numeric: true },
    { key: 'subTotal', label: 'SUB TOTAL (NET SALES)', numeric: true },
    { key: 'uom', label: 'UOM' },
    { key: 'net', label: 'NET', numeric: true },
    { key: 'roundOff', label: 'ROUNDOFF', numeric: true },
  ];

  const DEFAULT_TYPES = TYPES.slice(0, 10).map((type) => type.key);

  function dateInput(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  function defaultFilters(location = '') {
    const to = new Date();
    const from = new Date(to);
    from.setMonth(from.getMonth() - 1);
    return { fromDate: dateInput(from), toDate: dateInput(to), location };
  }

  function amount(value) {
    return Number(value || 0).toFixed(2);
  }

  export default function GstReportView() {
    const { business, location, finYear } = useScope();
    const locationOptions = useOptions('companylocations');
    const [filters, setFilters] = useState(() => defaultFilters(location));
    const [applied, setApplied] = useState(() => defaultFilters(location));
    const [selectedTypes, setSelectedTypes] = useState(DEFAULT_TYPES);
    const [appliedTypes, setAppliedTypes] = useState(DEFAULT_TYPES);
    const [tab, setTab] = useState('All');
    const [rows, setRows] = useState([]);
    const [totals, setTotals] = useState({});
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [filtersVisible, setFiltersVisible] = useState(true);
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [page, setPage] = useState(1);
    const [perPage, setPerPage] = useState(15);
    const [hiddenColumns, setHiddenColumns] = useState([]);
    const [columnsOpen, setColumnsOpen] = useState(false);

    const visibleColumns = useMemo(
      () => COLUMNS.filter((column) => !hiddenColumns.includes(column.key)),
      [hiddenColumns]
    );
    const pageCount = Math.max(1, Math.ceil(count / perPage));
    const pageTotals = useMemo(() => COLUMNS.reduce((sum, column) => {
      if (column.numeric) sum[column.key] = rows.reduce((total, row) => total + (Number(row[column.key]) || 0), 0);
      return sum;
    }, {}), [rows]);

    useEffect(() => {
      const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250);
      return () => clearTimeout(timer);
    }, [search]);

    useEffect(() => {
      setFilters((current) => ({ ...current, location }));
      setApplied((current) => ({ ...current, location }));
    }, [location]);

    const load = useCallback(async () => {
      if (!business) {
        setRows([]);
        setCount(0);
        setError('Select a business in the top bar.');
        return;
      }
      if (!applied.fromDate || !applied.toDate) {
        setError('Date From and Date To are required.');
        return;
      }
      if (!appliedTypes.length) {
        setRows([]);
        setCount(0);
        setTotals({});
        setError('Select at least one report type.');
        return;
      }

      const params = new URLSearchParams({
        business,
        location: applied.location || '',
        finYear: finYear || '',
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        types: appliedTypes.join(','),
        tab,
        search: debouncedSearch,
        page: String(page),
        perPage: String(perPage),
      });
      setLoading(true);
      setError('');
      try {
        const response = await fetch(`/api/reports/gst-report?${params}`, { cache: 'no-store' });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not load the GST report.');
        setRows(result.rows || []);
        setTotals(result.totals || {});
        setCount(Number(result.total) || 0);
      } catch (requestError) {
        setRows([]);
        setTotals({});
        setCount(0);
        setError(requestError.message || 'Could not reach the server.');
      } finally {
        setLoading(false);
      }
    }, [business, applied, appliedTypes, tab, debouncedSearch, page, perPage]);

    useEffect(() => { load(); }, [load]);

    function searchReport() {
      if (!filters.fromDate || !filters.toDate) {
        setError('Date From and Date To are required.');
        return;
      }
      if (!selectedTypes.length) {
        setError('Select at least one report type.');
        return;
      }
      setApplied({ ...filters });
      setAppliedTypes([...selectedTypes]);
      setPage(1);
    }

    function reset() {
      const next = defaultFilters(location);
      setFilters(next);
      setApplied(next);
      setSelectedTypes(DEFAULT_TYPES);
      setAppliedTypes(DEFAULT_TYPES);
      setTab('All');
      setSearch('');
      setPage(1);
      setError('');
    }

    function toggleType(type) {
      setSelectedTypes((current) => current.includes(type)
        ? current.filter((value) => value !== type)
        : [...current, type]);
    }

    function toggleAllTypes() {
      setSelectedTypes((current) => current.length === TYPES.length ? [] : TYPES.map((type) => type.key));
    }

    function exportExcel() {
      const params = new URLSearchParams({
        business: business || '',
        location: applied.location || '',
        finYear: finYear || '',
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        types: appliedTypes.join(','),
        tab,
        search: debouncedSearch,
        export: '1',
      });
      fetch(`/api/reports/gst-report?${params}`, { cache: 'no-store' })
        .then(async (response) => {
          const result = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(result.error || 'Could not export the GST report.');
          return result;
        })
        .then((result) => {
          const headers = visibleColumns.map((column) => column.label);
          const data = (result.rows || []).map((row) => visibleColumns.map((column) =>
            column.format ? fmt(column.format, row[column.key])
              : column.numeric ? amount(row[column.key])
                : row[column.key] ?? ''
          ));
          download('gst-report.xls', toXlsHtml('GST Report', headers, data,
            visibleColumns.flatMap((column, index) => column.numeric ? [index] : [])),
          'application/vnd.ms-excel');
        })
        .catch((exportError) => setError(exportError.message || 'Could not export the GST report.'));
    }

    return (
      <>
        <div className="mb-3">
          <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
            <Icon name="file" size={18} /> GST Report
          </h2>
          <p className="text-[13px] text-inkmuted">Line-wise taxable value and the IGST / CGST / SGST split for the selected report types.</p>
        </div>

        <div className="card">
          <div className="card-head">
            <span className="card-title"><Icon name="filter" size={15} /> Report Filters</span>
            <button type="button" className="ml-auto text-[13px] text-inkmuted" onClick={() => setFiltersVisible((shown) => !shown)}>
              {filtersVisible ? '⌃ Hide' : '⌄ Show'}
            </button>
          </div>
          {filtersVisible && (
            <div className="card-body">
              {error && <div className="flash flash-err mb-3">{error}</div>}
              <div className="mb-4">
                <span className="mb-2 block text-[12px] text-inkmuted">Report Type</span>
                <div className="flex flex-wrap gap-x-3 gap-y-2">
                  <label className="flex items-center gap-1.5 text-[12px] text-ink">
                    <input type="checkbox" checked={selectedTypes.length === TYPES.length} onChange={toggleAllTypes} />
                    All
                  </label>
                  {TYPES.map((type) => (
                    <label key={type.key} className="flex items-center gap-1.5 text-[12px] text-ink">
                      <input type="checkbox" checked={selectedTypes.includes(type.key)} onChange={() => toggleType(type.key)} />
                      {type.label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-3">
                <label className="block text-[13px] text-ink">
                  <span className="mb-1 block">Business Location</span>
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
                <label className="block text-[13px] text-ink">
                  <span className="mb-1 block">Date From <span className="text-danger">*</span></span>
                  <input type="date" className="f-input" value={filters.fromDate}
                    onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} />
                </label>
                <label className="block text-[13px] text-ink">
                  <span className="mb-1 block">Date To <span className="text-danger">*</span></span>
                  <input type="date" className="f-input" value={filters.toDate}
                    onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3">
                <span className="flex-1" />
                <button type="button" className="btn" onClick={reset} disabled={loading}>
                  <Icon name="refresh" size={14} /> Reset
                </button>
                <button type="button" className="btn btn-primary" onClick={searchReport} disabled={loading}>
                  {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1.5">
          {TABS.map((entry) => (
            <button key={entry} type="button"
              className={`rounded-md px-3 py-1.5 text-[12px] ${tab === entry ? 'bg-brand text-white' : 'text-inkmuted hover:bg-[#f1f4f9]'}`}
              onClick={() => { setTab(entry); setPage(1); }}>
              {entry}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { key: 'invoices', label: 'INVOICES', icon: 'file' },
            { key: 'lines', label: 'LINES', icon: 'grid' },
            { key: 'taxableAmount', label: 'TAXABLE AMOUNT', icon: 'ledger' },
            { key: 'igstAmount', label: 'IGST', icon: 'cash' },
            { key: 'cgstAmount', label: 'CGST', icon: 'cash' },
            { key: 'sgstAmount', label: 'SGST', icon: 'cash' },
            { key: 'subTotal', label: 'NET SALES', icon: 'register' },
            { key: 'net', label: 'NET', icon: 'card' },
            { key: 'roundOff', label: 'ROUND OFF', icon: 'calculator' },
          ].map((stat) => (
            <div key={stat.key} className="card flex items-center gap-3 px-3 py-2.5">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e7efff] text-brand">
                <Icon name={stat.icon} size={16} />
              </span>
              <div className="min-w-0">
                <div className="text-[11px] font-medium text-inkmuted">{stat.label}</div>
                <div className="truncate text-[15px] font-bold text-ink">
                  {stat.key === 'invoices' || stat.key === 'lines'
                    ? Number(totals[stat.key] || 0).toLocaleString()
                    : amount(totals[stat.key])}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card mt-3 overflow-hidden">
          <div className="card-head">
            <span className="card-title"><Icon name="grid" size={15} /> GST Report</span>
            <span className="pill pill-blue">{count} records</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#f7f9fc] px-3 py-2.5">
            <select className="f-input !w-auto" value={perPage}
              onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }} aria-label="Rows per page">
              {[15, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
            </select>
            <div className="relative">
              <button type="button" className="btn" onClick={() => setColumnsOpen((open) => !open)}>
                <Icon name="cols" size={14} /> Columns
              </button>
              {columnsOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-80 min-w-48 overflow-auto rounded border border-line bg-white p-2 shadow-lg">
                  {COLUMNS.map((column) => (
                    <label key={column.key} className="flex items-center gap-2 px-2 py-1 text-[12px] text-ink">
                      <input type="checkbox" checked={!hiddenColumns.includes(column.key)}
                        onChange={() => setHiddenColumns((current) => current.includes(column.key)
                          ? current.filter((key) => key !== column.key) : [...current, column.key])} />
                      {column.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn" onClick={exportExcel} disabled={!count || loading}>
              <Icon name="file" size={14} /> Export to Excel
            </button>
            <span className="flex-1" />
            <label className="relative min-w-[180px] flex-1 sm:max-w-[320px]">
              <Icon name="search" size={14} className="absolute left-2.5 top-2.5 text-inkmuted" />
              <input type="search" className="f-input !pl-8" placeholder="Search"
                value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
            </label>
            <button type="button" className="btn" aria-label="Refresh" onClick={load} disabled={loading}>
              <Icon name="refresh" size={14} />
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="dt dt-nowrap-head">
              <thead>
                <tr>{visibleColumns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={Math.max(visibleColumns.length, 1)} className="dt-empty"><span className="spin" /></td></tr>}
                {!loading && rows.map((row) => (
                  <tr key={row._id}>
                    {visibleColumns.map((column) => (
                      <td key={column.key} className={column.numeric ? 'text-right' : ''}>
                        {column.format ? fmt(column.format, row[column.key])
                          : column.numeric ? amount(row[column.key])
                            : row[column.key] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr><td colSpan={Math.max(visibleColumns.length, 1)} className="dt-empty">No GST records found for the selected filters.</td></tr>
                )}
              </tbody>
              {!loading && rows.length > 0 && (
                <tfoot>
                  <tr>
                    {visibleColumns.map((column, index) => (
                      <td key={column.key} className={`font-bold ${column.numeric ? 'text-right' : ''}`}>
                        {index === 0 ? 'Page Total' : column.numeric ? amount(pageTotals[column.key]) : ''}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#f7f9fc] px-3 py-2.5 text-[12px] text-inkmuted">
            <span>Showing {count ? (page - 1) * perPage + 1 : 0}–{Math.min(page * perPage, count)} of {count}</span>
            <div className="flex items-center gap-1.5">
              <button type="button" className="btn !px-2.5 !py-1" disabled={page <= 1 || loading}
                onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
              <span className="px-2">{page} / {pageCount}</span>
              <button type="button" className="btn !px-2.5 !py-1" disabled={page >= pageCount || loading}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
            </div>
          </div>
        </div>
      </>
    );
  }
