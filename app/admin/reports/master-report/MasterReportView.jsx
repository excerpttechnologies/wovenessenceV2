'use client';

import { useCallback, useEffect, useState } from 'react';
import { useScope } from '@/components/ScopeContext';

const EMPTY_SUMMARY = { groups: [], rows: [], hasData: false };

function formatNumber(value) {
  return Number(value || 0).toLocaleString('en-IN');
}

function formatPercent(value) {
  return `${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}%`;
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function formatDate(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en-GB').format(new Date(value));
}

export default function MasterReportView() {
  const { finYear, businessReady } = useScope();
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [applied, setApplied] = useState(null);
  const [statementRows, setStatementRows] = useState([]);
  const [statementTotal, setStatementTotal] = useState(0);
  const [statementPages, setStatementPages] = useState(1);
  const [statementPage, setStatementPage] = useState(1);
  const [statementLoading, setStatementLoading] = useState(false);
  const [statementError, setStatementError] = useState('');

  useEffect(() => {
    if (!businessReady) return undefined;

    const controller = new AbortController();
    const params = new URLSearchParams({
      finYear: finYear || '',
      mode: 'summary',
    });
    setSummaryLoading(true);
    setSummaryError('');

    fetch(`/api/reports/master-report?${params}`, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Could not load the Master Report.');
        return result;
      })
      .then((result) => setSummary(result))
      .catch((requestError) => {
        if (requestError.name === 'AbortError') return;
        setSummary(EMPTY_SUMMARY);
        setSummaryError(requestError.message || 'Could not load the Master Report.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setSummaryLoading(false);
      });

    return () => controller.abort();
  }, [businessReady, finYear]);

  const loadStatement = useCallback(async () => {
    if (!applied || !businessReady) return;
    setStatementLoading(true);
    setStatementError('');
    try {
      const params = new URLSearchParams({
        finYear: finYear || '',
        mode: 'statement',
        fromDate: applied.fromDate,
        toDate: applied.toDate,
        page: String(statementPage),
        perPage: '25',
      });
      const response = await fetch(`/api/reports/master-report?${params}`, { cache: 'no-store' });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not load the Customer Performance Statement.');
      setStatementRows(result.rows || []);
      setStatementTotal(Number(result.total) || 0);
      setStatementPages(Math.max(1, Number(result.pages) || 1));
    } catch (requestError) {
      setStatementRows([]);
      setStatementTotal(0);
      setStatementPages(1);
      setStatementError(requestError.message || 'Could not load the Customer Performance Statement.');
    } finally {
      setStatementLoading(false);
    }
  }, [applied, businessReady, finYear, statementPage]);

  useEffect(() => {
    loadStatement();
  }, [loadStatement]);

  function search(event) {
    event.preventDefault();
    if (!fromDate || !toDate) {
      setStatementError('Date From and Date To are required.');
      return;
    }
    if (fromDate > toDate) {
      setStatementError('Date From must be on or before Date To.');
      return;
    }
    setStatementPage(1);
    setApplied({ fromDate, toDate });
  }

  function reset() {
    setFromDate('');
    setToDate('');
    setApplied(null);
    setStatementRows([]);
    setStatementTotal(0);
    setStatementPages(1);
    setStatementPage(1);
    setStatementError('');
  }

  const groups = summary.groups || [];

  return (
    <div className="space-y-5">
      <section className="card overflow-hidden">
        <div className="card-head">
          <span className="card-title">Master Report</span>
          <span className="pill pill-blue">{finYear || 'Financial year'}</span>
        </div>
        {summaryError && <div role="alert" className="flash flash-err mx-3 mt-3">{summaryError}</div>}
        <div className="overflow-x-auto p-3">
          <table className="dt min-w-[1050px] text-center">
            <thead>
              <tr>
                <th rowSpan={2} className="text-left">Business Name</th>
                {groups.map((group) => (
                  <th key={group.id} colSpan={4}>{group.label}</th>
                ))}
              </tr>
              <tr>
                {groups.flatMap((group) => (
                  ['Volume', '%', 'Value', '%'].map((column, index) => (
                    <th key={`${group.id}-${index}`}>{column}</th>
                  ))
                ))}
              </tr>
            </thead>
            <tbody>
              {summaryLoading ? (
                <tr><td colSpan={1 + groups.length * 4} className="dt-empty">Loading...</td></tr>
              ) : summary.rows?.length ? summary.rows.map((row) => (
                <tr key={row.key}>
                  <td className="text-left">{row.label}</td>
                  {groups.flatMap((group) => {
                    const value = row.values?.[group.id] || {};
                    return [
                      <td key={`${group.id}-volume`}>{formatNumber(value.volume)}</td>,
                      <td key={`${group.id}-volume-percent`}>{formatPercent(value.volumePercent)}</td>,
                      <td key={`${group.id}-value`}>{formatMoney(value.value)}</td>,
                      <td key={`${group.id}-value-percent`}>{formatPercent(value.valuePercent)}</td>,
                    ];
                  })}
                </tr>
              )) : (
                <tr>
                  <td colSpan={1 + groups.length * 4} className="dt-empty">
                    No POS invoices with customer records were found for this financial year.
                  </td>
                </tr>
              )}
              {!summaryLoading && summary.rows?.length > 0 && !summary.hasData && (
                <tr>
                  <td colSpan={1 + groups.length * 4} className="dt-empty">
                    No POS invoices with customer records were found for this financial year.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <span className="card-title">Customer Performance Statement</span>
        </div>
        <form onSubmit={search} className="card-body">
          {statementError && <div role="alert" className="flash flash-err mb-3">{statementError}</div>}
          <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Date From</span>
              <input
                type="date"
                className="f-input"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
              />
            </label>
            <label className="block text-[13px] text-ink">
              <span className="mb-1 block">Date To</span>
              <input
                type="date"
                className="f-input"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
              />
            </label>
            <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700" disabled={statementLoading}>
              Search
            </button>
            <button type="button" onClick={reset} className="rounded bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700">
              Reset
            </button>
          </div>
        </form>

        {applied && (
          <div className="overflow-x-auto">
            <div className="border-t border-line px-3 py-2 text-[13px] font-medium text-ink">
              Total Records: {statementTotal}
            </div>
            <table className="dt dt-nowrap-head">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Location</th>
                  <th>Customer Type</th>
                  <th className="text-right">Bills</th>
                  <th className="text-right">Sales Value</th>
                  <th>First Purchase</th>
                  <th>Last Purchase</th>
                </tr>
              </thead>
              <tbody>
                {statementLoading ? (
                  <tr><td colSpan={7} className="dt-empty">Loading...</td></tr>
                ) : statementRows.length ? statementRows.map((row) => (
                  <tr key={row.key}>
                    <td>{row.customer}</td>
                    <td>{row.location}</td>
                    <td>{row.type}</td>
                    <td className="text-right">{formatNumber(row.invoiceCount)}</td>
                    <td className="text-right">{formatMoney(row.value)}</td>
                    <td>{formatDate(row.firstPurchaseAt)}</td>
                    <td>{formatDate(row.lastPurchaseAt)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7} className="dt-empty">No customer sales found for the selected dates.</td></tr>
                )}
              </tbody>
            </table>
            <div className="flex items-center justify-end gap-2 border-t border-line bg-[#f7f9fc] px-3 py-2.5 text-[12px] text-inkmuted">
              <span>Page {statementPage} of {statementPages}</span>
              <button type="button" className="btn !px-2.5 !py-1" disabled={statementPage <= 1 || statementLoading}
                onClick={() => setStatementPage((current) => Math.max(1, current - 1))}>Previous</button>
              <button type="button" className="btn !px-2.5 !py-1" disabled={statementPage >= statementPages || statementLoading}
                onClick={() => setStatementPage((current) => Math.min(statementPages, current + 1))}>Next</button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
