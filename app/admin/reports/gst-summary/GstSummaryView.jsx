'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useOptions } from '@/components/useOptions';
import { useScope } from '@/components/ScopeContext';
import { download, toXlsHtml } from '@/lib/format';

const TYPES = [
  'POS B2B', 'POS B2C', 'SI B2B', 'SR B2B',
  'ICSI B2B', 'ICSI B2C', 'ICSR B2B', 'ICSR B2C',
];
const COLUMNS = [
  { key: 'type', label: 'DESCRIPTION' },
  { key: 'records', label: 'NO. OF RECORDS', numeric: true },
  { key: 'subTotal', label: 'SUB TOTAL (NET SALES)', numeric: true },
  { key: 'taxableAmount', label: 'TAXABLE AMOUNT', numeric: true },
  { key: 'igstAmount', label: 'IGST', numeric: true },
  { key: 'cgstAmount', label: 'CGST', numeric: true },
  { key: 'sgstAmount', label: 'SGST', numeric: true },
  { key: 'billDetails', label: 'BILL DETAILS' },
  { key: 'itemDetails', label: 'ITEM DETAILS' },
];

function dateValue(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function defaultFilters() {
  const to = new Date();
  const from = new Date(to);
  from.setMonth(from.getMonth() - 1);
  return { fromDate: dateValue(from), toDate: dateValue(to), location: '' };
}

function amount(value) {
  return Number(value || 0).toFixed(2);
}

export default function GstSummaryView() {
  const router = useRouter();
  const { business, finYear } = useScope();
  const locationOptions = useOptions('companylocations');
  const defaults = useMemo(() => defaultFilters(), []);
  const [filters, setFilters] = useState(defaults);
  const [applied, setApplied] = useState(defaults);
  const [selectedTypes, setSelectedTypes] = useState(TYPES);
  const [appliedTypes, setAppliedTypes] = useState(TYPES);
  const [rows, setRows] = useState([]);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const visibleColumns = useMemo(
    () => COLUMNS.filter((column) => !hiddenColumns.includes(column.key)),
    [hiddenColumns]
  );
  const filteredRows = useMemo(() => rows.filter((row) =>
    row.type.toLowerCase().includes(search.trim().toLowerCase())
  ), [rows, search]);
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / perPage));
  const visibleRows = filteredRows.slice((page - 1) * perPage, page * perPage);
  const pageTotals = visibleRows.reduce((sum, row) => {
    ['records', 'subTotal', 'taxableAmount', 'igstAmount', 'cgstAmount', 'sgstAmount']
      .forEach((key) => { sum[key] += Number(row[key]) || 0; });
    return sum;
  }, { records: 0, subTotal: 0, taxableAmount: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0 });

  const load = useCallback(async () => {
    if (!business) {
      setRows([]);
      setTotals({});
      setError('Select a business in the top bar.');
      return;
    }
    if (!applied.fromDate || !applied.toDate) {
      setError('Date From and Date To are required.');
      return;
    }
    if (!appliedTypes.length) {
      setRows([]);
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
      summary: '1',
    });
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/reports/gst-report?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load the GST Summary Report.');
      setRows(result.rows || []);
      setTotals(result.totals || {});
      setPage(1);
    } catch (requestError) {
      setRows([]);
      setTotals({});
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
    setSelectedTypes(TYPES);
    setAppliedTypes(TYPES);
    setSearch('');
    setPage(1);
    setError('');
  }

  function toggleType(type) {
    setSelectedTypes((current) => current.includes(type)
      ? current.filter((entry) => entry !== type)
      : [...current, type]);
  }

  function exportExcel() {
    const exportColumns = visibleColumns.filter((column) => !['billDetails', 'itemDetails'].includes(column.key));
    const data = filteredRows.map((row) => exportColumns.map((column) =>
      column.numeric && column.key !== 'records' ? amount(row[column.key]) : row[column.key] ?? ''
    ));
    download('gst-summary-report.xls', toXlsHtml(
      'GST Summary Report',
      exportColumns.map((column) => column.label),
      data,
      exportColumns.flatMap((column, index) => column.numeric ? [index] : [])
    ), 'application/vnd.ms-excel');
  }

  function printReport() {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setError('The browser blocked the print window. Allow pop-ups for this site, then press Print again.');
      return;
    }
    const headers = visibleColumns.filter((column) => !['billDetails', 'itemDetails'].includes(column.key));
    const escape = (value) => String(value ?? '').replace(/[&<>"]/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
    }[char]));
    const body = filteredRows.map((row) => `<tr>${headers.map((column) =>
      `<td>${escape(column.numeric && column.key !== 'records' ? amount(row[column.key]) : row[column.key])}</td>`
    ).join('')}</tr>`).join('');
    printWindow.document.write(`<html><head><title>GST Summary Report</title><style>
      body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%;font-size:12px}
      th,td{border:1px solid #ccc;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}
      th{background:#f1f4f9}h2{font-size:18px}
      </style></head><body><h2>GST Summary Report</h2><table><thead><tr>${headers.map((column) =>
      `<th>${escape(column.label)}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  function openDetails(row, kind) {
    const params = new URLSearchParams({
      business: business || '',
      location: applied.location || '',
      finYear: finYear || '',
      fromDate: applied.fromDate,
      toDate: applied.toDate,
    });
    const route = kind === 'bill' ? 'billdetail' : 'itemdetail';
    router.push(`/admin/reports/gst-summary/${route}/${encodeURIComponent(row.type)}?${params}`);
  }

  return (
    <>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <Icon name="file" size={18} /> GST Summary Report
        </h2>
        <p className="text-[13px] text-inkmuted">GST-wise net sales, taxable value and the IGST / CGST / SGST split, per source.</p>
      </div>

      <section className="card">
        <div className="card-head"><span className="card-title">GST Summary Report</span></div>
        <div className="card-body">
          {error && <div className="flash flash-err mb-3">{error}</div>}
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="text-[12px] text-ink">Report Type:</span>
            {TYPES.map((type) => (
              <label key={type} className="flex items-center gap-1.5 text-[12px] text-ink">
                <input type="checkbox" checked={selectedTypes.includes(type)} onChange={() => toggleType(type)} />
                {type}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-1 items-end gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1.1fr_1.1fr_auto]">
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
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={reset} disabled={loading}>
                <Icon name="refresh" size={14} /> Reset
              </button>
              <button type="button" className="btn btn-primary" onClick={searchReport} disabled={loading}>
                {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
              </button>
            </div>
          </div>
        </div>
      </section>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { key: 'records', label: 'TOTAL RECORDS', icon: 'file' },
          { key: 'subTotal', label: 'NET SALES', icon: 'cash' },
          { key: 'taxableAmount', label: 'TAXABLE AMOUNT', icon: 'ledger' },
          { key: 'igstAmount', label: 'IGST', icon: 'cash' },
          { key: 'cgstAmount', label: 'CGST', icon: 'cash' },
          { key: 'sgstAmount', label: 'SGST', icon: 'cash' },
        ].map((card) => (
          <div key={card.key} className="card flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e7efff] text-brand">
              <Icon name={card.icon} size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-inkmuted">{card.label}</div>
              <div className="truncate text-[15px] font-bold text-ink">
                {loading ? <span className="spin" /> : card.key === 'records'
                  ? Number(totals.records || 0).toLocaleString()
                  : amount(totals[card.key])}
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="card mt-3 overflow-hidden">
        <div className="card-head">
          <span className="card-title"><Icon name="grid" size={15} /> GST Summary</span>
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
          <button type="button" className="btn" onClick={exportExcel} disabled={!rows.length}>
            <Icon name="file" size={14} /> Export to Excel
          </button>
          <button type="button" className="btn" onClick={printReport} disabled={!rows.length}>
            <Icon name="printer" size={14} /> Print
          </button>
          <span className="flex-1" />
          <label className="relative min-w-[180px] flex-1 sm:max-w-[320px]">
            <Icon name="search" size={14} className="absolute left-2.5 top-2.5 text-inkmuted" />
            <input type="search" className="f-input !pl-8" value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }}
              placeholder="Search" />
          </label>
          <button type="button" className="btn" aria-label="Refresh GST summary" onClick={load} disabled={loading}>
            <Icon name="refresh" size={14} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#f7f9fc]">
                {visibleColumns.map((column) => (
                  <th key={column.key} className={`border-b border-line px-2.5 py-2 font-semibold text-ink ${column.numeric ? 'text-right' : 'text-left'}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={visibleColumns.length} className="dt-empty">Loading GST summary...</td></tr>
              ) : visibleRows.length ? visibleRows.map((row, index) => (
                <tr key={row._id} className={index % 2 ? 'bg-[#eef3fb]' : 'bg-white'}>
                  {visibleColumns.map((column) => (
                    <td key={column.key} className={`border-b border-line px-2.5 py-2 text-inkmuted ${column.numeric ? 'text-right' : 'text-left'}`}>
                      {column.key === 'billDetails' || column.key === 'itemDetails'
                        ? row.records > 0 && (
                          <button type="button" className="inline-flex h-6 w-6 items-center justify-center rounded bg-sky-600 text-white hover:bg-sky-700"
                            title={column.key === 'billDetails' ? 'View bill details' : 'View item details'}
                            onClick={() => openDetails(row, column.key === 'billDetails' ? 'bill' : 'item')}>
                            <Icon name="eye" size={13} />
                          </button>
                        )
                        : column.numeric
                          ? column.key === 'records' ? row.records : amount(row[column.key])
                          : row[column.key]}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr><td colSpan={visibleColumns.length} className="dt-empty">No GST records found for the selected filters.</td></tr>
              )}
            </tbody>
            {!loading && visibleRows.length > 0 && (
              <tfoot>
                <tr className="bg-[#eef3fb] font-bold text-ink">
                  {visibleColumns.map((column, index) => (
                    <td key={column.key} className={`border-t border-line px-2.5 py-2 ${column.numeric ? 'text-right' : 'text-left'}`}>
                      {index === 0 ? 'Total' : column.key === 'records' ? pageTotals.records
                        : Object.prototype.hasOwnProperty.call(pageTotals, column.key) ? amount(pageTotals[column.key]) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
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
