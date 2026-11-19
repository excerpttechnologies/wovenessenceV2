'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useScope } from '@/components/ScopeContext';
import Icon from '@/components/Icon';

function dateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('en-GB').format(date);
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function initialFromDate() {
  const today = new Date();
  return dateInputValue(new Date(today.getFullYear(), today.getMonth() - 1, 1));
}

// export default function DayEndReportView() {
//   const router = useRouter();
//   const { finYear } = useScope();
//   const [location, setLocation] = useState('all');
//   const [dateFrom, setDateFrom] = useState(initialFromDate);
//   const [dateTo, setDateTo] = useState(() => dateInputValue(new Date()));
//   const [apiLocations, setApiLocations] = useState([]);
//   const [rows, setRows] = useState([]);
//   const [total, setTotal] = useState(0);
//   const [page, setPage] = useState(1);
//   const [pages, setPages] = useState(1);
//   const [loading, setLoading] = useState(false);
//   const [error, setError] = useState('');

//   const load = useCallback(async (requestedPage = 1) => {
//     if (!dateFrom || !dateTo) return;
//     setLoading(true);
//     setError('');

//     const query = new URLSearchParams({
//       finYear: finYear || '',
//       locationId: location,
//       dateFrom,
//       dateTo,
//       page: String(requestedPage),
//       pageSize: '15',
//     });

//     try {
//       const response = await fetch(`/api/reports/day-end-report?${query.toString()}`, {
//         cache: 'no-store',
//       });
//       const data = await response.json();
//       if (!response.ok) throw new Error(data.error || 'Unable to load report.');

//       setRows(data.rows || []);
//       setTotal(Number(data.total) || 0);
//       setPage(Number(data.page) || requestedPage);
//       setPages(Math.max(1, Number(data.pages) || 1));
//       setApiLocations(data.locations || []);
//     } catch (requestError) {
//       setError(requestError.message || 'Unable to load report.');
//       setRows([]);
//       setTotal(0);
//       setPages(1);
//       setApiLocations([]);
//     } finally {
//       setLoading(false);
//     }
//   }, [finYear, location, dateFrom, dateTo]);

//   const loadRef = useRef(load);
//   useEffect(() => {
//     loadRef.current = load;
//   }, [load]);

//   useEffect(() => {
//     loadRef.current(1);
//   }, [finYear]);

//   const locationOptions = apiLocations;

//   function search(event) {
//     event.preventDefault();
//     setPage(1);
//     load(1);
//   }

//   function openDetails(row) {
//     const query = new URLSearchParams({
//       businessId: row.businessId,
//       locationId: row.locationId,
//       date: row.date,
//       finYear: finYear || '',
//     });
//     router.push(`/admin/reports/day-end-report/details?${query.toString()}`);
//   }

//   return (
//     <section>
//       <div className="card">
//         <div className="card-head">
//           <span className="card-title">Day End Report</span>
//         </div>
//         <form onSubmit={search} className="grid grid-cols-1 gap-x-3 gap-y-3 p-3 md:grid-cols-4">
//           <label className="block text-[13px] text-ink">
//             <span className="mb-1 block">Business Location <span className="f-req">*</span></span>
//             <select
//               className="f-input w-full"
//               value={location}
//               onChange={(event) => setLocation(event.target.value)}
//             >
//               <option value="all">All Locations</option>
//               {locationOptions.map((item) => (
//                 <option key={item.value} value={item.value}>{item.label}</option>
//               ))}
//             </select>
//           </label>

//           <label className="block text-[13px] text-ink">
//             <span className="mb-1 block">Date From <span className="f-req">*</span></span>
//             <input
//               className="f-input w-full"
//               type="date"
//               value={dateFrom}
//               onChange={(event) => setDateFrom(event.target.value)}
//               required
//             />
//           </label>

//           <label className="block text-[13px] text-ink">
//             <span className="mb-1 block">Date To <span className="f-req">*</span></span>
//             <input
//               className="f-input w-full"
//               type="date"
//               value={dateTo}
//               onChange={(event) => setDateTo(event.target.value)}
//               required
//             />
//           </label>

//           <div className="md:col-span-4">
//             <button type="submit" className="btn btn-primary" disabled={loading}>
//               {loading ? <span className="spin" /> : <Icon name="search" size={14} />}
//               Search
//             </button>
//           </div>
//         </form>
//       </div>

//       <div className="card mt-3 overflow-hidden">
//         <div className="card-head">
//           <span className="card-title">Total Records: {total}</span>
//           {loading && <span className="text-xs text-inkmuted">Loading...</span>}
//         </div>
//         {error && <div role="alert" className="flash flash-err mx-3 mt-3">{error}</div>}
//         <div className="px-3 pt-3 text-xs text-inkmuted">
//           All Locations combines POS invoice sales across companies. Register times, balances, and cashier names are not stored on invoice records.
//         </div>
//         <div className="overflow-x-auto">
//           <table className="dt dt-nowrap-head min-w-[850px]">
//             <thead>
//               <tr>
//                 {['DATE', 'LOCATION', 'INVOICE COUNT', 'TOTAL SALES', 'DETAILS'].map((heading) => (
//                   <th key={heading}>{heading}</th>
//                 ))}
//               </tr>
//             </thead>
//             <tbody>
//               {loading ? (
//                 <tr><td colSpan={5} className="dt-empty"><span className="spin" /></td></tr>
//               ) : rows.length ? rows.map((row) => (
//                 <tr key={row._id}>
//                   <td>{formatDate(row.date)}</td>
//                   <td>{row.location || '-'}</td>
//                   <td className="text-right">{Number(row.invoiceCount) || 0}</td>
//                   <td className="text-right">{formatMoney(row.totalSales)}</td>
//                   <td>
//                     <button
//                       type="button"
//                       className="act-btn bg-[#0798d2] text-white hover:bg-[#087eb0]"
//                       title="View POS day details"
//                       aria-label={`View POS details for ${row.location} on ${row.date}`}
//                       onClick={() => openDetails(row)}
//                     >
//                       <Icon name="eye" size={13} />
//                     </button>
//                   </td>
//                 </tr>
//               )) : (
//                 <tr><td colSpan={5} className="dt-empty">No POS invoices found for the selected date range and filters.</td></tr>
//               )}
//             </tbody>
//           </table>
//         </div>
//         <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#f7f9fc] px-3 py-2.5 text-[12px] text-inkmuted">
//           <span>Page {page} of {pages}</span>
//           <div className="flex gap-2">
//             <button
//               type="button"
//               className="btn !px-2.5 !py-1"
//               disabled={page <= 1 || loading}
//               onClick={() => load(page - 1)}
//             >
//               Previous
//             </button>
//             <button
//               type="button"
//               className="btn !px-2.5 !py-1"
//               disabled={page >= pages || loading}
//               onClick={() => load(page + 1)}
//             >
//               Next
//             </button>
//           </div>
//         </footer>
//       </div>
//     </section>
//   );
// }


export default function DayEndReportView() {
  const router = useRouter();
  const { finYear } = useScope();
  const [location, setLocation] = useState('all');
  const [dateFrom, setDateFrom] = useState(initialFromDate);
  const [dateTo, setDateTo] = useState(() => dateInputValue(new Date()));
  const [apiLocations, setApiLocations] = useState([]);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (requestedPage = 1) => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    setError('');

    const query = new URLSearchParams({
      finYear: finYear || '',
      locationId: location,
      dateFrom,
      dateTo,
      page: String(requestedPage),
      pageSize: '15',
    });

    try {
      const response = await fetch(`/api/reports/day-end-report?${query.toString()}`, {
        cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Unable to load report.');

      setRows(data.rows || []);
      setTotal(Number(data.total) || 0);
      setPage(Number(data.page) || requestedPage);
      setPages(Math.max(1, Number(data.pages) || 1));
      setApiLocations(data.locations || []);
    } catch (requestError) {
      setError(requestError.message || 'Unable to load report.');
      setRows([]);
      setTotal(0);
      setPages(1);
      setApiLocations([]);
    } finally {
      setLoading(false);
    }
  }, [finYear, location, dateFrom, dateTo]);

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    loadRef.current(1);
  }, [finYear]);

  const locationOptions = apiLocations;

  function search(event) {
    event.preventDefault();
    setPage(1);
    load(1);
  }

  function openDetails(row) {
    const query = new URLSearchParams({
      businessId: row.businessId,
      locationId: row.locationId,
      date: row.date,
      finYear: finYear || '',
    });
    router.push(`/admin/reports/day-end-report/details?${query.toString()}`);
  }

  return (
    <section>
      <div className="card">
        <div className="card-head">
          <span className="card-title">Day End Report</span>
        </div>
        <form onSubmit={search} className="grid grid-cols-1 gap-x-3 gap-y-3 p-3 md:grid-cols-4">
          <label className="block text-[13px] text-ink">
            <span className="mb-1 block">Business Location <span className="f-req">*</span></span>
            <select
              className="f-input w-full"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
            >
              <option value="all">All Locations</option>
              {locationOptions.map((item) => (
                <option key={item.value} value={item.value}>{item.label}</option>
              ))}
            </select>
          </label>

          <label className="block text-[13px] text-ink">
            <span className="mb-1 block">Date From <span className="f-req">*</span></span>
            <input
              className="f-input w-full"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              required
            />
          </label>

          <label className="block text-[13px] text-ink">
            <span className="mb-1 block">Date To <span className="f-req">*</span></span>
            <input
              className="f-input w-full"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              required
            />
          </label>

          <div className="md:col-span-4">
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="spin" /> : <Icon name="search" size={14} />}
              Search
            </button>
          </div>
        </form>
      </div>

      <div className="card mt-3 overflow-hidden">
        <div className="card-head">
          <span className="card-title">Total Records: {total}</span>
          {loading && <span className="text-xs text-inkmuted">Loading...</span>}
        </div>
        {error && <div role="alert" className="flash flash-err mx-3 mt-3">{error}</div>}
        <div className="px-3 pt-3 text-xs text-inkmuted">
          All Locations combines POS invoice sales across companies. Register times, balances, and cashier names are not stored on invoice records.
        </div>
        <div className="overflow-x-auto">
          <table className="dt dt-nowrap-head min-w-[850px]">
            <thead>
              <tr>
                {['DATE', 'LOCATION', 'INVOICE COUNT', 'TOTAL SALES', 'DETAILS'].map((heading) => (
                  <th key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="dt-empty"><span className="spin" /></td></tr>
              ) : rows.length ? rows.map((row) => (
                <tr key={row._id}>
                  <td>{formatDate(row.date)}</td>
                  <td>{row.location || '-'}</td>
                  <td className="text-right">{Number(row.invoiceCount) || 0}</td>
                  <td className="text-right">{formatMoney(row.totalSales)}</td>
                  <td>
                    <button
                      type="button"
                      className="act-btn bg-[#0798d2] text-white hover:bg-[#087eb0]"
                      title="View POS day details"
                      aria-label={`View POS details for ${row.location} on ${row.date}`}
                      onClick={() => openDetails(row)}
                    >
                      <Icon name="eye" size={13} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="dt-empty">No POS invoices found for the selected date range and filters.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-[#f7f9fc] px-3 py-2.5 text-[12px] text-inkmuted">
          <span>Page {page} of {pages}</span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn !px-2.5 !py-1"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className="btn !px-2.5 !py-1"
              disabled={page >= pages || loading}
              onClick={() => load(page + 1)}
            >
              Next
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
