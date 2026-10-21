'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import Toolbar from '@/components/Toolbar';
import { useScope } from '@/components/ScopeContext';
import { fmt, toCsv, toXlsHtml, download, printTable } from '@/lib/format';

/* Transfer Stock Received - /admin/transaction/stocktransfers/transferstockreceiveds

   Two lists on one screen. The top one holds Stock Transfer Locations raised
   BY ANOTHER LOCATION and addressed to this one that have not been received
   yet; receiving one writes a Stock Transfer Received record and moves the
   row to the list below.

   Receiving is all-or-nothing today, so Received Qty always equals Sent Qty
   and Pending Qty is zero. The three columns are shown because the deployed
   screen shows them, and because the fields are already stored - switching to
   partial receipt later is a change to the accept action, not to the data.

   ("Recieved Transfers" is the deployed screen's spelling of Received. Kept
   as-is so the two apps read the same.) */

const PENDING_COLUMNS = [
  { k: 'packetNo', t: 'Packet No' },
  { k: 'fromLocationId', t: 'Transfer From', f: 'ref' },
  { k: 'toLocationId', t: 'Transfer To', f: 'ref' },
  { k: 'stlDate', t: 'Date', f: 'date' },
  { k: 'totalQty', t: 'Sent Qty', f: 'amount' },
  { k: 'receivedQty', t: 'Received Qty', f: 'amount', value: () => 0 },
  { k: 'pendingQty', t: 'Pending Qty', f: 'amount', value: (r) => r.totalQty },
];

const RECEIVED_COLUMNS = [
  { k: 'strCode', t: 'STR Code' },
  { k: 'strDate', t: 'STR Date', f: 'date' },
  { k: 'fromLocationId', t: 'Transfer From', f: 'ref' },
  { k: 'toLocationId', t: 'Transfer To', f: 'ref' },
  { k: 'createdAt', t: 'Created On', f: 'date' },
];

/* Pending Transfers Panel - awaiting receipt */
function PendingPanel({ nonce }) {
  const scope = useScope();
  const [state, setState] = useState({ rows: [], labels: {}, page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [hidden, setHidden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);

  const inboxValue = scope.location;

  const load = useCallback(async () => {
    if (!scope.business || !scope.location) { setLoading(false); return; }
    setLoading(true);

    const qs = new URLSearchParams({
      page: String(page),
      search,
      inbox: inboxValue || '',
      unconverted: 'receivedId',
      business: scope.business || '',
      finYear: scope.finYear || '',
    });

    try {
      const r = await fetch('/api/stock-transfer-location?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [],
        labels: d.labels || {},
        page: d.page || 1,
        pages: d.pages || 1,
        total: d.total || 0,
      });
    } finally {
      setLoading(false);
    }
  }, [scope.business, scope.location, scope.finYear, page, search, inboxValue]);

  useEffect(() => { load(); }, [load, nonce]);
  useEffect(() => { setPage(1); }, [search, scope.business, scope.location, scope.finYear]);

  const visible = PENDING_COLUMNS.filter((c) => !hidden.includes(c.t));

  const cellText = (row, col) => {
    const raw = col.value ? col.value(row) : row[col.k];
    if (col.f === 'ref') return state.labels[String(raw)] || '';
    return col.f ? fmt(col.f, raw, state.labels) : (raw ?? '');
  };

  const exportRows = () => state.rows.map((r) => visible.map((c) => cellText(r, c)));
  const exportHeaders = () => visible.map((c) => c.t);

  async function act(row) {
    if (!window.confirm('Receive this stock transfer into this location?')) return;
    setBusy(String(row._id));
    try {
      const r = await fetch('/api/stock-transfer-received', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockTransferLocationId: String(row._id),
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
        }),
      });
      const d = await r.json();
      if (!r.ok) { window.alert(d.error || 'Could not complete that.'); return; }
      load();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Pending Transfer Stock</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={load}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      <div className="card-body">
        <Toolbar
          columns={PENDING_COLUMNS}
          hidden={hidden}
          onToggleColumn={(t) =>
            setHidden((h) => (h.includes(t) ? h.filter((x) => x !== t) : [...h, t]))
          }
          search={search}
          onSearch={setSearch}
          showAdd={false}
          showCsv={false}
          showExcel={false}
          showPdf={false}
          onExportCsv={() => download('pending-transfer-stock.csv', toCsv(exportHeaders(), exportRows()), 'text/csv')}
          onExportExcel={() =>
            download('pending-transfer-stock.xls', toXlsHtml('Pending Transfer Stock', exportHeaders(), exportRows()),
              'application/vnd.ms-excel')}
          onExportPdf={() => printTable('Pending Transfer Stock', exportHeaders(), exportRows())}
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
                <tr><td colSpan={visible.length + 1} className="dt-empty"><span className="spin" /></td></tr>
              )}
              {!loading && state.rows.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="dt-empty">No Data..</td></tr>
              )}
              {!loading && state.rows.map((row) => (
                <tr key={row._id}>
                  {visible.map((c, i) => <td key={c.t + i}>{cellText(row, c)}</td>)}
                  <td>
                    <button
                      type="button"
                      className="btn btn-primary h-[26px] px-2.5 text-[11px]"
                      disabled={busy === String(row._id)}
                      onClick={() => act(row)}
                    >
                      {busy === String(row._id)
                        ? <span className="spin" />
                        : <Icon name="save" size={12} />} Receive
                    </button>
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
            <button className="btn" disabled={state.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn" disabled={state.page >= state.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* Received Transfers Panel - with Challan and Return action buttons */
function ReceivedPanel({ nonce }) {
  const scope = useScope();
  const router = useRouter();
  const [state, setState] = useState({ rows: [], labels: {}, page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [hidden, setHidden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);
  const [challanStatus, setChallanStatus] = useState({}); /* stlId -> challan data */

  const load = useCallback(async () => {
    if (!scope.business) { setLoading(false); return; }
    if (!scope.location) { setLoading(false); return; }
    setLoading(true);

    const qs = new URLSearchParams({
      page: String(page),
      search,
      business: scope.business || '',
      location: scope.location || '',
      finYear: scope.finYear || '',
    });

    try {
      const r = await fetch('/api/stock-transfer-received?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [],
        labels: d.labels || {},
        page: d.page || 1,
        pages: d.pages || 1,
        total: d.total || 0,
      });

      /* Check for existing challans on all received transfers */
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
  }, [scope.business, scope.location, scope.finYear, page, search]);

  useEffect(() => { load(); }, [load, nonce]);
  useEffect(() => { setPage(1); }, [search, scope.business, scope.location, scope.finYear]);

  const visible = RECEIVED_COLUMNS.filter((c) => !hidden.includes(c.t));

  const cellText = (row, col) => {
    const raw = col.value ? col.value(row) : row[col.k];
    if (col.f === 'ref') return state.labels[String(raw)] || '';
    return col.f ? fmt(col.f, raw, state.labels) : (raw ?? '');
  };

  const exportRows = () => state.rows.map((r) => visible.map((c) => cellText(r, c)));
  const exportHeaders = () => visible.map((c) => c.t);

  const handleReturnItem = async (row) => {
    if (!window.confirm('Initiate return for this stock transfer?')) return;
    setBusy(row._id);
    try {
      const r = await fetch('/api/stock-transfer-return', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockTransferReceivedId: String(row._id),
          business: scope.business,
          location: scope.location,
          finYear: scope.finYear,
        }),
      });
      const d = await r.json();
      if (!r.ok) {
        window.alert(d.error || 'Could not initiate return.');
        return;
      }
      /* Navigate to return form or reload */
      window.alert('Return initiated successfully.');
      load();
    } finally {
      setBusy(null);
    }
  };

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

  async function handleCreateChallan(row) {
    if (!row.stockTransferLocationId) {
      window.alert('Cannot create challan without transfer location ID.');
      return;
    }
    if (!window.confirm('Create delivery challan for this transfer?')) return;
    setBusy(row._id);
    try {
      const r = await fetch('/api/stock-transfer-delivery-challan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockTransferLocationId: String(row.stockTransferLocationId) }),
      });
      const d = await r.json();
      if (!r.ok) {
        window.alert(d.error || 'Could not create delivery challan.');
        return;
      }
      setChallanStatus((s) => ({ ...s, [String(row.stockTransferLocationId)]: d.challan }));
      window.alert('Delivery challan created successfully.');
    } catch (error) {
      console.error('Error creating challan:', error);
      window.alert('Error creating delivery challan.');
    } finally {
      setBusy(null);
    }
  }

  const handlePreviewChallan = async (row) => {
    /* Fetch the challan for this transfer, then navigate to preview */
    setBusy(row._id);
    try {
      const r = await fetch(
        `/api/stock-transfer-delivery-challan?stockTransferLocationId=${row.stockTransferLocationId}`
      );
      const d = await r.json();
      if (!r.ok || !d.challan) {
        window.alert('No delivery challan found for this transfer. Please create one first.');
        return;
      }
      /* Navigate to challan detail page */
      router.push(`/admin/transaction/stocktransfers/delivery-challan/${d.challan._id}`);
    } catch (error) {
      console.error('Error fetching challan:', error);
      window.alert('Error loading delivery challan.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Recieved Transfers</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={load}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      <div className="card-body">
        <Toolbar
          columns={RECEIVED_COLUMNS}
          hidden={hidden}
          onToggleColumn={(t) =>
            setHidden((h) => (h.includes(t) ? h.filter((x) => x !== t) : [...h, t]))
          }
          search={search}
          onSearch={setSearch}
          showAdd={false}
          showCsv={false}
          showExcel={false}
          showPdf={false}
          onExportCsv={() => download('stock-transfer-received.csv', toCsv(exportHeaders(), exportRows()), 'text/csv')}
          onExportExcel={() =>
            download('stock-transfer-received.xls', toXlsHtml('Recieved Transfers', exportHeaders(), exportRows()),
              'application/vnd.ms-excel')}
          onExportPdf={() => printTable('Recieved Transfers', exportHeaders(), exportRows())}
        />

        <div className="mt-3 overflow-x-auto">
          <table className="dt">
            <thead>
              <tr>
                {visible.map((c, i) => <th key={c.t + i}>{c.t}</th>)}
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={visible.length + 1} className="dt-empty"><span className="spin" /></td></tr>
              )}
              {!loading && state.rows.length === 0 && (
                <tr><td colSpan={visible.length + 1} className="dt-empty">No Data..</td></tr>
              )}
              {!loading && state.rows.map((row) => (
                <tr key={row._id}>
                  {visible.map((c, i) => <td key={c.t + i}>{cellText(row, c)}</td>)}
                  <td className="flex gap-1.5">
                    <button
                      type="button"
                      className="btn btn-success h-[26px] px-2.5 text-[11px]"
                      disabled={busy === row._id || !challanStatus[String(row.stockTransferLocationId)]}
                      onClick={() => handlePreviewChallan(row)}
                      title={challanStatus[String(row.stockTransferLocationId)]
                        ? 'View Delivery Challan' : 'Delivery Challan has not been created'}
                    >
                      {busy === row._id ? <span className="spin" /> : <Icon name="eye" size={12} />}
                      {' '}View Challan
                    </button>
                    <button
                      type="button"
                      className="btn btn-warning h-[26px] px-2.5 text-[11px]"
                      disabled={busy === row._id}
                      onClick={() => handleReturnItem(row)}
                      title="Return Items"
                    >
                      {busy === row._id ? <span className="spin" /> : <Icon name="undo" size={12} />}
                      {' '}Return
                    </button>
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
            <button className="btn" disabled={state.page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <button className="btn" disabled={state.page >= state.pages} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        </div>
      </div>
    </div>
  );
}

export default function StockTransferReceivedPage() {
  const [nonce, setNonce] = useState(0);
  const bump = () => setNonce((n) => n + 1);

  return (
    <>
      <PendingPanel nonce={nonce} />
      <ReceivedPanel nonce={nonce} />
    </>
  );
}
