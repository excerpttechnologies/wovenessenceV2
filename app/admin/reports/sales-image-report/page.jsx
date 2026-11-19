'use client';

import { useEffect, useMemo, useState } from 'react';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useOptions } from '@/components/useOptions';
import { useScope } from '@/components/ScopeContext';

function dateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initialFilters() {
  const today = new Date();
  const from = new Date(today);
  from.setMonth(from.getMonth() - 1);
  return {
    location: '',
    groupId: '',
    subGroupId: '',
    itemId: '',
    fromDate: dateValue(from),
    toDate: dateValue(today),
    qohMin: '',
    qohMax: '',
    rspMin: '',
    rspMax: '',
    rateMin: '',
    rateMax: '',
    sellQty: '',
    age: '',
    supplierId: '',
  };
}

function RangeField({ label, min, max, onChange }) {
  return (
    <div>
      <label className="mb-1 block text-[12px] text-[#26364b]">{label}</label>
      <div className="flex gap-1.5">
        <input
          type="number"
          min="0"
          className="f-input !h-[30px] !rounded-md !text-[12px]"
          placeholder="Start"
          value={min}
          onChange={(event) => onChange('min', event.target.value)}
        />
        <input
          type="number"
          min="0"
          className="f-input !h-[30px] !rounded-md !text-[12px]"
          placeholder="End"
          value={max}
          onChange={(event) => onChange('max', event.target.value)}
        />
      </div>
    </div>
  );
}

function SelectField({ label, children }) {
  return (
    <label className="block text-[12px] text-[#26364b]">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function ResultCard({ row }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <article className="overflow-hidden rounded-lg border border-line bg-white">
      {row.imageUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={row.imageUrl}
          alt={row.itemName || row.itemCode || 'Sold item'}
          className="h-48 w-full bg-[#f2f4f8] object-contain"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-48 items-center justify-center bg-[#f2f4f8] text-[#9aa6ba]">
          <Icon name="image" size={38} />
        </div>
      )}
      <div className="space-y-1.5 p-3 text-[12px]">
        <h3 className="truncate font-semibold text-ink" title={row.itemName}>
          {row.itemName || row.itemCode || 'Unnamed item'}
        </h3>
        <div className="truncate text-inkmuted">{row.itemCode || '-'}</div>
        {(row.groupName || row.subgroupName) && (
          <div className="truncate text-inkmuted">{[row.groupName, row.subgroupName].filter(Boolean).join(' / ')}</div>
        )}
        {row.supplier && <div className="truncate text-inkmuted" title={row.supplier}>{row.supplier}</div>}
        <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-line pt-2">
          <span className="text-inkmuted">Sell Qty</span><b className="text-right">{row.saleQty}</b>
          <span className="text-inkmuted">QOH</span><span className="text-right">{row.qoh}</span>
          <span className="text-inkmuted">RSP</span><span className="text-right">{row.rsp ?? '-'}</span>
          <span className="text-inkmuted">Purchase Rate</span><span className="text-right">{row.purchaseRate ?? '-'}</span>
          <span className="text-inkmuted">Sale Amount</span><b className="text-right">{Number(row.saleAmount || 0).toFixed(2)}</b>
        </div>
      </div>
    </article>
  );
}

export default function SalesImagePage() {
  const { business, finYear } = useScope();
  const [filters, setFilters] = useState(initialFilters);
  const [applied, setApplied] = useState(null);
  const [result, setResult] = useState(null);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(24);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const locations = useOptions('companylocations', '', Boolean(business));
  const groups = useOptions('product/group-parent', '', Boolean(business));
  const subgroups = useOptions(
    'product/group',
    '',
    Boolean(business && filters.groupId),
    filters.groupId ? { parentId: filters.groupId } : null
  );
  const items = useOptions(
    'item',
    '',
    Boolean(business),
    filters.subGroupId
      ? { groupId: filters.subGroupId }
      : filters.groupId
        ? { parentGroupId: filters.groupId }
        : null
  );
  const suppliers = useOptions('supplier', '', Boolean(business));

  const subgroupOptions = useMemo(() => (
    filters.groupId
      ? subgroups.options.filter((option) => option.value !== filters.groupId)
      : subgroups.options
  ), [filters.groupId, subgroups.options]);

  useEffect(() => {
    if (!applied || !business) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({
      business,
      location: applied.location,
      finYear: finYear || '',
      fromDate: applied.fromDate,
      toDate: applied.toDate,
      page: String(page),
      perPage: String(perPage),
    });
    Object.entries(applied).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });

    setLoading(true);
    setError('');
    fetch(`/api/reports/sales-image-report?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Could not load sales image results.');
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
  }, [business, finYear, applied, page, perPage]);

  function set(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function setRange(prefix, side, value) {
    set(prefix + (side === 'min' ? 'Min' : 'Max'), value);
  }

  function search(event) {
    event.preventDefault();
    if (!business) {
      setError('Select a business in the top bar.');
      return;
    }
    if (!filters.fromDate || !filters.toDate) {
      setError('Date From and Date To are required.');
      return;
    }
    if (filters.fromDate > filters.toDate) {
      setError('Date From must be on or before Date To.');
      return;
    }
    for (const [label, min, max] of [
      ['QOH', filters.qohMin, filters.qohMax],
      ['RSP', filters.rspMin, filters.rspMax],
      ['Purchase Rate', filters.rateMin, filters.rateMax],
    ]) {
      if ((min && Number(min) < 0) || (max && Number(max) < 0)) {
        setError(`${label} must be non-negative.`);
        return;
      }
      if (min && max && Number(min) > Number(max)) {
        setError(`${label} start must be less than or equal to end.`);
        return;
      }
    }
    if (filters.sellQty && Number(filters.sellQty) < 0) {
      setError('Sell quantity must be non-negative.');
      return;
    }
    setError('');
    setPage(1);
    setApplied({ ...filters });
  }

  return (
    <section className="stock-filter-card overflow-visible rounded-lg border border-[#dce3ed] bg-white shadow-sm">
      <header className="border-b border-[#e5eaf1] px-3.5 py-3 text-[13px] font-medium text-[#17283e]">
        Sales Image Report
      </header>
      <form className="p-3.5" onSubmit={search}>
        {error && <div className="flash flash-err mb-3">{error}</div>}
        <div className="grid grid-cols-1 gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          <SelectField label="Location">
            <MultiSelect
              mode="single"
              options={locations.options}
              value={filters.location}
              onChange={(value) => set('location', value)}
              placeholder="Select..."
              loading={locations.loading}
              error={locations.error}
            />
          </SelectField>

          <SelectField label="Group Name">
            <MultiSelect
              mode="single"
              options={groups.options}
              value={filters.groupId}
              onChange={(value) => {
                setFilters((current) => ({ ...current, groupId: value, subGroupId: '', itemId: '' }));
              }}
              placeholder="Select..."
              loading={groups.loading}
              error={groups.error}
            />
          </SelectField>

          <SelectField label="Subgroup Name">
            <MultiSelect
              mode="single"
              options={subgroupOptions}
              value={filters.subGroupId}
              onChange={(value) => setFilters((current) => ({ ...current, subGroupId: value, itemId: '' }))}
              placeholder="Select..."
              loading={subgroups.loading}
              error={subgroups.error}
            />
          </SelectField>

          <SelectField label="Items">
            <MultiSelect
              mode="single"
              options={items.options}
              value={filters.itemId}
              onChange={(value) => set('itemId', value)}
              placeholder="Select..."
              loading={items.loading}
              error={items.error}
            />
          </SelectField>

          <SelectField label={<>Date From <span className="text-red-600">*</span></>}>
            <input
              className="f-input !h-[30px] !rounded-md !text-[12px]"
              type="date"
              value={filters.fromDate}
              onChange={(event) => set('fromDate', event.target.value)}
              required
            />
          </SelectField>

          <SelectField label={<>Date To <span className="text-red-600">*</span></>}>
            <input
              className="f-input !h-[30px] !rounded-md !text-[12px]"
              type="date"
              value={filters.toDate}
              onChange={(event) => set('toDate', event.target.value)}
              required
            />
          </SelectField>

          <RangeField
            label="RSP Filter"
            min={filters.rspMin}
            max={filters.rspMax}
            onChange={(side, value) => setRange('rsp', side, value)}
          />

          <RangeField
            label="Purchase Rate Filter"
            min={filters.rateMin}
            max={filters.rateMax}
            onChange={(side, value) => setRange('rate', side, value)}
          />

          <RangeField
            label="QOH"
            min={filters.qohMin}
            max={filters.qohMax}
            onChange={(side, value) => setRange('qoh', side, value)}
          />

          <SelectField label="Age">
            <select
              className="f-input !h-[30px] !rounded-md !text-[12px]"
              value={filters.age}
              onChange={(event) => set('age', event.target.value)}
            >
              <option value="">Select...</option>
              <option value="0-30">0-30 days</option>
              <option value="31-60">31-60 days</option>
              <option value="61-90">61-90 days</option>
              <option value="91+">91+ days</option>
            </select>
          </SelectField>

          <SelectField label="Supplier">
            <MultiSelect
              mode="single"
              options={suppliers.options}
              value={filters.supplierId}
              onChange={(value) => set('supplierId', value)}
              placeholder="Select Supplier"
              loading={suppliers.loading}
              error={suppliers.error}
            />
          </SelectField>

          <SelectField label="Sell Qty">
            <input
              type="search"
              className="f-input !h-[30px] !rounded-md !text-[12px]"
              placeholder="Search by sell quantity."
              value={filters.sellQty}
              onChange={(event) => set('sellQty', event.target.value)}
              inputMode="decimal"
            />
          </SelectField>
        </div>

        <div className="mt-2 flex justify-center">
          <button
            type="submit"
            disabled={loading}
            className="flex h-[34px] min-w-[155px] items-center justify-center gap-2 rounded-md bg-[#707980] px-4 text-[13px] font-medium text-white hover:bg-[#5d666e]"
          >
            {loading ? <span className="spin" /> : <Icon name="search" size={15} />} Search
          </button>
        </div>
      </form>

      {applied && (
        <div className="border-t border-[#e5eaf1] p-3.5">
          {loading ? (
            <div className="dt-empty"><span className="spin" /></div>
          ) : result && result.rows.length ? (
            <>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <b className="text-[13px] text-ink">{result.total} items found</b>
                <span className="text-[12px] text-inkmuted">
                  Sell Qty {Number(result.totals.saleQty || 0).toLocaleString()} · Sales {Number(result.totals.saleAmount || 0).toFixed(2)}
                </span>
                <span className="flex-1" />
                <select
                  className="f-input !w-auto"
                  value={perPage}
                  onChange={(event) => { setPerPage(Number(event.target.value)); setPage(1); }}
                  aria-label="Results per page"
                >
                  {[24, 48, 96].map((size) => <option key={size} value={size}>{size} / page</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {result.rows.map((row) => <ResultCard key={row._id} row={row} />)}
              </div>
              <div className="mt-3 flex items-center justify-end gap-2 text-[13px]">
                <button type="button" className="btn" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1}>
                  Previous
                </button>
                <span>Page {page} of {result.pages}</span>
                <button type="button" className="btn" onClick={() => setPage((current) => Math.min(result.pages, current + 1))} disabled={page >= result.pages}>
                  Next
                </button>
              </div>
            </>
          ) : (
            <div className="dt-empty">
              {!result?.sourceDocuments
                ? 'No sales documents were found for this business, date range, and location. Check the selected dates, location, and business.'
                : !result?.sourceLines
                  ? 'Sales documents were found, but they do not contain any item lines.'
                  : 'Sales items were found, but none match these filters. Try clearing some filters.'}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
