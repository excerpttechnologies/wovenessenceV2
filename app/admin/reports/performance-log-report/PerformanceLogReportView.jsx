'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useCities, useOptions } from '@/components/useOptions';
import { useScope } from '@/components/ScopeContext';
import { download, fmt, printTable, toXlsHtml } from '@/lib/format';

const ANALYSIS_TYPES = [
  { value: 'supplier', label: 'Supplier' },
  { value: 'item', label: 'Item' },
  { value: 'group', label: 'Item Group' },
  { value: 'subGroup', label: 'Sub Group' },
];
const PERFORMANCE_TYPES = [
  { value: 'salesValue', label: 'Sales Value' },
  { value: 'salesRet', label: 'Sales Ret' },
  { value: 'profitPct', label: 'Profit %' },
  { value: 'retProfitPct', label: 'Ret Profit %' },
];

function dateValue(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function initialFilters() {
  const today = new Date();
  return {
    mode: 'summary',
    analysisType: 'supplier',
    performanceType: 'salesValue',
    fromDate: dateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    toDate: dateValue(today),
    location: '',
    cityGroupId: '',
    city: '',
    supplierId: '',
    groupId: '',
    subGroupId: '',
    itemId: '',
    itemCode: '',
  };
}

function valueFor(row, column) {
  const value = row[column.key];
  if (value === null || value === undefined || value === '') return '';
  if (column.percent) return `${Number(value).toFixed(2)}%`;
  if (column.amount) return fmt('amount', value);
  if (column.date) return new Date(value).toLocaleDateString('en-GB');
  return String(value);
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function SelectField({ label, children }) {
  return (
    <label className="block text-[12px] text-[#26364b]">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function ToggleGroup({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg border border-[#e2e8f0] bg-white p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`rounded-md px-3 py-2 text-[12px] ${value === option.value ? 'bg-[#2d5db3] font-semibold text-white' : 'text-[#64748b] hover:bg-[#f1f5f9]'}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default function PerformanceLogReportView() {
  const { business, finYear } = useScope();
  const [draft, setDraft] = useState(initialFilters);
  const [applied, setApplied] = useState(initialFilters);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(15);
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [hiddenColumns, setHiddenColumns] = useState([]);
  const locations = useOptions('companylocations', '', Boolean(business));
  const cityGroups = useOptions('citygroup', '', Boolean(business));
  const cities = useCities('');
  const suppliers = useOptions('supplier', '', Boolean(business));
  const groups = useOptions('product/group-parent', '', Boolean(business));
  const subgroups = useOptions(
    'product/group',
    '',
    Boolean(business && draft.groupId),
    draft.groupId ? { parentId: draft.groupId } : null
  );
  const items = useOptions(
    'item',
    '',
    Boolean(business),
    draft.subGroupId
      ? { groupId: draft.subGroupId }
      : draft.groupId
        ? { parentGroupId: draft.groupId }
        : null
  );

  const selectedCityGroup = cityGroups.options.find((option) => option.value === draft.cityGroupId);
  const cityOptions = useMemo(() => {
    const allowed = selectedCityGroup?.cities || [];
    if (!allowed.length) return cities;
    const allowedNames = new Set(allowed.map((city) => String(city).trim().toLowerCase()));
    return cities.filter((city) => allowedNames.has(String(city.value).trim().toLowerCase()));
  }, [cities, selectedCityGroup]);

  const allRows = data?.rows || [];
  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return allRows;
    return allRows.filter((row) => [
      row.city, row.dimensionName, row.supplierName, row.itemCode, row.itemName, row.documentNo,
    ].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [allRows, query]);
  const pages = Math.max(1, Math.ceil(filteredRows.length / perPage));
  const pageRows = filteredRows.slice((page - 1) * perPage, page * perPage);
  const first = filteredRows.length ? (page - 1) * perPage + 1 : 0;
  const last = Math.min(page * perPage, filteredRows.length);

  const metricColumn = applied.performanceType === 'salesRet'
    ? { key: 'returnAmount', label: 'SALES RET', amount: true }
    : applied.performanceType === 'profitPct'
      ? { key: 'performanceValue', label: 'PROFIT %', percent: true }
      : applied.performanceType === 'retProfitPct'
        ? { key: 'performanceValue', label: 'RET PROFIT %', percent: true }
        : { key: 'salesAmount', label: 'SALES AMT', amount: true };
  const dimensionLabel = {
    supplier: 'SUPPLIER NAME',
    item: 'ITEM NAME',
    group: 'ITEM GROUP',
    subGroup: 'SUB GROUP',
  }[applied.analysisType];
  const columns = applied.mode === 'detailed'
    ? [
      { key: 'date', label: 'DATE', date: true },
      { key: 'documentNo', label: 'DOCUMENT NO' },
      { key: 'city', label: 'CITY' },
      { key: 'supplierName', label: 'SUPPLIER NAME' },
      { key: 'itemCode', label: 'ITEM CODE' },
      { key: 'itemName', label: 'ITEM NAME' },
      { key: 'totalCost', label: 'TOTCOST', amount: true },
      { key: 'discount', label: 'DISC', amount: true },
      { key: 'tax', label: 'TAX', amount: true },
      { key: 'totalLanding', label: 'TOTLANDING', amount: true },
      metricColumn,
      { key: 'profitAmount', label: 'PROFIT AMT', amount: true },
      { key: applied.performanceType === 'salesRet' || applied.performanceType === 'retProfitPct' ? 'returnQty' : 'saleQty',
        label: applied.performanceType === 'salesRet' || applied.performanceType === 'retProfitPct' ? 'RETURN QTY' : 'SALE QTY',
        amount: true },
    ]
    : [
      { key: 'city', label: 'CITY' },
      { key: 'dimensionName', label: dimensionLabel },
      { key: 'totalCost', label: 'TOTCOST', amount: true },
      { key: 'discount', label: 'DISC', amount: true },
      { key: 'tax', label: 'TAX', amount: true },
      { key: 'totalLanding', label: 'TOTLANDING', amount: true },
      metricColumn,
      { key: 'profitAmount', label: 'PROFIT AMT', amount: true },
      { key: applied.performanceType === 'salesRet' || applied.performanceType === 'retProfitPct' ? 'returnQty' : 'saleQty',
        label: applied.performanceType === 'salesRet' || applied.performanceType === 'retProfitPct' ? 'RETURN QTY' : 'SALE QTY',
        amount: true },
      { key: 'netProfit', label: 'NET PROFIT', amount: true },
    ];
  const visibleColumns = columns.filter((column) => !hiddenColumns.includes(column.key));
  const totals = pageRows.reduce((sum, row) => {
    ['totalCost', 'discount', 'tax', 'totalLanding', 'salesAmount', 'returnAmount',
      'profitAmount', 'saleQty', 'returnQty', 'netProfit'].forEach((key) => {
      sum[key] += Number(row[key]) || 0;
    });
    return sum;
  }, {
    totalCost: 0, discount: 0, tax: 0, totalLanding: 0, salesAmount: 0, returnAmount: 0,
    profitAmount: 0, saleQty: 0, returnQty: 0, netProfit: 0,
  });

  useEffect(() => {
    if (!business) {
      setData(null);
      setError('Select a business in the top bar.');
      return undefined;
    }
    const controller = new AbortController();
    const params = new URLSearchParams({
      business,
      location: applied.location,
      finYear: finYear || '',
      fromDate: applied.fromDate,
      toDate: applied.toDate,
      mode: applied.mode,
      analysisType: applied.analysisType,
      performanceType: applied.performanceType,
      cityGroupId: applied.cityGroupId,
      city: applied.city,
      supplierId: applied.supplierId,
      groupId: applied.groupId,
      subGroupId: applied.subGroupId,
      itemId: applied.itemId,
      itemCode: applied.itemCode,
    });
    setLoading(true);
    setError('');
    fetch(`/api/reports/performance-log-report?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not load the performance report.');
        return result;
      })
      .then(setData)
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        setData(null);
        setError(requestError.message || 'Could not reach the server.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [business, finYear, applied]);

  function setFilter(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function search(event) {
    event.preventDefault();
    if (!draft.fromDate || !draft.toDate) {
      setError('Date From and Date To are required.');
      return;
    }
    if (draft.fromDate > draft.toDate) {
      setError('Date From must be on or before Date To.');
      return;
    }
    setError('');
    setPage(1);
    setApplied({ ...draft });
  }

  function reset() {
    const next = initialFilters();
    setDraft(next);
    setApplied(next);
    setQuery('');
    setPage(1);
    setPerPage(15);
    setHiddenColumns([]);
    setError('');
  }

  function toggleColumn(key) {
    setHiddenColumns((current) => (
      current.includes(key) ? current.filter((value) => value !== key) : [...current, key]
    ));
  }

  function exportRows(kind) {
    const headers = visibleColumns.map((column) => column.label);
    const values = filteredRows.map((row) => visibleColumns.map((column) => valueFor(row, column)));
    if (kind === 'csv') {
      download(
        'performance-log-report.csv',
        [headers, ...values].map((line) => line.map(csvCell).join(',')).join('\r\n'),
        'text/csv;charset=utf-8'
      );
    } else if (kind === 'excel') {
      download('performance-log-report.xls', toXlsHtml('Performance Log Report', headers, values), 'application/vnd.ms-excel');
    } else {
      printTable('Performance Log Report', headers, values);
    }
  }

  return (
    <>
      <div className="mb-3">
        <h2 className="flex items-center gap-2 text-[17px] font-bold text-ink">
          <Icon name="chart" size={18} /> Performance Log Report
        </h2>
        <p className="text-[13px] text-inkmuted">Sales, cost and profit by supplier, item, group or sub group.</p>
      </div>

      <section className="card">
        <header className="card-head">
          <span className="card-title"><Icon name="filter" size={15} /> Filters</span>
        </header>
        <form className="card-body space-y-3" onSubmit={search}>
          {error && <div className="flash flash-err">{error}</div>}
          <div className="grid gap-3 xl:grid-cols-3">
            <div>
              <span className="mb-1.5 block text-[12px] text-inkmuted">Report Mode</span>
              <ToggleGroup
                options={[{ value: 'summary', label: 'Summary' }, { value: 'detailed', label: 'Detailed' }]}
                value={draft.mode}
                onChange={(value) => setFilter('mode', value)}
              />
            </div>
            <div>
              <span className="mb-1.5 block text-[12px] text-inkmuted">Analysis Type</span>
              <ToggleGroup options={ANALYSIS_TYPES} value={draft.analysisType} onChange={(value) => setFilter('analysisType', value)} />
            </div>
            <div>
              <span className="mb-1.5 block text-[12px] text-inkmuted">Performance Type</span>
              <ToggleGroup options={PERFORMANCE_TYPES} value={draft.performanceType} onChange={(value) => setFilter('performanceType', value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2 xl:grid-cols-5">
            <SelectField label={<>Date From <span className="text-red-600">*</span></>}>
              <input className="f-input" type="date" value={draft.fromDate} onChange={(event) => setFilter('fromDate', event.target.value)} required />
            </SelectField>
            <SelectField label={<>Date To <span className="text-red-600">*</span></>}>
              <input className="f-input" type="date" value={draft.toDate} onChange={(event) => setFilter('toDate', event.target.value)} required />
            </SelectField>
            <SelectField label="Business Location">
              <MultiSelect mode="single" options={locations.options} value={draft.location}
                onChange={(value) => setFilter('location', value)} placeholder="All Locations"
                loading={locations.loading} error={locations.error} />
            </SelectField>
            <SelectField label="City Group">
              <MultiSelect mode="single" options={cityGroups.options} value={draft.cityGroupId}
                onChange={(value) => setDraft((current) => ({ ...current, cityGroupId: value, city: '' }))}
                placeholder="All" loading={cityGroups.loading} error={cityGroups.error} />
            </SelectField>
            <SelectField label="City">
              <MultiSelect mode="single" options={cityOptions} value={draft.city}
                onChange={(value) => setFilter('city', value)} placeholder="All Cities" />
            </SelectField>
            <SelectField label="Supplier">
              <MultiSelect mode="single" options={suppliers.options} value={draft.supplierId}
                onChange={(value) => setFilter('supplierId', value)} placeholder="All Suppliers"
                loading={suppliers.loading} error={suppliers.error} />
            </SelectField>
            <SelectField label="Item Group">
              <MultiSelect mode="single" options={groups.options} value={draft.groupId}
                onChange={(value) => setDraft((current) => ({ ...current, groupId: value, subGroupId: '', itemId: '' }))}
                placeholder="All Groups" loading={groups.loading} error={groups.error} />
            </SelectField>
            <SelectField label="Sub Group">
              <MultiSelect mode="single" options={subgroups.options.filter((option) => option.value !== draft.groupId)}
                value={draft.subGroupId}
                onChange={(value) => setDraft((current) => ({ ...current, subGroupId: value, itemId: '' }))}
                placeholder="All Sub Groups" loading={subgroups.loading} error={subgroups.error} />
            </SelectField>
            <SelectField label="Item Name">
              <MultiSelect mode="single" options={items.options} value={draft.itemId}
                onChange={(value) => setFilter('itemId', value)} placeholder="All Items"
                loading={items.loading} error={items.error} />
            </SelectField>
            <SelectField label="Item Code">
              <input className="f-input" value={draft.itemCode} onChange={(event) => setFilter('itemCode', event.target.value)} placeholder="Enter Item Code" />
            </SelectField>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <span className="flex-1 text-[12px] text-inkmuted">
              One row per {draft.analysisType === 'subGroup' ? 'sub group' : draft.analysisType === 'group' ? 'item group' : draft.analysisType}.
            </span>
            <button type="button" className="btn" onClick={reset}><Icon name="refresh" size={14} /> Reset</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
            </button>
          </div>
        </form>
      </section>

      <section className="card mt-4">
        <header className="card-head">
          <span className="card-title"><Icon name="grid" size={15} />
            {draft.analysisType === 'supplier' ? 'Supplier' : draft.analysisType === 'item' ? 'Item' : draft.analysisType === 'group' ? 'Item Group' : 'Sub Group'} {draft.mode === 'summary' ? 'Summary' : 'Details'}
          </span>
          <span className="pill pill-blue">{filteredRows.length} records</span>
        </header>
        <div className="card-body">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select className="f-input !w-auto" value={perPage} onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}>
              {[15, 25, 50, 100].map((size) => <option key={size} value={size}>{size} / page</option>)}
            </select>
            <div className="relative">
              <button type="button" className="btn" onClick={() => setColumnsOpen((open) => !open)}>
                <Icon name="cols" size={14} /> Columns
              </button>
              {columnsOpen && (
                <div className="absolute left-0 z-20 mt-1 max-h-72 min-w-[190px] overflow-auto rounded-md border border-line bg-white p-2 shadow-lg">
                  {columns.map((column) => (
                    <label key={column.key} className="flex cursor-pointer items-center gap-2 px-2 py-1.5 text-[13px]">
                      <input type="checkbox" checked={!hiddenColumns.includes(column.key)} onChange={() => toggleColumn(column.key)} />
                      {column.label}
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn" onClick={() => exportRows('csv')}><Icon name="file" size={14} /> Export to CSV</button>
            <button type="button" className="btn" onClick={() => exportRows('excel')}><Icon name="file" size={14} /> Export to Excel</button>
            <button type="button" className="btn" onClick={() => exportRows('print')}><Icon name="printer" size={14} /> Print</button>
            <span className="flex-1" />
            <input className="f-input !w-[190px]" type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="Search..." aria-label="Search report rows" />
          </div>

          <div className="overflow-x-auto">
            <table className="dt dt-nowrap-head">
              <thead><tr><th>#</th>{visibleColumns.map((column) => <th key={column.key} className={column.amount || column.percent ? 'text-right' : ''}>{column.label}</th>)}</tr></thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={visibleColumns.length + 1} className="dt-empty"><span className="spin" /></td></tr>
                ) : pageRows.length === 0 ? (
                  <tr><td colSpan={visibleColumns.length + 1} className="dt-empty">No matching sales were found for these filters.</td></tr>
                ) : pageRows.map((row, index) => (
                  <tr key={row._id}>
                    <td>{first + index}</td>
                    {visibleColumns.map((column) => (
                      <td key={column.key} className={column.amount || column.percent ? 'text-right' : ''}>{valueFor(row, column)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td colSpan="2">Total ({filteredRows.length} records)</td>
                  {visibleColumns.slice(1).map((column) => (
                    <td key={column.key} className={column.amount ? 'text-right' : ''}>
                      {column.amount && Object.prototype.hasOwnProperty.call(totals, column.key)
                        ? fmt('amount', totals[column.key])
                        : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px]">
            <span>Showing {first}–{last} of {filteredRows.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" className="btn" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))}><Icon name="chevL" size={14} /> Previous</button>
              <span>Page {page} of {pages}</span>
              <button type="button" className="btn" disabled={page >= pages || loading} onClick={() => setPage((current) => Math.min(pages, current + 1))}>Next <Icon name="chevR" size={14} /></button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
