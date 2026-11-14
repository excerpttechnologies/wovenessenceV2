'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useOptions } from '@/components/useOptions';
import { useScope } from '@/components/ScopeContext';

const TABS = [
  { key: 'group', label: 'Group Wise' },
  { key: 'subgroup', label: 'Subgroup Wise' },
  { key: 'item', label: 'Item Code Wise' },
];

const COLUMNS = {
  group: [
    { key: 'location', label: 'Location', align: 'left' },
    { key: 'group', label: 'Group Name', align: 'left' },
    { key: 'qty', label: 'Total Qty' },
    { key: 'cpValue', label: 'CP Value' },
    { key: 'rspValue', label: 'RSP Value' },
    { key: 'wspValue', label: 'WSP Value' },
  ],
  subgroup: [
    { key: 'location', label: 'Location', align: 'left' },
    { key: 'group', label: 'Group Name', align: 'left' },
    { key: 'subGroup', label: 'Sub Group Name', align: 'left' },
    { key: 'qty', label: 'Total Qty' },
    { key: 'cpValue', label: 'CP Value' },
    { key: 'rspValue', label: 'RSP Value' },
    { key: 'wspValue', label: 'WSP Value' },
  ],
  item: [
    { key: 'location', label: 'Location', align: 'left' },
    { key: 'group', label: 'Group Name', align: 'left' },
    { key: 'subGroup', label: 'Sub Group Name', align: 'left' },
    { key: 'itemCode', label: 'Item Code', align: 'left' },
    { key: 'ecomId', label: 'ECom ID', align: 'left' },
    { key: 'itemName', label: 'Item Name', align: 'left' },
    { key: 'printDescription', label: 'Print Description', align: 'left' },
    { key: 'consignment', label: 'Consignment', align: 'left' },
    { key: 'qty', label: 'Total Qty' },
    { key: 'cpValue', label: 'CP Value' },
    { key: 'rspValue', label: 'RSP Value' },
    { key: 'wspValue', label: 'WSP Value' },
    { key: 'attribute', label: 'Attribute', align: 'left' },
  ],
};

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function amount(value) {
  return Number(value || 0).toFixed(2);
}

export default function StockSummaryView() {
  const { business, location, finYear } = useScope();
  const locationOptions = useOptions('companylocations');
  const [filters, setFilters] = useState({
    location: location || '',
    asOnDate: today(),
    stockType: '',
    group: '',
    subGroup: '',
  });
  const [appliedFilters, setAppliedFilters] = useState({
    location: location || '',
    asOnDate: today(),
    stockType: '',
    group: '',
    subGroup: '',
  });
  const [groupOptions, setGroupOptions] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState('');
  const [stockTypes, setStockTypes] = useState([]);
  const [tab, setTab] = useState('group');
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(15);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [totals, setTotals] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const columns = COLUMNS[tab];
  const pageCount = Math.max(1, Math.ceil(total / rowsPerPage));
  const subGroupOptions = useMemo(
    () => groupOptions.filter((option) => option.parentId === filters.group),
    [groupOptions, filters.group]
  );

  useEffect(() => {
    setFilters((current) => ({ ...current, location: location || '' }));
    setAppliedFilters((current) => ({ ...current, location: location || '' }));
  }, [location]);

  useEffect(() => {
    if (!business) {
      setGroupOptions([]);
      return;
    }
    let active = true;
    setGroupsLoading(true);
    setGroupsError('');
    fetch(`/api/reports/stock-summary?options=1&business=${encodeURIComponent(business)}`, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not load product groups.');
        return result;
      })
      .then((result) => {
        if (active) setGroupOptions(result.groups || []);
      })
      .catch((requestError) => {
        if (active) setGroupsError(requestError.message || 'Could not load product groups.');
      })
      .finally(() => {
        if (active) setGroupsLoading(false);
      });
    return () => { active = false; };
  }, [business]);

  const load = useCallback(async () => {
    if (!business) {
      setRows([]);
      setTotal(0);
      setError('Select a business in the top bar.');
      return;
    }
    if (!appliedFilters.asOnDate) {
      setError('As on Date is required.');
      return;
    }

    const params = new URLSearchParams({
      business,
      location: appliedFilters.location || '',
      finYear: finYear || '',
      asOnDate: appliedFilters.asOnDate,
      stockType: appliedFilters.stockType || '',
      group: appliedFilters.group || '',
      subGroup: appliedFilters.subGroup || '',
      tab,
      page: String(page),
      perPage: String(rowsPerPage),
    });
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/reports/stock-summary?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load the Stock Summary Report.');
      setRows(result.rows || []);
      setTotal(Number(result.total) || 0);
      setTotals(result.totals || {});
      setStockTypes(result.stockTypes || []);
    } catch (requestError) {
      setRows([]);
      setTotal(0);
      setTotals({});
      setError(requestError.message || 'Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, [business, appliedFilters, finYear, tab, page, rowsPerPage]);

  useEffect(() => { load(); }, [load]);

  const tableTotal = useMemo(() => columns.reduce((sum, column) => {
    if (['qty', 'cpValue', 'rspValue', 'wspValue'].includes(column.key)) {
      sum[column.key] = rows.reduce((value, row) => value + (Number(row[column.key]) || 0), 0);
    }
    return sum;
  }, {}), [columns, rows]);

  function search() {
    setAppliedFilters({ ...filters });
    setPage(1);
  }

  return (
    <div className="space-y-3">
      <section className="card overflow-visible">
        <div className="card-head">
          <span className="card-title">Stock Summary Report</span>
        </div>
        <div className="card-body">
          {error && <div className="flash flash-err mb-3">{error}</div>}
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 xl:grid-cols-[1.1fr_1.1fr_1.1fr_1.1fr_1.1fr_1.1fr]">
            <label className="block text-[12px] text-ink">
              <span className="mb-1 block">Business Location <b className="text-danger">*</b></span>
              <MultiSelect
                mode="single"
                options={[{ value: '', label: 'All' }, ...locationOptions.options]}
                value={filters.location}
                onChange={(value) => setFilters((current) => ({ ...current, location: value }))}
                placeholder="All"
                loading={locationOptions.loading}
                error={locationOptions.error}
              />
            </label>
            <label className="block text-[12px] text-ink">
              <span className="mb-1 block">As on Date <b className="text-danger">*</b></span>
              <input type="date" className="f-input" value={filters.asOnDate}
                onChange={(event) => setFilters((current) => ({ ...current, asOnDate: event.target.value }))} />
            </label>
            <label className="block text-[12px] text-ink">
              <span className="mb-1 block">Stock Type <b className="text-danger">*</b></span>
              <select className="f-input" value={filters.stockType}
                onChange={(event) => setFilters((current) => ({ ...current, stockType: event.target.value }))}>
                <option value="">All</option>
                {stockTypes.map((stockType) => <option key={stockType} value={stockType}>{stockType}</option>)}
              </select>
            </label>
            <label className="block text-[12px] text-ink">
              <span className="mb-1 block">Group</span>
              <select className="f-input" value={filters.group} disabled={groupsLoading || Boolean(groupsError)}
                onChange={(event) => setFilters((current) => ({ ...current, group: event.target.value, subGroup: '' }))}>
                <option value="">{groupsLoading ? 'Loading...' : 'Select...'}</option>
                {groupOptions.filter((option) => !option.parentId).map((option) =>
                  <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
              {groupsError && <span className="mt-1 block text-[11px] text-danger">{groupsError}</span>}
            </label>
            <label className="block text-[12px] text-ink">
              <span className="mb-1 block">Sub Group</span>
              <select className="f-input" value={filters.subGroup} disabled={!filters.group || groupsLoading}
                onChange={(event) => setFilters((current) => ({ ...current, subGroup: event.target.value }))}>
                <option value="">{!filters.group ? 'Select group first' : groupsLoading ? 'Loading...' : 'Select...'}</option>
                {subGroupOptions.map((option) =>
                  <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
            <button type="button" className="btn btn-primary justify-center" onClick={search} disabled={loading}>
              {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
            </button>
          </div>
        </div>
      </section>

      <section className="card overflow-hidden">
        <div className="flex flex-wrap items-center border-b border-line px-3 pt-2">
          {TABS.map((entry) => (
            <button key={entry.key} type="button"
              className={`border-b-2 px-3 py-2 text-[13px] ${tab === entry.key
                ? 'border-brand bg-white font-semibold text-ink'
                : 'border-transparent text-brand hover:bg-[#f7f9fc]'}`}
              onClick={() => { setTab(entry.key); setPage(1); }}>
              {entry.label}
            </button>
          ))}
        </div>
        <div className="border-b border-line px-3 py-2 text-[13px] text-ink">
          <strong>Total Records: {total}</strong>
        </div>
        <div className="overflow-x-auto p-3">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-white">
                {columns.map((column) => (
                  <th key={column.key} className={`border border-line px-2.5 py-1 text-[12px] font-semibold text-ink ${column.align === 'left' ? 'text-left' : 'text-right'}`}>
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={columns.length} className="dt-empty">Loading stock summary...</td></tr>
              ) : rows.length ? rows.map((row, index) => (
                <tr key={row._id} className={index % 2 ? 'bg-[#f0f1f3]' : 'bg-white'}>
                  {columns.map((column) => (
                    <td key={column.key} className={`border border-line px-2.5 py-1 text-inkmuted ${column.align === 'left' ? 'text-left' : 'text-right'}`}>
                      {['qty', 'cpValue', 'rspValue', 'wspValue'].includes(column.key)
                        ? amount(row[column.key])
                        : column.key === 'ecomId' && row[column.key]
                          ? <span className="font-medium text-brand">{row[column.key]}</span>
                          : row[column.key] || ''}
                    </td>
                  ))}
                </tr>
              )) : (
                <tr><td colSpan={columns.length} className="dt-empty">No stock found for the selected filters.</td></tr>
              )}
            </tbody>
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr>
                  {columns.map((column, index) => (
                    <td key={column.key} className={`border border-line px-2.5 py-1.5 font-bold text-ink ${column.align === 'left' ? 'text-left' : 'text-right'}`}>
                      {index === columns.findIndex((column) => column.key === 'qty') - 1 ? 'Total' :
                        Object.prototype.hasOwnProperty.call(tableTotal, column.key) ? amount(tableTotal[column.key]) : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-line px-3 py-2 text-[12px] text-inkmuted">
          <label className="flex items-center gap-2">
            Rows
            <select className="f-input !w-auto" value={rowsPerPage}
              onChange={(event) => { setRowsPerPage(Number(event.target.value)); setPage(1); }}>
              {[15, 25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <span>Page {page} of {pageCount}</span>
          <div className="flex gap-1.5">
            <button type="button" className="btn !px-2.5 !py-1" disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
            <button type="button" className="btn !px-2.5 !py-1" disabled={page >= pageCount || loading}
              onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button>
          </div>
        </div>
      </section>
    </div>
  );
}
