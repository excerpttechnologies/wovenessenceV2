'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';
import { download, toXlsHtml } from '@/lib/format';

const BILL_COLUMNS = [
  { key: 'invoiceDate', label: 'TRAN. DATE' },
  { key: 'customerName', label: 'CUSTOMER NAME' },
  { key: 'gstn', label: 'GSTN' },
  { key: 'invoiceNo', label: 'INVOICE NO.' },
  { key: 'branch', label: 'LOCATION' },
  { key: 'taxableAmount', label: 'TAXABLE AMOUNT', numeric: true },
  { key: 'igstAmount', label: 'IGST', numeric: true },
  { key: 'cgstAmount', label: 'CGST', numeric: true },
  { key: 'sgstAmount', label: 'SGST', numeric: true },
  { key: 'subTotal', label: 'SUB TOTAL (NET SALES)', numeric: true },
];
const ITEM_COLUMNS = [
  { key: 'invoiceDate', label: 'TRAN. DATE' },
  { key: 'customerName', label: 'CUSTOMER NAME' },
  { key: 'gstn', label: 'GSTN' },
  { key: 'invoiceNo', label: 'INVOICE NO.' },
  { key: 'branch', label: 'LOCATION' },
  { key: 'itemName', label: 'ITEM NAME' },
  { key: 'itemCode', label: 'ITEM CODE' },
  { key: 'hsn', label: 'HSN' },
  { key: 'qty', label: 'QTY', numeric: true },
  { key: 'taxRate', label: 'TAX RATE', numeric: true, total: false },
  { key: 'taxableAmount', label: 'TAXABLE AMOUNT', numeric: true },
  { key: 'igstAmount', label: 'IGST', numeric: true },
  { key: 'cgstAmount', label: 'CGST', numeric: true },
  { key: 'sgstAmount', label: 'SGST', numeric: true },
  { key: 'subTotal', label: 'SUB TOTAL (NET SALES)', numeric: true },
];
const MONEY_KEYS = ['taxableAmount', 'igstAmount', 'cgstAmount', 'sgstAmount', 'subTotal', 'net'];

function amount(value) {
  return Number(value || 0).toFixed(2);
}

function dateText(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (part) => String(part).padStart(2, '0');
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export default function GstSummaryDetailView({ type, kind }) {
  const { business, finYear } = useScope();
  const reportType = useMemo(() => {
    try {
      return decodeURIComponent(type).replace(/_/g, ' ');
    } catch {
      return type.replace(/_/g, ' ');
    }
  }, [type]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columns = kind === 'bill' ? BILL_COLUMNS : ITEM_COLUMNS;
  const visibleColumns = useMemo(
    () => columns.filter((column) => !hiddenColumns.includes(column.key)),
    [columns, hiddenColumns]
  );

  const load = useCallback(async () => {
    const current = new URLSearchParams(window.location.search);
    if (!business) {
      setRows([]);
      setError('Select a business in the top bar.');
      setLoading(false);
      return;
    }
    const fromDate = current.get('fromDate') || '';
    const toDate = current.get('toDate') || '';
    if (!fromDate || !toDate) {
      setRows([]);
      setError('Date From and Date To are required. Return to the GST Summary Report and search again.');
      setLoading(false);
      return;
    }
    const params = new URLSearchParams({
      business,
      location: current.get('location') || '',
      finYear: current.get('finYear') || finYear || '',
      fromDate,
      toDate,
      types: reportType,
      tab: 'All',
      export: '1',
    });
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/reports/gst-report?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load GST details.');
      setRows(result.rows || []);
    } catch (requestError) {
      setRows([]);
      setError(requestError.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [business, finYear, reportType]);

  useEffect(() => { load(); }, [load]);

  const records = useMemo(() => {
    if (kind !== 'bill') return rows;
    const documents = new Map();
    rows.forEach((row) => {
      if (!documents.has(row._documentId)) {
        documents.set(row._documentId, {
          _id: row._documentId,
          invoiceDate: row.invoiceDate,
          customerName: row.customerName,
          gstn: row.gstn,
          invoiceNo: row.invoiceNo,
          branch: row.branch,
          taxableAmount: 0,
          igstAmount: 0,
          cgstAmount: 0,
          sgstAmount: 0,
          subTotal: 0,
          net: 0,
        });
      }
      const document = documents.get(row._documentId);
      MONEY_KEYS.forEach((key) => { document[key] += Number(row[key]) || 0; });
    });
    return [...documents.values()];
  }, [kind, rows]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return records;
    return records.filter((row) => columns.some((column) =>
      String(row[column.key] ?? '').toLowerCase().includes(query)
    ));
  }, [records, search, columns]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = filtered.slice((page - 1) * perPage, page * perPage);
  const totals = useMemo(() => {
    const values = { qty: 0, taxableAmount: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, subTotal: 0 };
    filtered.forEach((row) => Object.keys(values).forEach((key) => {
      values[key] += Number(row[key]) || 0;
    }));
    return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.round(value * 100) / 100]));
  }, [filtered]);
  const summaryTotals = useMemo(() => records.reduce((sum, row) => {
    ['qty', 'taxableAmount', 'igstAmount', 'cgstAmount', 'sgstAmount', 'subTotal']
      .forEach((key) => { sum[key] += Number(row[key]) || 0; });
    return sum;
  }, { qty: 0, taxableAmount: 0, igstAmount: 0, cgstAmount: 0, sgstAmount: 0, subTotal: 0 }), [records]);
  const summaryCards = kind === 'item'
    ? [
      { key: 'lines', label: 'TOTAL LINES', icon: 'grid' },
      { key: 'qty', label: 'TOTAL QTY', icon: 'box' },
      { key: 'taxableAmount', label: 'TAXABLE AMOUNT', icon: 'ledger' },
      { key: 'igstAmount', label: 'IGST', icon: 'cash' },
      { key: 'cgstAmount', label: 'CGST', icon: 'cash' },
      { key: 'sgstAmount', label: 'SGST', icon: 'cash' },
      { key: 'subTotal', label: 'NET SALES', icon: 'register' },
    ]
    : [
      { key: 'bills', label: 'TOTAL BILLS', icon: 'file' },
      { key: 'taxableAmount', label: 'TAXABLE AMOUNT', icon: 'ledger' },
      { key: 'igstAmount', label: 'IGST', icon: 'cash' },
      { key: 'cgstAmount', label: 'CGST', icon: 'cash' },
      { key: 'sgstAmount', label: 'SGST', icon: 'cash' },
      { key: 'subTotal', label: 'NET SALES', icon: 'register' },
    ];

  function exportExcel() {
    const data = filtered.map((row) => visibleColumns.map((column) =>
      column.key === 'invoiceDate' ? dateText(row[column.key])
        : column.numeric ? amount(row[column.key]) : row[column.key] || ''
    ));
    download(`gst-${kind}-details.xls`, toXlsHtml(
      `${reportType} — ${kind === 'bill' ? 'Bill' : 'Item'} Details`,
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
    const header = visibleColumns.map((column) => `<th>${escape(column.label)}</th>`).join('');
    const body = filtered.map((row) => `<tr>${visibleColumns.map((column) => {
      const value = column.key === 'invoiceDate' ? dateText(row[column.key])
        : column.numeric ? amount(row[column.key]) : row[column.key] || '';
      return `<td>${escape(value)}</td>`;
    }).join('')}</tr>`).join('');
    printWindow.document.write(`<html><head><title>${escape(reportType)} GST Details</title><style>
      body{font-family:Arial,sans-serif;padding:20px}table{border-collapse:collapse;width:100%;font-size:11px}
      th,td{border:1px solid #ccc;padding:6px;text-align:right}th:first-child,td:first-child{text-align:left}
      th{background:#f1f4f9}h2{font-size:18px}
      </style></head><body><h2>${escape(reportType)} — ${kind === 'bill' ? 'Bill' : 'Item'} Details</h2>
      <table><thead><tr>${header}</tr></thead><tbody>${body}</tbody></table></body></html>`);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  return (
    <>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <Icon name="grid" size={18} /> {reportType} — {kind === 'bill' ? 'Bill Details' : 'Item Details'}
        </h2>
        <p className="text-[13px] text-inkmuted">
          {kind === 'item'
            ? 'Item-line GST breakup (qty, tax rate, taxable value and the IGST / CGST / SGST split) for the selected source.'
            : 'GST breakdown for the selected source.'}
        </p>
      </div>
      <Link href="/admin/reports/gst-summary" className="btn mb-3 inline-flex">
        <Icon name="back" size={14} /> Back
      </Link>

      {error && <div className="flash flash-err mb-3">{error}</div>}

      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {summaryCards.map((card) => (
          <div key={card.key} className="card flex items-center gap-3 px-3 py-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#e7efff] text-brand">
              <Icon name={card.icon} size={16} />
            </span>
            <div>
              <div className="text-[11px] font-medium text-inkmuted">{card.label}</div>
              <div className="text-[15px] font-bold text-ink">
                {loading ? <span className="spin" /> : card.key === 'bills' || card.key === 'lines'
                  ? records.length.toLocaleString()
                  : amount(summaryTotals[card.key])}
              </div>
            </div>
          </div>
        ))}
      </div>

      <section className="card overflow-hidden">
        <div className="card-head">
          <span className="card-title"><Icon name="grid" size={15} /> {kind === 'bill' ? 'Bill Details' : 'Item Details'}</span>
          <span className="pill pill-blue">{filtered.length} records</span>
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
                {columns.map((column) => (
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
          <button type="button" className="btn" onClick={exportExcel} disabled={!filtered.length}>
            <Icon name="file" size={14} /> Export to Excel
          </button>
          <button type="button" className="btn" onClick={printReport} disabled={!filtered.length}>
            <Icon name="printer" size={14} /> Print
          </button>
          <span className="flex-1" />
          <label className="relative min-w-[180px] flex-1 sm:max-w-[320px]">
            <Icon name="search" size={14} className="absolute left-2.5 top-2.5 text-inkmuted" />
            <input type="search" className="f-input !pl-8" value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Search" />
          </label>
          <button type="button" className="btn" aria-label="Refresh GST details" onClick={load} disabled={loading}>
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
              {loading ? <tr><td colSpan={visibleColumns.length} className="dt-empty">Loading GST details...</td></tr>
                : pageRows.map((row, index) => (
                  <tr key={row._id} className={index % 2 ? 'bg-[#eef3fb]' : 'bg-white'}>
                    {visibleColumns.map((column) => (
                      <td key={column.key} className={`border-b border-line px-2.5 py-2 text-inkmuted ${column.numeric ? 'text-right' : 'text-left'}`}>
                        {column.key === 'invoiceDate' ? dateText(row[column.key])
                          : column.numeric ? amount(row[column.key]) : row[column.key] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              {!loading && !pageRows.length && (
                <tr><td colSpan={visibleColumns.length} className="dt-empty">No details found for this report type and date range.</td></tr>
              )}
            </tbody>
            {!loading && pageRows.length > 0 && (
              <tfoot><tr className="bg-[#eef3fb] font-bold text-ink">
                {visibleColumns.map((column, index) => (
                  <td key={column.key} className={`border-t border-line px-2.5 py-2 ${column.numeric ? 'text-right' : 'text-left'}`}>
                    {index === 0 ? 'Total' : column.numeric && column.total !== false ? amount(totals[column.key]) : ''}
                  </td>
                ))}
              </tr></tfoot>
            )}
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#f7f9fc] px-3 py-2.5 text-[12px] text-inkmuted">
          <span>Showing {filtered.length ? (page - 1) * perPage + 1 : 0}–{Math.min(page * perPage, filtered.length)} of {filtered.length}</span>
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
