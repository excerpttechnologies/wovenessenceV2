'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LuCircleX, LuLoaderCircle, LuSearch, LuUserRound } from 'react-icons/lu';
import { useScope } from '@/components/ScopeContext';

const PAGE_SIZE = 15;
const amount = (value) => new Intl.NumberFormat('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(Number(value) || 0);

function dateText(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date).replaceAll('/', '-');
}

function formatName(customer) {
  const name = customer?.name || '';
  const code = customer?.code || '';
  const contactId = customer?.contactId || '';
  return `${name}${code ? ` (${code})` : ''}${contactId && contactId !== code ? ` (${contactId})` : ''}`;
}

function DetailTable({ rows, empty }) {
  return (
    <table className="w-full border-collapse text-sm">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label} className="border-b border-slate-100 last:border-0">
            <th className="w-[45%] py-2 pr-3 text-left font-medium text-slate-600">{label}</th>
            <td className="py-2 text-slate-800">{empty ? '' : value || '-'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function CustomerReportPage() {
  const { business, location, finYear, businessReady, locationReady } = useScope();
  const scopeQuery = useMemo(() => new URLSearchParams({
    business: business || '',
    location: location || '',
    finYear: finYear || '',
  }).toString(), [business, location, finYear]);
  const scopeKey = `${business}|${location}|${finYear}`;

  const [query, setQuery] = useState('');
  const [options, setOptions] = useState([]);
  const [selected, setSelected] = useState(null);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeOption, setActiveOption] = useState(-1);
  const [validation, setValidation] = useState('');
  const [activeTab, setActiveTab] = useState('bills');
  const [pages, setPages] = useState({ bills: 1, items: 1 });
  const [cache, setCache] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const inputRef = useRef(null);
  const lastScopeKey = useRef(scopeKey);
  const summaryRequestId = useRef(0);
  const reportRequestId = useRef(0);
  const cacheKey = `${scopeKey}:${selected?.id || ''}:${activeTab}:${pages[activeTab]}`;
  const data = cache[cacheKey] || null;

  const request = useCallback(async (url, signal) => {
    const response = await fetch(url, { cache: 'no-store', ...(signal ? { signal } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The request failed.');
    return result;
  }, []);

  const loadSummary = useCallback(async (customerId) => {
    const requestId = ++summaryRequestId.current;
    setSummaryLoading(true);
    try {
      const result = await request(`/api/reports/customer-report/summary?${scopeQuery}&customerId=${encodeURIComponent(customerId)}`);
      if (requestId === summaryRequestId.current) {
        setSummary(result);
        setError('');
      }
    } catch (loadError) {
      if (requestId === summaryRequestId.current) {
        setSummary(null);
        setError(loadError.message || 'Unable to load customer details.');
      }
    } finally {
      if (requestId === summaryRequestId.current) setSummaryLoading(false);
    }
  }, [request, scopeQuery]);

  const loadTab = useCallback(async (tab, page, customerId) => {
    const requestId = ++reportRequestId.current;
    const key = `${scopeKey}:${customerId}:${tab}:${page}`;
    setLoading(true);
    setError('');
    try {
      const endpoint = tab === 'bills' ? 'bills' : 'items';
      const result = await request(
        `/api/reports/customer-report/${endpoint}?${scopeQuery}&customerId=${encodeURIComponent(customerId)}&page=${page}&pageSize=${PAGE_SIZE}`
      );
      setCache((current) => ({ ...current, [key]: result }));
    } catch (loadError) {
      if (requestId === reportRequestId.current) setError(loadError.message || 'Unable to load the report.');
    } finally {
      if (requestId === reportRequestId.current) setLoading(false);
    }
  }, [request, scopeKey, scopeQuery]);

  useEffect(() => {
    const term = query.trim();
    if (!business || term.length < 2 || (selected && term === formatName(selected))) {
      setOptions([]);
      setSearchLoading(false);
      setSearchError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setSearchLoading(true);
      setSearchError('');
      try {
        const result = await request(
          `/api/reports/customers/search?business=${encodeURIComponent(business)}&q=${encodeURIComponent(term)}&limit=30`,
          controller.signal
        );
        if (!controller.signal.aborted) {
          setOptions(Array.isArray(result) ? result : result.rows || []);
          setActiveOption(-1);
        }
      } catch (searchFailure) {
        if (!controller.signal.aborted) {
          setOptions([]);
          setSearchError(searchFailure.message || 'Unable to search customers.');
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [business, query, request, selected]);

  useEffect(() => {
    if (lastScopeKey.current === scopeKey) return;
    const previousBusiness = String(lastScopeKey.current).split('|')[0];
    lastScopeKey.current = scopeKey;
    summaryRequestId.current += 1;
    reportRequestId.current += 1;
    setSummaryLoading(false);
    setLoading(false);
    setCache({});
    setPages({ bills: 1, items: 1 });
    if (previousBusiness !== String(business)) {
      setSelected(null);
      setSummary(null);
      setQuery('');
      setHasSearched(false);
      setActiveTab('bills');
      return;
    }
    if (selected) loadSummary(selected.id);
    if (selected && hasSearched) loadTab(activeTab, 1, selected.id);
  }, [business, scopeKey, selected, hasSearched, activeTab, loadSummary, loadTab]);

  const selectCustomer = (customer) => {
    reportRequestId.current += 1;
    setSelected(customer);
    setSummary(null);
    setCache({});
    setPages({ bills: 1, items: 1 });
    setActiveTab('bills');
    setHasSearched(false);
    setError('');
    setValidation('');
    setDropdownOpen(false);
    setQuery(formatName(customer));
    loadSummary(customer.id);
  };

  const runSearch = () => {
    if (!selected) {
      setValidation('Please select a customer first.');
      inputRef.current?.focus();
      return;
    }
    setValidation('');
    setHasSearched(true);
    setPages((current) => ({ ...current, [activeTab]: 1 }));
    loadTab(activeTab, 1, selected.id);
  };

  const changeTab = (tab) => {
    setActiveTab(tab);
    if (!selected || !hasSearched) return;
    const key = `${scopeKey}:${selected.id}:${tab}:1`;
    setPages((current) => ({ ...current, [tab]: 1 }));
    if (!cache[key]) loadTab(tab, 1, selected.id);
  };

  const changePage = (page) => {
    if (!selected || !hasSearched) return;
    setPages((current) => ({ ...current, [activeTab]: page }));
    const key = `${scopeKey}:${selected.id}:${activeTab}:${page}`;
    if (!cache[key]) loadTab(activeTab, page, selected.id);
  };

  const reset = () => {
    summaryRequestId.current += 1;
    reportRequestId.current += 1;
    setQuery('');
    setOptions([]);
    setSelected(null);
    setSummary(null);
    setValidation('');
    setSearchError('');
    setError('');
    setDropdownOpen(false);
    setSummaryLoading(false);
    setLoading(false);
    setActiveTab('bills');
    setPages({ bills: 1, items: 1 });
    setCache({});
    setHasSearched(false);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setDropdownOpen(true);
      setActiveOption((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveOption((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && dropdownOpen && activeOption >= 0) {
      event.preventDefault();
      selectCustomer(options[activeOption]);
    } else if (event.key === 'Escape') {
      setDropdownOpen(false);
    }
  };

  const rows = data?.records || [];
  const totals = data?.totals || {};
  const totalPages = Math.max(1, data?.totalPages || 0);
  const currentPage = pages[activeTab];
  const summaryLeft = [
    ['Customer Name', summary?.customerName],
    ['Mobile No.', summary?.mobile],
    ['Contact ID', summary?.contactId],
    ['State', summary?.state],
    ['GSTIN', summary?.gstin],
  ];
  const summaryRight = [
    ['Date of First Sale', dateText(summary?.firstSaleDate)],
    ['Location of First Sale', summary?.firstSaleLocation],
    ['Date of Last Visit', dateText(summary?.lastVisitDate)],
    ['Location of Last Visit', summary?.lastVisitLocation],
    ['Total Sale Till Date', summary ? amount(summary.totalSaleTillDate) : ''],
  ];

  return (
    <main className="space-y-4 p-4 md:p-6">
      <h1 className="text-xl font-semibold text-slate-800">Customer Report</h1>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start">
          <div className="relative min-w-0 flex-1">
            <label htmlFor="customer-search" className="mb-1.5 block text-sm font-medium text-slate-700">
              <span className="inline-flex items-center gap-2"><LuUserRound size={16} /> Select Customer</span>
            </label>
            <input
              ref={inputRef}
              id="customer-search"
              type="text"
              value={query}
              autoComplete="off"
              placeholder="Search customer name, code or mobile"
              aria-expanded={dropdownOpen}
              aria-controls="customer-options"
              aria-autocomplete="list"
              onFocus={() => setDropdownOpen(true)}
              onChange={(event) => {
                summaryRequestId.current += 1;
                reportRequestId.current += 1;
                setQuery(event.target.value);
                setSelected(null);
                setSummary(null);
                setSummaryLoading(false);
                setLoading(false);
                setHasSearched(false);
                setCache({});
                setOptions([]);
                setActiveOption(-1);
                setValidation('');
                setDropdownOpen(true);
              }}
              onKeyDown={handleKeyDown}
              className="h-10 w-full rounded-md border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            {dropdownOpen && query.trim().length >= 2 && (
              <div id="customer-options" role="listbox" className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                {searchLoading && (
                  <div className="flex items-center gap-2 px-3 py-3 text-sm text-slate-500">
                    <LuLoaderCircle className="animate-spin" size={16} /> Searching customers...
                  </div>
                )}
                {!searchLoading && searchError && <p className="px-3 py-3 text-sm text-red-600">{searchError}</p>}
                {!searchLoading && !searchError && options.length === 0 && (
                  <p className="px-3 py-3 text-sm text-slate-500">No customers found.</p>
                )}
                {!searchLoading && options.map((customer, index) => (
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === activeOption}
                    key={customer.id}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveOption(index)}
                    onClick={() => selectCustomer(customer)}
                    className={`block w-full border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-blue-50 ${index === activeOption ? 'bg-blue-50' : ''}`}
                  >
                    <span className="block truncate text-sm font-medium text-slate-800">{formatName(customer)}</span>
                    <span className="mt-0.5 block text-xs text-slate-500">Mobile: {customer.mobile || '-'}</span>
                  </button>
                ))}
              </div>
            )}
            {validation && <p role="alert" className="mt-1.5 text-xs text-red-600">{validation}</p>}
          </div>
          <div className="flex gap-2 pt-0 md:pt-[26px]">
            <button type="button" onClick={runSearch} className="inline-flex h-10 items-center gap-2 rounded-md bg-slate-600 px-4 text-sm font-medium text-white hover:bg-slate-700">
              <LuSearch size={16} /> Search
            </button>
            <button type="button" onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-md bg-red-600 px-4 text-sm font-medium text-white hover:bg-red-700">
              <LuCircleX size={16} /> Reset
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-800">Customer Details</h2>
          {summaryLoading && <LuLoaderCircle className="animate-spin text-blue-600" size={18} aria-label="Loading customer details" />}
        </div>
        <div className="grid gap-x-8 md:grid-cols-2">
          <DetailTable rows={summaryLeft} empty={!selected} />
          <DetailTable rows={summaryRight} empty={!selected} />
        </div>
      </section>

      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="flex border-b border-slate-200 px-4 pt-2">
          {[
            ['bills', 'Bill Wise Summary'],
            ['items', 'Item Wise'],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => changeTab(key)}
              className={`border-b-2 px-4 py-3 text-sm font-medium ${activeTab === key ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="p-4">
          <div className="mb-3 flex min-h-6 items-center justify-between">
            <p className="text-sm font-medium text-slate-700">Total Records: {data?.totalRecords ?? 0}</p>
            {loading && <span className="inline-flex items-center gap-2 text-xs text-slate-500"><LuLoaderCircle className="animate-spin" size={15} /> Loading</span>}
          </div>
          {error && <p role="alert" className="mb-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {!hasSearched && !loading && (
            <div className="rounded-md border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">
              Select a customer and press Search to view report records.
            </div>
          )}
          {(hasSearched || loading) && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-600">
                  {activeTab === 'bills' ? (
                    <tr>
                      <th className="px-3 py-2.5">Location</th>
                      <th className="px-3 py-2.5">Inv No</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5 text-right">Bill Value</th>
                      <th className="px-3 py-2.5 text-right">Taxable Value</th>
                      <th className="px-3 py-2.5 text-right">Tax</th>
                    </tr>
                  ) : (
                    <tr>
                      <th className="px-3 py-2.5">Location</th>
                      <th className="px-3 py-2.5">Inv No</th>
                      <th className="px-3 py-2.5">Date</th>
                      <th className="px-3 py-2.5">Item Code</th>
                      <th className="px-3 py-2.5">Item Name</th>
                      <th className="px-3 py-2.5 text-right">Qty</th>
                      <th className="px-3 py-2.5 text-right">Rate</th>
                      <th className="px-3 py-2.5 text-right">Taxable Value</th>
                      <th className="px-3 py-2.5 text-right">Tax</th>
                      <th className="px-3 py-2.5 text-right">Amount</th>
                    </tr>
                  )}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && !data && (
                    <tr><td colSpan={activeTab === 'bills' ? 6 : 10} className="py-9 text-center text-slate-500">Loading report data...</td></tr>
                  )}
                  {!loading && rows.length === 0 && (
                    <tr><td colSpan={activeTab === 'bills' ? 6 : 10} className="py-9 text-center text-slate-500">No Data Found</td></tr>
                  )}
                  {rows.map((row) => activeTab === 'bills' ? (
                    <tr key={row.id} className="text-slate-700">
                      <td className="px-3 py-2.5">{row.location || '-'}</td>
                      <td className="px-3 py-2.5">{row.invNo || '-'}</td>
                      <td className="px-3 py-2.5">{dateText(row.date) || '-'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.billValue)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.taxableValue)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.tax)}</td>
                    </tr>
                  ) : (
                    <tr key={row.id} className="text-slate-700">
                      <td className="px-3 py-2.5">{row.location || '-'}</td>
                      <td className="px-3 py-2.5">{row.invNo || '-'}</td>
                      <td className="px-3 py-2.5">{dateText(row.date) || '-'}</td>
                      <td className="px-3 py-2.5">{row.itemCode || '-'}</td>
                      <td className="px-3 py-2.5">{row.itemName || '-'}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.qty)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.rate)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.taxableValue)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.tax)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums">{amount(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                  {activeTab === 'bills' ? (
                    <tr>
                      <td className="px-3 py-3" colSpan={3}>Total</td>
                      <td className="px-3 py-3 text-right tabular-nums">{amount(totals.billValue)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{amount(totals.taxableValue)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{amount(totals.tax)}</td>
                    </tr>
                  ) : (
                    <tr>
                      <td className="px-3 py-3" colSpan={5}>Total</td>
                      <td className="px-3 py-3 text-right tabular-nums">{amount(totals.qty)}</td>
                      <td className="px-3 py-3 text-right">-</td>
                      <td className="px-3 py-3 text-right tabular-nums">{amount(totals.taxableValue)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{amount(totals.tax)}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{amount(totals.amount)}</td>
                    </tr>
                  )}
                </tfoot>
              </table>
            </div>
          )}
          {hasSearched && (
            <div className="mt-4 flex items-center justify-end gap-3 text-sm text-slate-600">
              <span>Page {currentPage} of {totalPages}</span>
              <button
                type="button"
                disabled={currentPage <= 1 || loading}
                onClick={() => changePage(currentPage - 1)}
                className="rounded border border-slate-300 px-3 py-1.5 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >Previous</button>
              <button
                type="button"
                disabled={currentPage >= totalPages || loading}
                onClick={() => changePage(currentPage + 1)}
                className="rounded border border-slate-300 px-3 py-1.5 enabled:hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >Next</button>
            </div>
          )}
        </div>
      </section>
      {businessReady && locationReady && !business && (
        <p role="alert" className="text-sm text-amber-700">Select a company from the header to search customers.</p>
      )}
    </main>
  );
}
