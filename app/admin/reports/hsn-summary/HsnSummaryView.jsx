'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useOptions } from '@/components/useOptions';
import { useScope } from '@/components/ScopeContext';
import { download, toXlsHtml } from '@/lib/format';

const TYPES = [
  { key: 'POS', label: 'POS' },
  { key: 'SI', label: 'SI' },
];
const REPORT_TYPES = {
  POS: ['POS B2B', 'POS B2C', 'POSR B2B', 'POSR B2C'],
  SI: ['SI B2B', 'SR B2B', 'ICSI B2B', 'ICSI B2C', 'ICSR B2B', 'ICSR B2C'],
};
const COLUMNS = [
  { key: 'type', label: 'TYPE' },
  { key: 'hsn', label: 'HSN' },
  { key: 'uom', label: 'UOM' },
  { key: 'taxRate', label: 'TAX RATE %', numeric: true, total: false },
  { key: 'qty', label: 'QTY', numeric: true },
  { key: 'subTotal', label: 'SUB TOTAL (NET SALES)', numeric: true },
  { key: 'taxableAmount', label: 'TAXABLE AMOUNT', numeric: true },
  { key: 'igstAmount', label: 'IGST', numeric: true },
  { key: 'cgstAmount', label: 'CGST', numeric: true },
  { key: 'sgstAmount', label: 'SGST', numeric: true },
];

function dateInput(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function defaultFilters(location = '') {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 1);
  return { fromDate: dateInput(from), toDate: dateInput(to), location, hsnCodes: [] };
}

function amount(value) {
  return Number(value || 0).toFixed(2);
}

function summarize(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const hsn = String(row.hsn || '').trim() || 'Unspecified';
    const type = row.gstn ? 'B2B' : 'B2C';
    const uom = String(row.uom || '').trim();
    const taxRate = Number(row.taxRate) || 0;
    const key = `${type}\u0000${hsn}\u0000${uom}\u0000${taxRate}`;
    if (!groups.has(key)) {
      groups.set(key, {
        type,
        hsn,
        uom,
        taxRate,
        qty: 0,
        taxableAmount: 0,
        igstAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
        subTotal: 0,
      });
    }
    const group = groups.get(key);
    const sign = row.return === 'Yes' ? -1 : 1;
    ['qty', 'taxableAmount', 'igstAmount', 'cgstAmount', 'sgstAmount', 'subTotal']
      .forEach((field) => { group[field] += (Number(row[field]) || 0) * sign; });
  });
  return [...groups.values()]
    .map((row) => ({
      ...row,
    }))
    .sort((a, b) => a.type.localeCompare(b.type)
      || a.hsn.localeCompare(b.hsn, undefined, { numeric: true })
      || a.uom.localeCompare(b.uom)
      || a.taxRate - b.taxRate);
}

export default function HsnSummaryView() {
  const { business, finYear } = useScope();
  const locationOptions = useOptions('companylocations');
  const hsnMasterOptions = useOptions('hsn');
  const hsnCodeOptions = useMemo(() => hsnMasterOptions.options.map((option) => ({
    value: option.label,
    label: option.label,
  })), [hsnMasterOptions.options]);
  const [filters, setFilters] = useState(() => defaultFilters());
  const [applied, setApplied] = useState(() => defaultFilters());
  const [selectedTypes, setSelectedTypes] = useState(['POS', 'SI']);
  const [appliedTypes, setAppliedTypes] = useState(['POS', 'SI']);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(true);
  const visibleColumns = useMemo(
    () => COLUMNS.filter((column) => !hiddenColumns.includes(column.key)),
    [hiddenColumns]
  );
  const groupedRows = useMemo(() => {
    const codes = applied.hsnCodes.map((code) => code.trim().toLowerCase()).filter(Boolean);
    const filtered = codes.length
      ? rows.filter((row) => codes.includes(String(row.hsn || '').trim().toLowerCase()))
      : rows;
    const summarized = summarize(filtered);
    const existingCodes = new Set(summarized.map((row) => row.hsn.trim().toLowerCase()));
    const masterCodes = hsnMasterOptions.options
      .map((option) => String(option.code || option.label || '').trim())
      .filter((code) => code && code.toLowerCase() !== '(untitled)')
      .filter((code) => !codes.length || codes.includes(code.toLowerCase()));
    const emptyRows = masterCodes
      .filter((code) => !existingCodes.has(code.toLowerCase()))
      .map((hsn) => ({
        type: '—',
        hsn,
        uom: '—',
        taxRate: 0,
        qty: 0,
        subTotal: 0,
        taxableAmount: 0,
        igstAmount: 0,
        cgstAmount: 0,
        sgstAmount: 0,
      }));
    return [...summarized, ...emptyRows].sort((a, b) =>
      a.hsn.localeCompare(b.hsn, undefined, { numeric: true })
      || a.type.localeCompare(b.type)
      || a.uom.localeCompare(b.uom)
      || a.taxRate - b.taxRate
    );
  }, [rows, applied.hsnCodes, hsnMasterOptions.options]);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? groupedRows.filter((row) => COLUMNS.some((column) =>
        String(row[column.key] ?? '').toLowerCase().includes(query)
      ))
      : groupedRows;
  }, [groupedRows, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / perPage));
  const pageRows = filteredRows.slice((page - 1) * perPage, page * perPage);
  const totals = useMemo(() => {
    const sums = { qty: 0, taxableAmount: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, subTotal: 0 };
    filteredRows.forEach((row) => Object.keys(sums).forEach((key) => { sums[key] += Number(row[key]) || 0; }));
    return sums;
  }, [filteredRows]);
  const pageTotals = useMemo(() => {
    const sums = { qty: 0, taxableAmount: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, subTotal: 0 };
    pageRows.forEach((row) => Object.keys(sums).forEach((key) => { sums[key] += Number(row[key]) || 0; }));
    return sums;
  }, [pageRows]);

  const load = useCallback(async () => {
    if (!business) {
      setRows([]);
      setError('Select a business in the top bar.');
      return;
    }
    if (!applied.fromDate || !applied.toDate) {
      setError('Date From and Date To are required.');
      return;
    }
    if (!appliedTypes.length) {
      setRows([]);
      setError('Select at least one report type.');
      return;
    }
    const reportTypes = [...new Set(appliedTypes.flatMap((type) => REPORT_TYPES[type]))];
    const params = new URLSearchParams({
      business,
      location: applied.location || '',
      finYear: finYear || '',
      fromDate: applied.fromDate,
      toDate: applied.toDate,
      types: reportTypes.join(','),
      tab: 'All',
      export: '1',
    });
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/reports/gst-report?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load the HSN Summary.');
      setRows(result.rows || []);
      setPage(1);
    } catch (requestError) {
      setRows([]);
      setError(requestError.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [business, applied, appliedTypes, finYear]);

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
  }

  function reset() {
    const next = defaultFilters();
    setFilters(next);
    setApplied(next);
    setSelectedTypes(['POS', 'SI']);
    setAppliedTypes(['POS', 'SI']);
    setSearch('');
    setPage(1);
    setError('');
  }

  function exportExcel() {
    const data = filteredRows.map((row) => visibleColumns.map((column) =>
      column.numeric ? amount(row[column.key]) : row[column.key] ?? ''
    ));
    download('hsn-summary.xls', toXlsHtml(
      'HSN Summary',
      visibleColumns.map((column) => column.label),
      data,
      visibleColumns.flatMap((column, index) => column.numeric ? [index] : [])
    ), 'application/vnd.ms-excel');
  }

  function printReport() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('The browser blocked the print window. Allow pop-ups for this site, then press Print again.');
      return;
    }
    const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[char]));
    const headers = visibleColumns.map((column) => `<th>${escape(column.label)}</th>`).join('');
    const body = filteredRows.map((row) => `<tr>${visibleColumns.map((column) =>
      `<td>${escape(column.numeric ? amount(row[column.key]) : row[column.key])}</td>`
    ).join('')}</tr>`).join('');
    printWindow.document.write(`<html><head><title>HSN Summary</title><style>
      body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}
      th{background:#f1f4f9}h2{font-size:18px}
      </style></head><body><h2>HSN Summary</h2><table><thead><tr>${headers}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <Icon name="barcode" size={18} /> HSN Summary
        </h2>
        <p className="text-[13px] text-inkmuted">Taxable value and GST totals grouped by HSN/SAC and tax rate.</p>
      </div>

      <section className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="filter" size={15} /> Report Filters</span>
          <button type="button" className="btn !border-0 !bg-transparent !px-2 !py-1 text-inkmuted"
            onClick={() => setFiltersVisible((visible) => !visible)}>
            <Icon name={filtersVisible ? 'chevD' : 'chevR'} size={13} /> {filtersVisible ? 'Hide' : 'Show'}
          </button>
        </div>
        {filtersVisible && <div className="card-body">
          {error && <div className="flash flash-err mb-3">{error}</div>}
              <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line pb-3 text-[13px] text-ink">
                <span className="mr-1">Report Type</span>
                {TYPES.map((type) => (
                  <label key={type.key} className="flex items-center gap-2">
                    <input type="checkbox" checked={selectedTypes.includes(type.key)}
                      onChange={() => setSelectedTypes((current) => current.includes(type.key)
                        ? current.filter((entry) => entry !== type.key) : [...current, type.key])} />
                    {type.label}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_1.8fr]">
                <label className="block text-[13px] text-ink">
                  <span className="mb-1 block">Business Location</span>
              <MultiSelect mode="single" options={locationOptions.options}
                value={filters.location}
                onChange={(value) => setFilters((current) => ({ ...current, location: value }))}
                placeholder="All Locations" loading={locationOptions.loading} error={locationOptions.error} />
            </label>
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Date From <b className="text-danger">*</b></span>
              <input type="date" className="f-input" value={filters.fromDate}
                onChange={(event) => setFilters((current) => ({ ...current, fromDate: event.target.value }))} />
            </label>
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Date To <b className="text-danger">*</b></span>
              <input type="date" className="f-input" value={filters.toDate}
                onChange={(event) => setFilters((current) => ({ ...current, toDate: event.target.value }))} />
            </label>
            <div className="block text-[13px] text-ink">
              <span className="mb-1 block">HSN Code</span>
              <MultiSelect mode="multi" options={hsnCodeOptions}
                value={filters.hsnCodes}
                onChange={(value) => setFilters((current) => ({ ...current, hsnCodes: value }))}
                placeholder="Use , for multiple" loading={hsnMasterOptions.loading}
                error={hsnMasterOptions.error} />
            </div>
          </div>
          <div className="mt-3 flex justify-end gap-2 border-t border-line pt-3">
              <button type="button" className="btn" onClick={reset} disabled={loading}>
                <Icon name="refresh" size={14} /> Reset
              </button>
              <button type="button" className="btn btn-primary" onClick={searchReport} disabled={loading}>
                {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
              </button>
          </div>
        </div>}
      </section>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { key: 'qty', label: 'TOTAL QTY', icon: 'box' },
          { key: 'subTotal', label: 'TOTAL SELL', icon: 'cash' },
          { key: 'taxableAmount', label: 'TAXABLE', icon: 'ledger' },
          { key: 'igstAmount', label: 'IGST', icon: 'cash' },
          { key: 'cgstAmount', label: 'CGST', icon: 'cash' },
          { key: 'sgstAmount', label: 'SGST', icon: 'cash' },
        ].map((card) => (
          <div key={card.key} className="card flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e7efff] text-brand">
              <Icon name={card.icon} size={16} />
            </span>
            <div>
              <div className="text-[11px] font-medium text-inkmuted">{card.label}</div>
              <div className="text-[15px] font-bold text-ink">
                {loading ? <span className="spin" /> : amount(totals[card.key])}
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="card mt-3 overflow-hidden">
        <div className="card-head">
          <span className="card-title"><Icon name="grid" size={15} /> HSN Summary</span>
          <span className="pill pill-blue">{filteredRows.length} records</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-[#f7f9fc] px-3 py-2.5">
          <select className="f-input !w-auto" value={perPage}
            onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}>
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
          <button type="button" className="btn" onClick={exportExcel} disabled={!filteredRows.length}>
            <Icon name="file" size={14} /> Export to Excel
          </button>
          <button type="button" className="btn" onClick={printReport} disabled={!filteredRows.length}>
            <Icon name="printer" size={14} /> Print
          </button>
          <span className="flex-1" />
          <label className="relative min-w-[180px] flex-1 sm:max-w-[320px]">
            <Icon name="search" size={14} className="absolute left-2.5 top-2.5 text-inkmuted" />
            <input type="search" className="f-input !pl-8" value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search" />
          </label>
          <button type="button" className="btn" aria-label="Refresh HSN Summary" onClick={load} disabled={loading}>
            <Icon name="refresh" size={14} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead><tr className="bg-[#f7f9fc]">
              {visibleColumns.map((column) => (
                <th key={column.key} className={`border-b border-line px-2.5 py-2 font-semibold text-ink ${column.numeric ? 'text-right' : 'text-left'}`}>
                  {column.label}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={visibleColumns.length} className="dt-empty">Loading HSN Summary...</td></tr>
                : pageRows.map((row, index) => (
                  <tr key={`${row.type}-${row.hsn}-${row.uom}-${row.taxRate}`} className={index % 2 ? 'bg-[#eef3fb]' : 'bg-white'}>
                    {visibleColumns.map((column) => (
                      <td key={column.key} className={`border-b border-line px-2.5 py-2 text-inkmuted ${column.numeric ? 'text-right' : 'text-left'}`}>
                        {column.numeric ? amount(row[column.key]) : row[column.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && !pageRows.length && (
                <tr><td colSpan={visibleColumns.length} className="dt-empty">No HSN records found for the selected filters.</td></tr>
              )}
            </tbody>
            {!loading && pageRows.length > 0 && (
              <tfoot><tr className="bg-[#eef3fb] font-bold text-ink">
                {visibleColumns.map((column, index) => (
                  <td key={column.key} className={`border-t border-line px-2.5 py-2 ${column.numeric ? 'text-right' : 'text-left'}`}>
                    {index === 0 ? 'Total' : column.numeric && column.total !== false ? amount(pageTotals[column.key]) : ''}
                  </td>
                ))}
              </tr></tfoot>
            )}
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#f7f9fc] px-3 py-2.5 text-[12px] text-inkmuted">
          <span>Showing {filteredRows.length ? (page - 1) * perPage + 1 : 0}–{Math.min(page * perPage, filteredRows.length)} of {filteredRows.length}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" className="btn !px-2.5 !py-1" disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <span className="px-2">{page} / {pageCount}</span>
            <button type="button" className="btn !px-2.5 !py-1" disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
          </div>
        </div>
      </section>
    </>
  );
}
