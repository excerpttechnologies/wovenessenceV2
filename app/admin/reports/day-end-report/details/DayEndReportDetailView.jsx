'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata' }).format(date);
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(date);
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

export default function DayEndReportDetailView({ businessId, locationId, date, finYear }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (requestedPage = 1) => {
    if (!businessId || !locationId || !date) {
      setError('The selected report row is missing its business, location, or date.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const query = new URLSearchParams({
      businessId,
      locationId,
      date,
      finYear,
      page: String(requestedPage),
      pageSize: '25',
    });

    try {
      const response = await fetch(`/api/reports/day-end-report/detail?${query.toString()}`, {
        cache: 'no-store',
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load POS details.');
      setData(result);
      setPage(Number(result.page) || requestedPage);
      setPages(Math.max(1, Number(result.pages) || 1));
    } catch (requestError) {
      setError(requestError.message || 'Unable to load POS details.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [businessId, locationId, date, finYear]);

  useEffect(() => {
    load(1);
  }, [load]);

  return (
    <div className="min-h-full bg-[#e8edf6] p-3 md:p-6 print:bg-white">
      <div className="mx-auto max-w-4xl">
        {error && <div role="alert" className="flash flash-err mb-3">{error}</div>}
        {loading && !data && <div className="card p-6 text-center text-sm text-inkmuted">Loading POS details...</div>}

        {data && (
          <>
            <main className="card p-4 md:p-6 print:p-2">
              <header className="border-b border-line pb-4 text-center">
                <p className="text-sm text-inkmuted">{data.business || 'Business'}</p>
                <h1 className="mt-1 text-xl font-bold text-ink">{data.location || 'Unassigned'}</h1>
                {data.gstin && <p className="mt-1 text-xs text-inkmuted">GSTIN: {data.gstin}</p>}
              </header>

              <section className="mt-4 rounded-md bg-[#e3eaf5] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-blue-600">Day End POS Invoice Report</h2>
                    <p className="text-xs text-inkmuted">Date: {formatDate(data.date)}</p>
                  </div>
                  <span className="rounded bg-blue-600 px-2 py-1 text-xs font-bold text-white">POS SALES</span>
                </div>
              </section>

              <section className="grid gap-4 border-b border-line py-4 sm:grid-cols-2 lg:grid-cols-4">
                <div><p className="text-xs text-inkmuted">Report Date</p><p className="mt-1 text-sm font-semibold">{formatDate(data.date)}</p></div>
                <div><p className="text-xs text-inkmuted">Location</p><p className="mt-1 text-sm font-semibold">{data.location || 'Unassigned'}</p></div>
                <div><p className="text-xs text-inkmuted">Total Invoices</p><p className="mt-1 text-sm font-semibold">{data.totals.invoiceCount}</p></div>
                <div><p className="text-xs text-inkmuted">Total Sales</p><p className="mt-1 text-sm font-semibold text-blue-700">{formatMoney(data.totals.totalSales)}</p></div>
              </section>

              <section className="mt-5">
                <h3 className="mb-2 text-sm font-bold">1. PAYMENT METHOD BREAKDOWN</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        {['Payment Method', 'Transactions', 'Paid Amount (₹)'].map((heading) => (
                          <th key={heading} className="border border-line px-3 py-2">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.paymentMethods.length ? data.paymentMethods.map((method) => (
                        <tr key={method.method}>
                          <td className="border border-line px-3 py-2">{method.method}</td>
                          <td className="border border-line px-3 py-2 text-right">{method.transactionCount}</td>
                          <td className="border border-line px-3 py-2 text-right">{formatMoney(method.amount)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={3} className="border border-line px-3 py-4 text-center text-inkmuted">No payment methods recorded.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className="mt-5 grid gap-4 md:grid-cols-2">
                <div className="rounded-md border border-line p-3">
                  <h3 className="mb-3 text-sm font-bold">2. OVERALL SALES SUMMARY</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2"><span className="text-inkmuted">Total POS Sales</span><span className="font-semibold">{formatMoney(data.totals.totalSales)}</span></div>
                    <div className="flex justify-between gap-2"><span className="text-inkmuted">Total Paid</span><span className="font-semibold text-green-700">{formatMoney(data.totals.totalPaid)}</span></div>
                    <div className="flex justify-between gap-2 border-t border-line pt-2"><span className="font-semibold">Outstanding Due</span><span className="font-bold text-blue-700">{formatMoney(data.totals.totalDue)}</span></div>
                  </div>
                </div>

                <div className="rounded-md border border-line p-3">
                  <h3 className="mb-3 text-sm font-bold">3. INVOICE STATUS SUMMARY</h3>
                  <div className="space-y-2 text-sm">
                    {data.invoiceStatuses.length ? data.invoiceStatuses.map((status) => (
                      <div key={status.status} className="flex justify-between gap-2">
                        <span className="text-inkmuted">{status.status}</span>
                        <span className="font-semibold">
                          {status.invoiceCount} invoice{status.invoiceCount === 1 ? '' : 's'}
                          {status.outstandingDue > 0 ? ` · ${formatMoney(status.outstandingDue)} due` : ''}
                        </span>
                      </div>
                    )) : <p className="text-inkmuted">No invoice status data.</p>}
                  </div>
                </div>
              </section>

              <section className="mt-5">
                <h3 className="mb-2 text-sm font-bold">4. POS INVOICE DETAILS</h3>
                <div className="overflow-x-auto">
                  <table className="dt min-w-[900px]">
                    <thead>
                      <tr>
                        {['Date & Time', 'Invoice No.', 'Customer', 'Status', 'Total (₹)', 'Paid (₹)', 'Due (₹)'].map((heading) => (
                          <th key={heading}>{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.length ? data.invoices.map((invoice) => (
                        <tr key={invoice._id}>
                          <td>{formatDateTime(invoice.date)}</td>
                          <td>{invoice.invoiceNo || '-'}</td>
                          <td>{invoice.customer || 'Walk-in Customer'}</td>
                          <td>{invoice.paymentStatus || '-'}</td>
                          <td className="text-right">{formatMoney(invoice.totalAmount)}</td>
                          <td className="text-right">{formatMoney(invoice.paid)}</td>
                          <td className="text-right">{formatMoney(invoice.due)}</td>
                        </tr>
                      )) : (
                        <tr><td colSpan={7} className="dt-empty">No POS invoices found for this day.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <footer className="mt-3 flex items-center justify-end gap-3 text-xs text-inkmuted">
                  <span>Page {page} of {pages}</span>
                  <button type="button" className="btn !px-2.5 !py-1 no-print" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>
                    Previous
                  </button>
                  <button type="button" className="btn !px-2.5 !py-1 no-print" disabled={page >= pages || loading} onClick={() => load(page + 1)}>
                    Next
                  </button>
                </footer>
              </section>

              <p className="mt-5 border-t border-line pt-3 text-xs text-inkmuted">
                Register opening/closing cash, physical counts, cashier session details, and closing notes are not stored on POS invoices.
              </p>
            </main>

            <footer className="no-print mt-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <button type="button" className="btn btn-primary" onClick={() => window.print()}>
                  <Icon name="printer" size={14} />
                  Print Report
                </button>
                <button type="button" className="btn" onClick={() => load(page)} disabled={loading}>
                  <Icon name="refresh" size={14} />
                  Refresh
                </button>
              </div>
              <button type="button" className="btn bg-[#1f2937] text-white hover:bg-[#111827]" onClick={() => router.push('/admin/reports/day-end-report')}>
                <Icon name="back" size={14} />
                Back to Day End Report
              </button>
            </footer>
          </>
        )}
      </div>
      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  );
}
