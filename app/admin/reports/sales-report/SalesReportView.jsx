'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useOptions } from '@/components/useOptions';
import { FIN_YEARS, useScope } from '@/components/ScopeContext';
import { download, fmt, printTable, toXlsHtml } from '@/lib/format';
import { REPORT, REPORT_TYPE_OPTS } from './fields';

const COLUMNS = REPORT.sections[0].columns;
const DEFAULT_PAGE_SIZE = REPORT.perPage;

function localDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function financialYearDates(finYear) {
  const today = new Date();
  const match = /^(\d{4})-(\d{4})$/.exec(finYear || '');
  const startYear = match ? Number(match[1]) : Number(FIN_YEARS[FIN_YEARS.length - 1]?.slice(0, 4));
  const start = new Date(startYear, 3, 1);
  if (!match) return { fromDate: localDate(start), toDate: localDate(today) };
  const endYear = Number(match[2]);
  const end = new Date(endYear, 2, 31);
  const to = today >= start && today <= end ? today : end;
  return { fromDate: localDate(start), toDate: localDate(to) };
}

function defaultFilters(finYear) {
  return {
    location: '',
    ...financialYearDates(finYear),
    reportType: 'summary',
    supplierId: '',
  };
}

function formatCell(column, row) {
  const value = row[column.k];
  if (value === null || value === undefined) return '';
  if (column.k === 'profitPct') return `${Number(value).toFixed(2)}%`;
  return column.f === 'amount' ? fmt('amount', value) : String(value);
}

function queryFor({ business, finYear, filters, search, page, perPage }, extra = {}) {
  const params = new URLSearchParams({
    business: business || '',
    location: filters.location || '',
    finYear: finYear || '',
    fromDate: filters.fromDate || '',
    toDate: filters.toDate || '',
    reportType: filters.reportType || 'summary',
    supplierId: filters.supplierId || '',
    q: search || '',
    page: String(page),
    perPage: String(perPage),
  });
  Object.entries(extra).forEach(([key, value]) => params.set(key, String(value)));
  return params;
}

export default function SalesReportView() {
  const { business, locations, finYear, setFinYear } = useScope();
  const locationOptions = useOptions('companylocations');
  const supplierOptions = useOptions('supplier');
  const targetLocation = locationOptions.options.find((option) => (
    String(option.label || '').trim().toUpperCase() === 'TEMPLE FABRICS, SILKS & SAREES'
  ));
  const [draft, setDraft] = useState(() => defaultFilters(finYear));
  const [applied, setApplied] = useState(() => defaultFilters(finYear));
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(DEFAULT_PAGE_SIZE);
  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [visibleColumns, setVisibleColumns] = useState(
    () => new Set(COLUMNS.filter((column) => column.k !== 'locationName').map((column) => column.k))
  );
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const locationDefaulted = useRef(false);

  const filterLocationOptions = useMemo(() => {
    const optionsById = new Map();
    [...(locations || []), ...locationOptions.options].forEach((option) => {
      if (option?.value) optionsById.set(option.value, option);
    });
    if (draft.location && !optionsById.has(draft.location)) {
      optionsById.set(draft.location, { value: draft.location, label: 'Selected location unavailable' });
    }
    return [...optionsById.values()];
  }, [locations, locationOptions.options, draft.location]);

  const columns = useMemo(
    () => COLUMNS.filter((column) => visibleColumns.has(column.k)),
    [visibleColumns]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const filters = defaultFilters(finYear);
    ['location', 'fromDate', 'toDate', 'reportType', 'supplierId'].forEach((key) => {
      if (params.has(key)) filters[key] = params.get(key) || '';
    });
    const search = params.get('q') || '';
    setDraft(filters);
    setApplied(filters);
    setSearchText(search);
    setAppliedSearch(search);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || locationOptions.loading || locationDefaulted.current) return;
    if (!locationOptions.options.length) {
      if (locationOptions.error) locationDefaulted.current = true;
      return;
    }
    locationDefaulted.current = true;
    if (!targetLocation || new URLSearchParams(window.location.search).has('location')) return;
    setDraft((current) => ({ ...current, location: targetLocation.value }));
    setApplied((current) => ({ ...current, location: targetLocation.value }));
  }, [ready, locationOptions.loading, locationOptions.options, locationOptions.error, targetLocation]);

  useEffect(() => {
    setPage(1);
  }, [business, finYear]);

  useEffect(() => {
    if (!ready) return undefined;
    if (!business) {
      setData(null);
      setLoading(false);
      setError('Select a business in the top bar.');
      return undefined;
    }

    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = queryFor({
      business, finYear, filters: applied, search: appliedSearch, page, perPage,
    });

    fetch(`/api/reports/sales-report?${params}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not run that report.');
        return result;
      })
      .then((result) => {
        setData(result);
      })
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        setError(requestError.message || 'Could not reach the server.');
        setData(null);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [ready, business, finYear, applied, appliedSearch, page, perPage]);

  function setFilter(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function changeFinancialYear(value) {
    setFinYear(value);
    const dates = financialYearDates(value);
    setDraft((current) => ({ ...current, ...dates }));
    setApplied((current) => ({ ...current, ...dates }));
    setPage(1);
  }

  function search() {
    if (!draft.fromDate || !draft.toDate) {
      setError('Date From and Date To are required.');
      return;
    }
    setError('');
    setPage(1);
    setApplied({ ...draft });
    setAppliedSearch(searchText.trim());
  }

  function reset() {
    const filters = defaultFilters(finYear);
    if (targetLocation) filters.location = targetLocation.value;
    setDraft(filters);
    setApplied(filters);
    setSearchText('');
    setAppliedSearch('');
    setPage(1);
    setPerPage(DEFAULT_PAGE_SIZE);
    setVisibleColumns(new Set(COLUMNS.filter((column) => column.k !== 'locationName').map((column) => column.k)));
    setError('');
  }

  async function exportRows() {
    const params = queryFor({
      business, finYear, filters: applied, search: appliedSearch, page: 1, perPage,
    }, { export: '1' });
    const response = await fetch(`/api/reports/sales-report?${params}`, { cache: 'no-store' });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Could not export that report.');
    return result.rows || [];
  }

  async function runExport(kind) {
    if (exporting) return;
    if (!business) {
      setError('Select a business in the top bar.');
      return;
    }
    const printWindow = kind === 'print' ? window.open('', '_blank') : null;
    if (kind === 'print' && !printWindow) {
      setError('The browser blocked the print window. Allow pop-ups for this site, then press Print again.');
      return;
    }
    if (printWindow) {
      printWindow.document.write('<p style="font-family:Arial;padding:20px">Preparing the print...</p>');
      printWindow.document.close();
    }
    setExporting(kind);
    setError('');
    try {
      const rows = await exportRows();
      const headers = columns.map((column) => column.t);
      const values = rows.map((row) => columns.map((column) => formatCell(column, row)));
      if (kind === 'xls') {
        download('sales-report.xls', toXlsHtml(REPORT.title, headers, values), 'application/vnd.ms-excel');
      } else {
        printTable(REPORT.title, headers, values, printWindow);
      }
    } catch (exportError) {
      if (printWindow) printWindow.close();
      setError(exportError.message || 'Could not export that report.');
    } finally {
      setExporting('');
    }
  }

  const rows = data?.rows || [];
  const total = Number(data?.total) || 0;
  const pages = Number(data?.pages) || 1;
  const first = total ? (page - 1) * perPage + 1 : 0;
  const last = total ? Math.min(page * perPage, total) : 0;
  const pageTotals = data?.pageTotals || {};

  return (
    <>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <Icon name="chart" size={18} /> {REPORT.title}
        </h2>
        <p className="text-[13px] text-inkmuted">{REPORT.subtitle}</p>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="filter" size={15} /> Report Filters</span>
        </div>
        <div className="card-body">
          {error && <div className="flash flash-err">{error}</div>}
          {!business && <div className="flash flash-err">Select a business in the top bar.</div>}
          <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Business Location</span>
              <MultiSelect
                mode="single"
                options={filterLocationOptions}
                value={draft.location}
                onChange={(value) => setFilter('location', value)}
                placeholder="All Locations"
                loading={locationOptions.loading}
                error={locationOptions.error}
              />
            </label>
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Financial Year</span>
              <select className="f-input" value={finYear || ''} onChange={(event) => changeFinancialYear(event.target.value)}>
                <option value="">All Financial Years</option>
                {FIN_YEARS.map((year) => <option key={year} value={year}>{year}</option>)}
              </select>
            </label>
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Date From</span>
              <input className="f-input" type="date" value={draft.fromDate} onChange={(event) => setFilter('fromDate', event.target.value)} />
            </label>
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Date To</span>
              <input className="f-input" type="date" value={draft.toDate} onChange={(event) => setFilter('toDate', event.target.value)} />
            </label>
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Report Type</span>
              <select className="f-input" value={draft.reportType} onChange={(event) => setFilter('reportType', event.target.value)}>
                {REPORT_TYPE_OPTS.map((option) => <option key={option.v} value={option.v}>{option.l}</option>)}
              </select>
            </label>
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Supplier</span>
              <MultiSelect
                mode="single"
                options={supplierOptions.options}
                value={draft.supplierId}
                onChange={(value) => setFilter('supplierId', value)}
                placeholder="All Suppliers"
                loading={supplierOptions.loading}
                error={supplierOptions.error}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-inkmuted">{REPORT.hint}</span>
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

      <div className="mb-4 mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-5">
        {REPORT.tiles.map((tile) => (
          <div key={tile.k} className="flex overflow-hidden rounded-lg border border-line bg-white">
            <span className={'flex w-16 items-center justify-center text-white/90 ' + tile.cls}>
              <Icon name={tile.icon} size={24} />
            </span>
            <span className="px-3 py-3">
              <small className="block text-[11.5px] uppercase tracking-wide text-[#5d6b83]">{tile.label}</small>
              <b className="text-[20px]">{loading ? <span className="spin" /> : fmt('amount', data?.tiles?.[tile.k] ?? 0)}</b>
            </span>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">{REPORT.sections[0].title}</span>
          <span className="pill pill-blue">{total} {total === 1 ? 'record' : 'records'}</span>
        </div>
        <div className="card-body">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2 text-[13px] text-inkmuted">
              <select
                className="f-input !w-auto"
                value={perPage}
                onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}
                aria-label="Rows per page"
              >
                {[15, 25, 50, 100].map((size) => <option key={size} value={size}>{size}/page</option>)}
              </select>
            </label>
            <div className="relative">
              <button type="button" className="btn" onClick={() => setColumnsOpen((open) => !open)}>
                <Icon name="cols" size={14} /> Columns
              </button>
              {columnsOpen && (
                <div className="absolute left-0 z-20 mt-1 min-w-[190px] rounded-md border border-line bg-white p-2 shadow-lg">
                  {COLUMNS.map((column) => (
                    <label key={column.k} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[13px]">
                      <input
                        type="checkbox"
                        checked={visibleColumns.has(column.k)}
                        onChange={() => setVisibleColumns((current) => {
                          const next = new Set(current);
                          if (next.has(column.k)) {
                            if (next.size === 1) return current;
                            next.delete(column.k);
                          }
                          else next.add(column.k);
                          return next;
                        })}
                      />
                      {column.t}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn" onClick={() => runExport('xls')} disabled={Boolean(exporting)}>
              {exporting === 'xls' ? <span className="spin" /> : <Icon name="file" size={14} />} Export to Excel
            </button>
            <button type="button" className="btn" onClick={() => runExport('print')} disabled={Boolean(exporting)}>
              {exporting === 'print' ? <span className="spin" /> : <Icon name="printer" size={14} />} Print
            </button>
            <span className="flex-1" />
            <form
              className="flex items-center gap-1"
              onSubmit={(event) => {
                event.preventDefault();
                setAppliedSearch(searchText.trim());
                setPage(1);
              }}
            >
              <input
                className="f-input !w-[190px]"
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search..."
                aria-label="Search sales summary"
              />
              <button type="submit" className="btn" title="Search and refresh" aria-label="Search and refresh">
                <Icon name="refresh" size={14} />
              </button>
            </form>
          </div>

          <div className="overflow-x-auto">
            <table className="dt dt-nowrap-head">
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.k} className={column.f ? 'text-right' : ''}>{column.t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={columns.length} className="dt-empty"><span className="spin" /></td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={columns.length} className="dt-empty">
                    No sales found for the selected filters. Clear Business Location to include all locations, or widen the date range.
                  </td></tr>
                ) : rows.map((row) => (
                  <tr key={row._id}>
                    {columns.map((column) => (
                      <td key={column.k} className={column.f ? 'text-right' : ''}>
                        {formatCell(column, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  {columns.map((column, index) => (
                    <td key={column.k} className={column.f ? 'text-right' : ''}>
                      {index === 0
                        ? 'Page Total'
                        : (Object.prototype.hasOwnProperty.call(pageTotals, column.k)
                          ? formatCell(column, pageTotals)
                          : '')}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <span>Showing {first}–{last} of {total}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="btn" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>
                <Icon name="chevL" size={14} /> Previous
              </button>
              <span>Page {page} of {pages}</span>
              <button type="button" className="btn" onClick={() => setPage((current) => Math.min(pages, current + 1))} disabled={page >= pages || loading}>
                Next <Icon name="chevR" size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
