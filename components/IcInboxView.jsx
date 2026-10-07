'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import Toolbar from './Toolbar';
import { useScope } from './ScopeContext';
import { fmt, toCsv, toXlsHtml, download, printTable } from '@/lib/format';

/* ==========================================================================
   Two stacked lists on one screen - "pending mine to act on" above,
   "already actioned" below.

   Both Auto Purchases Received and Sales Return have exactly this shape:
   documents raised by ANOTHER branch that this branch has to accept, and a
   record of the ones it already has. The two differ only in their endpoints,
   columns and the wording of the accept button, so they share this component
   rather than each carrying its own copy of the list plumbing.

   Note this reads the INBOX side: the rows in the pending card were created
   by a different branch, so they are fetched by destination rather than by
   the top-bar business. That is what the `inboxParam` is for.

   Stock Transfers reuse this same shape, with one difference: they move
   between LOCATIONS of one business rather than between businesses, so their
   inbox is addressed by location. `inboxScope: 'location'` switches which
   part of the scope is sent, and `inboxKeepScope` adds the business and
   financial year alongside it - the inter company routes drop those on the
   inbox branch, so they must not be sent there.
   ========================================================================== */

function Panel({ spec, onAction, nonce }) {
  const scope = useScope();
  const [state, setState] = useState({ rows: [], labels: {}, page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [hidden, setHidden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(null);

  /* which part of the scope addresses this inbox - business by default,
     location for stock transfers */
  const inboxValue = spec.inboxScope === 'location' ? scope.location : scope.business;

  const load = useCallback(async () => {
    if (!scope.business) { setLoading(false); return; }
    /* a location-addressed inbox has nothing to ask for until the top bar has
       resolved a location */
    if (spec.inboxParam && spec.inboxScope === 'location' && !scope.location) {
      setLoading(false);
      return;
    }
    setLoading(true);

    const qs = new URLSearchParams({ page: String(page), search });
    /* the pending card asks "addressed to me"; the actioned card is scoped
       normally, because those records belong to this branch */
    if (spec.inboxParam) {
      qs.set(spec.inboxParam, inboxValue || '');
      if (spec.unconvertedParam) qs.set('unconverted', spec.unconvertedParam);
      if (spec.inboxKeepScope) {
        qs.set('business', scope.business || '');
        qs.set('finYear', scope.finYear || '');
      }
    } else {
      qs.set('business', scope.business || '');
      qs.set('location', scope.location || '');
      qs.set('finYear', scope.finYear || '');
    }

    try {
      const r = await fetch(spec.endpoint + '?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [], labels: d.labels || {},
        page: d.page || 1, pages: d.pages || 1, total: d.total || 0,
      });
    } finally {
      setLoading(false);
    }
  }, [spec, page, search, inboxValue, scope.business, scope.location, scope.finYear]);

  useEffect(() => { load(); }, [load, nonce]);
  useEffect(() => { setPage(1); }, [search, scope.business, scope.location, scope.finYear]);

  const visible = spec.columns.filter((c) => !hidden.includes(c.t));

  const cellText = (row, col) => {
    const raw = col.value ? col.value(row) : row[col.k];
    if (col.f === 'ref') return state.labels[String(raw)] || '';
    return col.f ? fmt(col.f, raw, state.labels) : (raw ?? '');
  };

  const exportRows = () => state.rows.map((r) => visible.map((c) => cellText(r, c)));
  const exportHeaders = () => visible.map((c) => c.t);

  async function act(row) {
    if (spec.confirm && !window.confirm(spec.confirm)) return;
    setBusy(String(row._id));
    try {
      const r = await fetch(spec.actionEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          [spec.actionKey]: String(row._id),
          business: scope.business, location: scope.location, finYear: scope.finYear,
        }),
      });
      const d = await r.json();
      if (!r.ok) { window.alert(d.error || 'Could not complete that.'); return; }
      onAction();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">{spec.title}</span>
        <span className="flex-1" />
        <button type="button" className="btn btn-ghost" onClick={load}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      <div className="card-body">
        <Toolbar
          columns={spec.columns}
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
          onExportCsv={() => download(spec.file + '.csv', toCsv(exportHeaders(), exportRows()), 'text/csv')}
          onExportExcel={() =>
            download(spec.file + '.xls', toXlsHtml(spec.title, exportHeaders(), exportRows()),
              'application/vnd.ms-excel')}
          onExportPdf={() => printTable(spec.title, exportHeaders(), exportRows())}
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
                    {spec.actionLabel ? (
                      <button
                        type="button"
                        className="btn btn-primary h-[26px] px-2.5 text-[11px]"
                        disabled={busy === String(row._id)}
                        onClick={() => act(row)}
                      >
                        {busy === String(row._id)
                          ? <span className="spin" />
                          : <Icon name="save" size={12} />} {spec.actionLabel}
                      </button>
                    ) : (
                      <span className="text-inkmuted">&mdash;</span>
                    )}
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

export default function IcInboxView({ pending, actioned }) {
  /* bumped after an accept, so BOTH panels refetch - the row moves from one
     to the other and neither would notice on its own */
  const [nonce, setNonce] = useState(0);
  const bump = () => setNonce((n) => n + 1);

  return (
    <>
      <Panel spec={pending} onAction={bump} nonce={nonce} />
      <Panel spec={actioned} onAction={bump} nonce={nonce} />
    </>
  );
}
