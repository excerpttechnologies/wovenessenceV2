'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import { useScope } from '@/components/ScopeContext';

/* Tools > Barcode Split - the register of split transactions.

   A Draft can be opened and finalised. A Finalized split can be printed,
   exported or cancelled (which reverses its stock). Everything shown is the
   split transaction itself; the child barcodes live in the detail screen. */

const inputCls =
  'rounded-md border border-line bg-white px-2.5 py-2 text-[12.5px] text-ink outline-none focus:border-brand';

const STATUS_TONE = {
  Draft: 'pill-yellow',
  Finalized: 'pill-green',
  Cancelled: 'pill-red',
};

export default function BarcodeSplitListPage() {
  const router = useRouter();
  const { business, location, finYear } = useScope();

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', barcode: '', from: '', to: '' });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        page: String(page),
        business: business || '',
        location: location || '',
        finYear: finYear || '',
      });
      Object.entries(filters).forEach(([key, value]) => { if (value) qs.set(key, value); });
      const res = await fetch('/api/barcode-split?' + qs, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not load barcode splits.');
      setRows(data.rows || []);
      setTotal(data.total || 0);
      setPages(data.pages || 1);
    } catch (err) {
      setError(err.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, business, location, finYear, filters]);

  useEffect(() => { load(); }, [load]);

  function setFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  async function cancelSplit(row) {
    const reason = window.prompt('Reason for cancelling ' + row.splitNo + '? Stock is reversed only when the split is finalized.');
    if (reason === null) return;
    const res = await fetch('/api/barcode-split/' + row._id, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel', business, reason }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(data.error || 'The split could not be cancelled.');
      return;
    }
    load();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[18px] font-bold tracking-tight">Barcode Split</h1>
          <p className="text-[12.5px] text-inkmuted">Split an original barcode into individually priced child barcodes.</p>
        </div>
        <div className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
        <button type="button" className="btn btn-primary" onClick={() => router.push('/admin/tools/barcode-split/add')}>
          <Icon name="plus" size={14} /> Add Split
        </button>
      </div>

      <div className="card">
        <div className="card-body">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-inkmuted">Search</label>
              <input
                className={inputCls + ' w-[220px]'}
                value={filters.search}
                onChange={(e) => setFilter('search', e.target.value)}
                placeholder="Split no, barcode, item, supplier"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase text-inkmuted">Barcode</label>
              <input className={inputCls + ' w-[160px]'} value={filters.barcode} onChange={(e) => setFilter('barcode', e.target.value)} placeholder="Original barcode" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase text-inkmuted">Status</label>
              <select className={inputCls + ' w-[140px]'} value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
                <option value="">All statuses</option>
                <option value="Draft">Draft</option>
                <option value="Finalized">Finalized</option>
                <option value="Cancelled">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase text-inkmuted">From</label>
              <input type="date" className={inputCls} value={filters.from} onChange={(e) => setFilter('from', e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase text-inkmuted">To</label>
              <input type="date" className={inputCls} value={filters.to} onChange={(e) => setFilter('to', e.target.value)} />
            </div>
            <button type="button" className="btn" onClick={load}>Apply</button>
          </div>

          {error && <div className="mt-3 rounded-md border border-[#f3b4b0] bg-[#fdeeed] px-3 py-2 text-[13px] text-danger">{error}</div>}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Split Transactions</span>
          <span className="card-sub">{total} record(s)</span>
        </div>
        <div className="card-body overflow-x-auto">
          <table className="dt min-w-[1250px]">
            <thead>
              <tr>
                <th>Split Transaction Code</th>
                <th>Original Barcode</th>
                <th>Item Code</th>
                <th>Item Name</th>
                <th>Supplier</th>
                <th>Original Qty</th>
                <th>Split Qty</th>
                <th>UOM</th>
                <th>New Barcodes</th>
                <th>Status</th>
                <th>Created By</th>
                <th>Created Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={13} className="dt-empty"><span className="spin" /></td></tr>}
              {!loading && !rows.length && <tr><td colSpan={13} className="dt-empty">No splits found.</td></tr>}
              {!loading && rows.map((row) => (
                <tr key={row._id}>
                  <td className="font-semibold">{row.splitNo}</td>
                  <td>{row.originalBarcodeNo}</td>
                  <td>{row.itemCode}</td>
                  <td>{row.itemName}</td>
                  <td>{row.supplierName}</td>
                  <td>{row.originalQty} {row.originalUom}</td>
                  <td>{row.totalSplitQty} {row.originalUom}</td>
                  <td>{row.originalUom}</td>
                  <td>{row.childCount}</td>
                  <td><span className={'pill ' + (STATUS_TONE[row.status] || 'pill-grey')}>{row.status}</span></td>
                  <td>{row.createdByName || '—'}</td>
                  <td>{row.createdAt ? new Date(row.createdAt).toLocaleDateString() : '—'}</td>
                  <td>
                    <span className="inline-flex items-center gap-1.5">
                      <button type="button" className="act-btn bg-[#2b7fd4]" title="View" onClick={() => router.push('/admin/tools/barcode-split/' + row._id)}>
                        <Icon name="eye" size={12} />
                      </button>
                      {row.status === 'Draft' && (
                        <button type="button" className="act-btn" title="Edit draft" onClick={() => router.push('/admin/tools/barcode-split/' + row._id + '/edit')}>
                          <Icon name="pencil" size={12} />
                        </button>
                      )}
                      {row.status === 'Finalized' && (
                        <>
                          <button type="button" className="act-btn" title="Print barcodes" onClick={() => router.push('/admin/tools/barcode-split/' + row._id + '?print=1')}>
                            <Icon name="printer" size={12} />
                          </button>
                          <a className="act-btn" title="Export Excel" href={'/api/barcode-split/' + row._id + '/export?business=' + (business || '')}>
                            <Icon name="download" size={12} />
                          </a>
                          <button type="button" className="act-btn bg-danger" title="Cancel / reverse" onClick={() => cancelSplit(row)}>
                            <Icon name="undo" size={12} />
                          </button>
                        </>
                      )}
                      <a className="act-btn" title="Barcode history" href={'/admin/inventory/barcodeitem?barcode=' + encodeURIComponent(row.originalBarcodeNo)}>
                        <Icon name="file" size={12} />
                      </a>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex items-center pt-3 text-[13px] text-cell">
            <span>Page <b className="text-brand-link">{page}</b> of {pages}</span>
            <span className="flex-1" />
            <span className="flex gap-2">
              <button type="button" className="btn" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</button>
              <button type="button" className="btn" disabled={page >= pages} onClick={() => setPage((p) => Math.min(pages, p + 1))}>Next</button>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
