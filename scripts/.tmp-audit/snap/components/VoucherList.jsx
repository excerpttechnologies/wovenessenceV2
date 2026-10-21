'use client';
import { useCallback, useEffect, useState } from 'react';
import Icon from './Icon';
import Toolbar from './Toolbar';
import VoucherForm from './VoucherForm';
import { useScope } from './ScopeContext';
import { fmt, toCsv, toXlsHtml, download, printTable } from '@/lib/format';
import { STATUS_OPTS } from '@/app/admin/voucher/fields';

/* ==========================================================================
   Voucher list - Receipt, Payment and Contra.

   Driven entirely by the spec, so all three screens are this one component.
   Not built on ListView: ADD opens a dialog, and Receipt and Payment carry a
   filter card with a Reset beside Search that ListView's FilterPanel has no
   concept of. Contra has no filter card at all, which the spec says.
   ========================================================================== */

const ENDPOINT = '/api/voucher';

export default function VoucherList({ spec }) {
  const { business, location, finYear } = useScope();

  const blankFilter = { voucherNo: '', party: '', status: '' };
  const [draft, setDraft] = useState(blankFilter);
  const [applied, setApplied] = useState(blankFilter);

  const [state, setState] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [search, setSearch] = useState('');
  const [hidden, setHidden] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState(null);

  const load = useCallback(async () => {
    if (!business) { setLoading(false); return; }
    setLoading(true);
    const qs = new URLSearchParams({
      type: spec.type,
      page: String(page),
      search,
      business: business || '', location: location || '', finYear: finYear || '',
    });
    Object.entries(applied).forEach(([k, v]) => { if (v) qs.set(k, v); });

    try {
      const r = await fetch(ENDPOINT + '?' + qs);
      const d = await r.json();
      setState({
        rows: d.rows || [], page: d.page || 1, pages: d.pages || 1, total: d.total || 0,
      });
    } finally {
      setLoading(false);
    }
  }, [spec.type, page, search, applied, business, location, finYear]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, applied, business, location, finYear]);

  const visible = spec.listColumns.filter((c) => !hidden.includes(c.t));
  const cell = (row, col) => (col.f ? fmt(col.f, row[col.k]) : (row[col.k] ?? ''));
  const exportHeaders = () => visible.map((c) => c.t);
  const exportRows = () => state.rows.map((r) => visible.map((c) => cell(r, c)));

  async function remove(id) {
    if (!window.confirm('Delete this voucher? It is a posted entry, so this reverses it.')) return;
    const r = await fetch(ENDPOINT + '/' + id, { method: 'DELETE' });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      window.alert(d.error || 'Could not delete that voucher.');
      return;
    }
    load();
  }

  return (
    <>
      {adding && (
        <VoucherForm
          spec={spec}
          onClose={() => setAdding(false)}
          onDone={(d) => {
            setAdding(false);
            setFlash('Voucher ' + (d.voucherNo || '') + ' saved.');
            setPage(1);
            load();
          }}
        />
      )}

      {/* ------------------------------------------------------- filter */}
      {spec.hasFilter && (
        <div className="card">
          <div className="card-head">
            <span className="card-title"><Icon name="filter" size={15} /> Filter</span>
          </div>
          <div className="card-body">
            <div className="grid grid-cols-1 items-end gap-x-[22px] gap-y-3.5 md:grid-cols-2 xl:grid-cols-5">
              <div>
                <label className="f-label">Voucher Number</label>
                <input
                  className="f-input"
                  placeholder={'e.g. ' + spec.prefix + '/26/00009'}
                  value={draft.voucherNo}
                  onChange={(e) => setDraft((d) => ({ ...d, voucherNo: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') setApplied(draft); }}
                />
              </div>
              <div>
                <label className="f-label">{spec.partyFilterLabel}</label>
                <input
                  className="f-input"
                  placeholder={spec.partyFilterPlaceholder}
                  value={draft.party}
                  onChange={(e) => setDraft((d) => ({ ...d, party: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter') setApplied(draft); }}
                />
              </div>
              <div>
                <label className="f-label">{spec.statusFilterLabel}</label>
                <select
                  className="f-input"
                  value={draft.status}
                  onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}
                >
                  {STATUS_OPTS.map((o) => <option key={o.l} value={o.v}>{o.l}</option>)}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-primary h-9 justify-center"
                onClick={() => setApplied(draft)}
              >
                Search
              </button>
              <button
                type="button"
                className="btn h-9 justify-center"
                onClick={() => { setDraft(blankFilter); setApplied(blankFilter); }}
              >
                Reset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --------------------------------------------------------- list */}
      <div className="card">
        <div className="card-head">
          <span className="card-title">{spec.title}</span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={load}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
        </div>

        <div className="card-body">
          {flash && <div className="flash flash-ok">{flash}</div>}
          {!business && <div className="flash flash-err">Select a business in the top bar.</div>}

          <Toolbar
            columns={spec.listColumns}
            hidden={hidden}
            onToggleColumn={(t) =>
              setHidden((h) => (h.includes(t) ? h.filter((x) => x !== t) : [...h, t]))}
            search={search}
            onSearch={setSearch}
            onAdd={() => setAdding(true)}
            showAdd={Boolean(business)}
            onExportCsv={() =>
              download(spec.slug + '.csv', toCsv(exportHeaders(), exportRows()), 'text/csv')}
            onExportExcel={() =>
              download(spec.slug + '.xls',
                toXlsHtml(spec.title, exportHeaders(), exportRows()),
                'application/vnd.ms-excel')}
            onExportPdf={() => printTable(spec.title, exportHeaders(), exportRows())}
          />

          <div className="mt-3 overflow-x-auto">
            <table className="dt">
              <thead>
                <tr>
                  {visible.map((c) => <th key={c.t}>{c.t}</th>)}
                  <th style={{ width: 90 }}>Action</th>
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
                    {visible.map((c) => (
                      <td key={c.t} className={c.f === 'amount' ? 'text-right' : ''}>
                        {cell(row, c)}
                      </td>
                    ))}
                    <td>
                      <button
                        type="button"
                        className="act-btn bg-danger"
                        title="Delete"
                        onClick={() => remove(row._id)}
                      >
                        <Icon name="trash" size={12} />
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
