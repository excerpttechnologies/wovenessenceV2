'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import Toolbar from './Toolbar';
import StockTransferPacketView from './StockTransferPacketView';
import { useScope } from './ScopeContext';
import { fmt, toCsv, toXlsHtml, download, printTable } from '@/lib/format';

/* ==========================================================================
   Transfer Stock Packets - list.

   Not built on ListView because the row's View action opens a DIALOG rather
   than navigating to a record page, which ListView has no way to express.
   Same reasoning as BarcodeSettingsView, which owns its own list for the
   same reason.

   A packet that a Stock Transfer Location has already claimed is shown with a
   green tick beside its number and offers no Edit or Delete - the API would
   refuse both anyway, so the buttons are not rendered rather than failing
   when pressed.
   ========================================================================== */

const ENDPOINT = '/api/stock-transfer-packet';
const BASE = '/admin/transaction/stocktransfers/transferstockpacket';

const COLUMNS = [
  { k: 'stpDate', t: 'Transfer Date', f: 'date' },
  { k: 'fromLocationId', t: 'Transfer From', f: 'ref' },
  { k: 'toLocationId', t: 'Transfer To', f: 'ref' },
  { k: 'packetNo', t: 'Packet No' },
  { k: 'createdAt', t: 'Created On', f: 'date' },
];

export default function StockTransferPacketList() {
  const router = useRouter();
  const { business, location, finYear } = useScope();

  const [state, setState] = useState({ rows: [], labels: {}, page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [hidden, setHidden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [range, setRange] = useState({ startDate: '', endDate: '' });
  const [applied, setApplied] = useState({ startDate: '', endDate: '' });
  const [viewing, setViewing] = useState(null);
  const [challanStatus, setChallanStatus] = useState({}); /* id -> challan data */
  const [creatingChallan, setCreatingChallan] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const qs = new URLSearchParams({
      page: String(page), search,
      business: business || '', location: location || '', finYear: finYear || '',
    });
    if (applied.startDate) qs.set('startDate', applied.startDate);
    if (applied.endDate) qs.set('endDate', applied.endDate);

    try {
      const r = await fetch(ENDPOINT + '?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [], labels: d.labels || {},
        page: d.page || 1, pages: d.pages || 1, total: d.total || 0,
      });

      /* Check for existing challans on consolidated packets */
      if (d.rows) {
        d.rows.forEach((row) => {
          if (row.stockTransferLocationId) {
            checkChallan(String(row.stockTransferLocationId));
          }
        });
      }
    } finally {
      setLoading(false);
    }
  }, [page, search, business, location, finYear, applied]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, business, location, finYear, applied]);

  const visible = COLUMNS.filter((c) => !hidden.includes(c.t));

  const cellText = (row, col) => {
    if (col.f === 'ref') return state.labels[String(row[col.k])] || '';
    return col.f ? fmt(col.f, row[col.k]) : (row[col.k] ?? '');
  };

  /* the packet number carries a green tick once it has been consolidated */
  const cell = (row, col) => {
    if (col.k !== 'packetNo') return cellText(row, col);
    return (
      <span className="inline-flex items-center gap-1.5">
        {row.packetNo}
        {row.stockTransferLocationId && (
          <span className="text-okgreen" title="Stock transfer location created">&#10004;</span>
        )}
      </span>
    );
  };

  const exportRows = () => state.rows.map((r) => visible.map((c) => cellText(r, c)));
  const exportHeaders = () => visible.map((c) => c.t);

  async function remove(id) {
    if (!window.confirm('Delete this record?')) return;
    const r = await fetch(ENDPOINT + '/' + id, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      window.alert(d.error || 'Could not delete this record.');
      return;
    }
    load();
  }

  async function checkChallan(stlId) {
    try {
      const r = await fetch(`/api/stock-transfer-delivery-challan?stockTransferLocationId=${stlId}`);
      const d = await r.json();
      if (d.challan) {
        setChallanStatus((s) => ({ ...s, [stlId]: d.challan }));
      }
    } catch (error) {
      console.error('Error checking challan:', error);
    }
  }

  async function createChallan(stlId) {
    if (!window.confirm('Create delivery challan for this transfer?')) return;
    setCreatingChallan(stlId);
    try {
      const r = await fetch('/api/stock-transfer-delivery-challan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockTransferLocationId: stlId }),
      });
      const d = await r.json();
      if (!r.ok) {
        window.alert(d.error || 'Could not create delivery challan.');
        return;
      }
      setChallanStatus((s) => ({ ...s, [stlId]: d.challan }));
      window.alert('Delivery challan created successfully.');
    } catch (error) {
      console.error('Error creating challan:', error);
      window.alert('Error creating delivery challan.');
    } finally {
      setCreatingChallan(null);
    }
  }

  function downloadChallan(challan) {
    if (!challan) return;
    /* Navigate to preview page or generate PDF - for now just show challan details */
    router.push(`/admin/transaction/stocktransfers/delivery-challan/${challan._id}`);
  }

  return (
    <>
      {viewing && (
        <StockTransferPacketView
          id={viewing}
          labels={state.labels}
          onClose={() => setViewing(null)}
        />
      )}

      {/* Filter card */}
      <div className="card">
        <div className="card-head">
          <span className="card-title"><Icon name="filter" size={15} /> Filter</span>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 items-end gap-x-[22px] gap-y-3.5 md:grid-cols-2 xl:grid-cols-3">
            <div>
              <label className="f-label">Start Date</label>
              <input
                type="date" className="f-input" value={range.startDate}
                onChange={(e) => setRange((r) => ({ ...r, startDate: e.target.value }))}
              />
            </div>
            <div>
              <label className="f-label">End Date</label>
              <input
                type="date" className="f-input" value={range.endDate}
                onChange={(e) => setRange((r) => ({ ...r, endDate: e.target.value }))}
              />
            </div>
            <button
              type="button"
              className="btn btn-primary h-9 justify-center"
              onClick={() => setApplied(range)}
            >
              Search
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Transfer Stock Packets</span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={load}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>

        <div className="card-body">
          <Toolbar
            columns={COLUMNS}
            hidden={hidden}
            onToggleColumn={(t) =>
              setHidden((h) => (h.includes(t) ? h.filter((x) => x !== t) : [...h, t]))
            }
            search={search}
            onSearch={setSearch}
            onAdd={() => router.push(BASE + '/add')}
            onExportCsv={() =>
              download('stock-transfer-packet.csv', toCsv(exportHeaders(), exportRows()), 'text/csv')
            }
            onExportExcel={() =>
              download(
                'stock-transfer-packet.xls',
                toXlsHtml('Transfer Stock Packets', exportHeaders(), exportRows()),
                'application/vnd.ms-excel'
              )
            }
            onExportPdf={() => printTable('Transfer Stock Packets', exportHeaders(), exportRows())}
          />

          <div className="mt-3 overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  {visible.map((c, i) => <th key={c.t + i}>{c.t}</th>)}
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={visible.length + 1} className="dt-empty"><span className="spin" /></td>
                  </tr>
                )}
                {!loading && state.rows.length === 0 && (
                  <tr>
                    <td colSpan={visible.length + 1} className="dt-empty">No Data..</td>
                  </tr>
                )}
                {!loading && state.rows.map((row) => (
                  <tr key={row._id}>
                    {visible.map((c, i) => <td key={c.t + i}>{cell(row, c)}</td>)}
                    <td>
                      <span className="inline-flex items-center gap-1.5">
                        <button
                          className="act-btn bg-[#2b7fd4]"
                          title="View"
                          onClick={() => setViewing(String(row._id))}
                        >
                          <Icon name="eye" size={12} />
                        </button>

                        {/* a consolidated packet is locked - the API refuses
                            both of these, so they are not offered */}
                        {!row.stockTransferLocationId && (
                          <>
                            <button
                              className="act-btn bg-warnyellow"
                              title="Edit"
                              onClick={() => router.push(BASE + '/' + row._id)}
                            >
                              <Icon name="pencil" size={12} />
                            </button>
                            <button
                              className="act-btn bg-danger"
                              title="Delete"
                              onClick={() => remove(row._id)}
                            >
                              <Icon name="trash" size={12} />
                            </button>
                          </>
                        )}

                        {/* Consolidated packet - show challan options */}
                        {row.stockTransferLocationId && (
                          <>
                            {challanStatus[String(row.stockTransferLocationId)] ? (
                              <button
                                className="act-btn bg-okgreen"
                                title="Download Delivery Challan"
                                onClick={() => downloadChallan(challanStatus[String(row.stockTransferLocationId)])}
                              >
                                <Icon name="download" size={12} />
                              </button>
                            ) : (
                              <button
                                className="act-btn bg-[#ff9800]"
                                title="Create Delivery Challan"
                                disabled={creatingChallan === String(row.stockTransferLocationId)}
                                onClick={() => createChallan(String(row.stockTransferLocationId))}
                              >
                                {creatingChallan === String(row.stockTransferLocationId) ? (
                                  <span className="spin" />
                                ) : (
                                  <Icon name="file" size={12} />
                                )}
                              </button>
                            )}
                          </>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center pt-3 text-[13px] text-cell">
            <span>Page <b className="text-brand-link">{state.page}</b> of {state.pages}</span>
            <span className="flex-1" />
            <span className="flex gap-2">
              <button className="btn" disabled={state.page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </button>
              <button className="btn" disabled={state.page >= state.pages} onClick={() => setPage((p) => p + 1)}>
                Next
              </button>
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
