'use client';

import { useMemo, useState } from 'react';
import {
  LuArrowLeft, LuArrowRight, LuCheck, LuDownload, LuFileSpreadsheet, LuRefreshCw, LuUpload, LuX,
} from 'react-icons/lu';
import Icon from './Icon';
import { useScope } from './ScopeContext';
import {
  FILTERS, ROW_STATUS_LABELS, ROW_STATUS_TONES,
  STRATEGIES, STRATEGY_LABELS, STRATEGY_DESCRIPTIONS,
  MASTER_SLUGS, CREATABLE_MASTERS,
} from '@/lib/itemWiseSummaryConstants';

/* ==========================================================================
   ADD IMPORT - Item Wise Summary.

   The operator downloads the ERP's own 33-column template, fills it, and
   walks the same steps the server enforces: upload -> validate -> resolve
   missing masters -> preview -> confirm -> results. Nothing is written until
   the confirm step, and the executed import is the server's re-parse of this
   file, not the rows rendered here.
   ========================================================================== */

const STEPS = [
  { key: 'upload', label: 'Upload' },
  { key: 'review', label: 'Review' },
  { key: 'preview', label: 'Preview' },
  { key: 'result', label: 'Results' },
];

function Modal({ title, onClose, children, footer, busy }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[calc(100vh-2rem)] w-full max-w-[1240px] flex-col rounded-lg bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <span className="text-[15px] font-bold uppercase tracking-wide">{title}</span>
          <button type="button" onClick={onClose} disabled={busy} className="text-2xl leading-none text-inkmuted disabled:opacity-50" aria-label="Close">
            <LuX size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = 'text-ink' }) {
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-inkmuted">{label}</div>
      <div className={'mt-0.5 text-[18px] font-bold ' + tone}>{value}</div>
    </div>
  );
}


export default function ItemWiseSummaryImport() {
  const { business: scopeBusiness, businesses, finYear: scopeFinYear } = useScope();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [business, setBusiness] = useState(scopeBusiness || '');
  const [finYear, setFinYear] = useState(scopeFinYear || '');
  const [strategy, setStrategy] = useState(STRATEGIES.CREATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [token, setToken] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [checked, setChecked] = useState({});
  const [filter, setFilter] = useState('all');
  const [preview, setPreview] = useState({ rows: [], page: 1, pages: 1, total: 0 });
  const [confirmed, setConfirmed] = useState(false);
  const [replaceStock, setReplaceStock] = useState(false);
  const [force, setForce] = useState(false);
  const [result, setResult] = useState(null);

  const summary = analysis?.summary || {};
  const missingMasters = analysis?.missingMasters || [];

  const creatableMissing = useMemo(
    () => missingMasters.filter((entry) => entry.creatable && CREATABLE_MASTERS.has(entry.type)),
    [missingMasters],
  );

  const approvals = useMemo(() => {
    const out = {};
    Object.entries(checked).forEach(([key, on]) => {
      if (!on) return;
      const [type, ...rest] = key.split('|');
      const slug = MASTER_SLUGS[type];
      if (!slug) return;
      if (!out[slug]) out[slug] = [];
      out[slug].push(rest.join('|'));
    });
    return out;
  }, [checked]);

  function reset() {
    setStep('upload');
    setFile(null);
    setError('');
    setToken('');
    setAnalysis(null);
    setChecked({});
    setFilter('all');
    setPreview({ rows: [], page: 1, pages: 1, total: 0 });
    setConfirmed(false);
    setReplaceStock(false);
    setForce(false);
    setResult(null);
    setBusiness(scopeBusiness || '');
    setFinYear(scopeFinYear || '');
    setStrategy(STRATEGIES.CREATE);
  }

  function start() {
    reset();
    setOpen(true);
  }

  function close() {
    if (busy) return;
    setOpen(false);
  }

  async function runAnalyze({ nextStrategy = strategy, nextChecked = checked } = {}) {
    if (!file) {
      setError('Choose the completed Item Wise Summary workbook first.');
      return;
    }
    if (!business) {
      setError('Select the business this workbook belongs to.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const form = new FormData();
      form.append('action', 'analyze');
      form.append('file', file);
      form.append('fileName', file.name || '');
      form.append('business', business);
      form.append('finYear', finYear);
      form.append('strategy', nextStrategy);
      form.append('approvals', JSON.stringify(approvalList(nextChecked)));

      const response = await fetch('/api/item-wise-summary-import', { method: 'POST', body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The workbook could not be validated.');

      setToken(data.token);
      setAnalysis(data);
      setStrategy(nextStrategy);
      if (!Object.keys(nextChecked).length && nextStrategy === STRATEGIES.CREATE) {
        setChecked(defaultChecked(data.missingMasters || []));
      }
      setStep('review');
      setConfirmed(false);
    } catch (e) {
      setError(e.message);
      setStep('upload');
    } finally {
      setBusy(false);
    }
  }

  function approvalList(checkedMap) {
    const out = {};
    Object.entries(checkedMap || {}).forEach(([key, on]) => {
      if (!on) return;
      const [type, ...rest] = key.split('|');
      const slug = MASTER_SLUGS[type];
      if (!slug) return;
      if (!out[slug]) out[slug] = [];
      out[slug].push(rest.join('|'));
    });
    return out;
  }

  function defaultChecked(list) {
    const state = {};
    list.forEach((entry) => {
      if (entry.creatable) state[`${entry.type}|${entry.value}`] = false;
    });
    return state;
  }

  async function loadPreview(nextFilter = filter, page = 1) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/item-wise-summary-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview', token, filter: nextFilter, page, pageSize: 50,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The preview could not be loaded.');
      setPreview({ rows: data.rows || [], page: data.page || 1, pages: data.pages || 1, total: data.total || 0 });
      setFilter(nextFilter);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function continueToPreview() {
    if (!token) return;
    if (strategy !== analysis?.strategy) {
      await runAnalyze({ nextStrategy: strategy, nextChecked: checked });
      return;
    }
    if (strategy === STRATEGIES.CREATE) {
      const changed = creatableMissing.some((entry) => Boolean(checked[`${entry.type}|${entry.value}`]) !== Boolean(entry.approved));
      if (changed) {
        await runAnalyze({ nextStrategy: strategy, nextChecked: checked });
        return;
      }
    }
    setStep('preview');
    await loadPreview('all', 1);
  }

  async function executeImport() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/item-wise-summary-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          token,
          strategy,
          approvals: approvals,
          replaceStock,
          confirm: true,
          force,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'The import failed.');
      setResult(data);
      setStep('result');
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function toggleMissing(entry) {
    const key = `${entry.type}|${entry.value}`;
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  const readyCount = Number(summary.importable || 0);
  const missingApprovedCount = creatableMissing.filter((entry) => entry.approved).length;

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={start}>
        <LuUpload size={15} /> Item Wise Import
      </button>

      {open && (
        <Modal
          title="Add Import — Item Wise Summary"
          onClose={close}
          busy={busy}
          footer={
            <>
              {step === 'upload' && (
                <>
                  <a
                    className="btn"
                    href="/api/item-wise-summary-import?template=1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <LuDownload size={14} /> Download Template
                  </a>
                  <button type="button" className="btn btn-primary" onClick={() => runAnalyze()} disabled={busy || !file || !business}>
                    {busy ? <span className="spin" /> : <Icon name="check" size={14} />} Validate Excel
                  </button>
                </>
              )}
              {step === 'review' && (
                <>
                  <button type="button" className="btn" onClick={() => setStep('upload')} disabled={busy}>
                    <LuArrowLeft size={14} /> Back
                  </button>
                  <button type="button" className="btn" onClick={() => runAnalyze({ nextStrategy: strategy, nextChecked: checked })} disabled={busy || !file}>
                    <LuRefreshCw size={14} /> Re-validate
                  </button>
                  <button type="button" className="btn btn-primary" onClick={continueToPreview} disabled={busy || !token || readyCount === 0}>
                    Preview <LuArrowRight size={14} />
                  </button>
                </>
              )}
              {step === 'preview' && (
                <>
                  <button type="button" className="btn" onClick={() => setStep('review')} disabled={busy}>
                    <LuArrowLeft size={14} /> Back
                  </button>
                  <button type="button" className="btn btn-primary" onClick={executeImport} disabled={busy || !confirmed}>
                    {busy ? <span className="spin" /> : <LuCheck size={14} />} Import {readyCount.toLocaleString()} rows
                  </button>
                </>
              )}
              {step === 'result' && (
                <>
                  {token && (
                    <a className="btn" href={`/api/item-wise-summary-import?errors=${token}`}>
                      <LuDownload size={14} /> Download Error Report
                    </a>
                  )}
                  <button type="button" className="btn btn-primary" onClick={close}>Done</button>
                </>
              )}
            </>
          }
        >
          <div className="mb-4 flex flex-wrap items-center gap-2 text-[12px] font-semibold text-inkmuted">
            {STEPS.map((entry, index) => {
              const active = entry.key === step;
              const passed = STEPS.findIndex((s) => s.key === step) > index;
              return (
                <span key={entry.key} className="flex items-center gap-2">
                  <span className={
                    'flex h-5 w-5 items-center justify-center rounded-full text-[11px] ' +
                    (active ? 'bg-brand text-white' : passed ? 'bg-okgreenbg text-okgreen' : 'bg-[#eef2f8] text-inkmuted')
                  }>
                    {passed ? '✓' : index + 1}
                  </span>
                  {entry.label}
                  {index < STEPS.length - 1 && <span className="text-line">—</span>}
                </span>
              );
            })}
          </div>

          {error && <div className="flash flash-err">{error}</div>}

          {step === 'upload' && (
            <div className="space-y-3">
              <p className="text-[13px] text-inkmuted">
                Download the exact 33-column template, fill one row per item barcode, and upload it here.
                The workbook is validated and previewed before anything is saved. Existing masters are
                matched; missing masters are listed for approval.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[13px] text-ink">Business <span className="f-req">*</span></span>
                  <select className="f-input w-full" value={business} onChange={(e) => setBusiness(e.target.value)} disabled={busy}>
                    <option value="">Select business</option>
                    {(businesses || []).map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[13px] text-ink">Financial Year</span>
                  <input className="f-input w-full" value={finYear} onChange={(e) => setFinYear(e.target.value)} placeholder="e.g. 2026-2027" disabled={busy} />
                </label>
              </div>
              <label className="block">
                <span className="mb-1 block text-[13px] text-ink">Completed workbook <span className="f-req">*</span></span>
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="f-input w-full"
                  disabled={busy}
                  onChange={(e) => {
                    setFile(e.target.files?.[0] || null);
                    setError('');
                  }}
                />
              </label>
              <div className="rounded-lg border border-line bg-[#f7f9fc] p-3 text-[12px] text-inkmuted">
                <div className="flex items-center gap-2 font-semibold text-ink">
                  <LuFileSpreadsheet size={15} /> Worksheet: Item Wise Summary
                </div>
                <p className="mt-1">
                  Keep row 1 unchanged. Close Qty is imported as the on-hand opening balance; Open, Inward and
                  Outward are kept as summary information and are not turned into purchase or sales transactions.
                  When the Barcode column is blank, the Item Code is used as the barcode key (the same convention as
                  the existing opening-stock import).
                </p>
              </div>
            </div>
          )}

          {step === 'review' && analysis && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <Stat label="Excel rows" value={Number(summary.totalRows || 0).toLocaleString()} />
                <Stat label="Ready" value={Number(summary.importable || 0).toLocaleString()} tone="text-okgreen" />
                <Stat label="Missing master" value={Number(summary.missingMaster || 0).toLocaleString()} tone="text-[#9a6400]" />
                <Stat label="Invalid" value={Number(summary.invalid || 0).toLocaleString()} tone="text-danger" />
                <Stat label="Duplicate" value={Number(summary.duplicate || 0).toLocaleString()} tone="text-danger" />
                <Stat label="Existing" value={Number(summary.existingBarcodeRows || 0).toLocaleString()} tone="text-inkmuted" />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-line">
                  <div className="border-b border-line px-3 py-2 text-[13px] font-semibold">Workbook</div>
                  <div className="space-y-1 px-3 py-2 text-[12px]">
                    <div><span className="text-inkmuted">File:</span> {analysis.fileName || file?.name}</div>
                    <div><span className="text-inkmuted">Layout:</span> {analysis.layoutLabel}</div>
                    <div><span className="text-inkmuted">Sheet:</span> {analysis.sheetName} (header row {analysis.headerRow})</div>
                    <div><span className="text-inkmuted">Zero-stock rows skipped:</span> {Number(summary.zeroQty || 0).toLocaleString()}</div>
                    <div><span className="text-inkmuted">Ignored total row(s):</span> {Number(summary.totalRowsIgnored || 0).toLocaleString()}</div>
                    <div><span className="text-inkmuted">Importable quantity:</span> {Number(summary.totalQty || 0).toLocaleString()}</div>
                    <div><span className="text-inkmuted">Importable value:</span> {Number(summary.totalValue || 0).toLocaleString()}</div>
                  </div>
                </div>

                <div className="rounded-lg border border-line">
                  <div className="border-b border-line px-3 py-2 text-[13px] font-semibold">Excel locations</div>
                  <div className="max-h-40 overflow-y-auto px-3 py-2 text-[12px]">
                    {(analysis.locations || []).map((location) => (
                      <div key={location.name} className="flex items-center justify-between gap-2 border-b border-line/60 py-1 last:border-0">
                        <span className={location.inBusiness ? '' : 'text-danger'}>{location.name}</span>
                        <span className="text-inkmuted">
                          {Number(location.rows).toLocaleString()} rows · {Number(location.qty).toLocaleString()} qty
                          {!location.inBusiness ? ' · location not in this business' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-lg border border-line">
                <div className="border-b border-line px-3 py-2 text-[13px] font-semibold">Import mode</div>
                <div className="space-y-2 px-3 py-2">
                  {Object.values(STRATEGIES).map((key) => (
                    <label key={key} className="flex items-start gap-2 text-[12.5px]">
                      <input
                        type="radio"
                        name="item-wise-strategy"
                        className="mt-1"
                        checked={strategy === key}
                        disabled={busy}
                        onChange={() => setStrategy(key)}
                      />
                      <span>
                        <span className="font-semibold text-ink">{STRATEGY_LABELS[key]}</span>
                        <span className="block text-[11.5px] text-inkmuted">{STRATEGY_DESCRIPTIONS[key]}</span>
                      </span>
                    </label>
                  ))}
                  {strategy === STRATEGIES.UPDATE && (
                    <label className="flex items-center gap-2 pl-6 text-[12.5px] font-semibold text-danger">
                      <input type="checkbox" checked={replaceStock} onChange={(e) => setReplaceStock(e.target.checked)} />
                      Replace the existing stock quantity for these barcodes
                    </label>
                  )}
                  {strategy !== analysis.strategy && (
                    <div className="flash flash-err mb-0">
                      The preview was validated for a different mode. Use <strong>Re-validate</strong> before continuing.
                    </div>
                  )}
                </div>
              </div>

              {missingMasters.length > 0 && (
                <div className="rounded-lg border border-[#e7c96b] bg-[#fff8e6]">
                  <div className="flex items-center justify-between border-b border-[#e7c96b] px-3 py-2 text-[13px] font-semibold text-[#8a5a00]">
                    <span>Missing masters</span>
                    <span>{missingMasters.length.toLocaleString()} values · {missingApprovedCount} approved for creation</span>
                  </div>
                  <div className="max-h-64 overflow-y-auto px-3 py-2 text-[12px]">
                    {missingMasters.slice(0, 200).map((entry) => (
                      <label key={`${entry.type}|${entry.value}`} className="flex items-center justify-between gap-2 border-b border-[#e7c96b]/50 py-1 last:border-0">
                        <span className="flex items-center gap-2">
                          {entry.creatable && strategy === STRATEGIES.CREATE ? (
                            <input
                              type="checkbox"
                              checked={Boolean(checked[`${entry.type}|${entry.value}`])}
                              onChange={() => toggleMissing(entry)}
                            />
                          ) : (
                            <span className="inline-block w-[13px]" />
                          )}
                          <span className="font-semibold">{entry.type}</span>
                          <span>{entry.value}</span>
                          {entry.name && entry.name !== entry.value ? <span className="text-inkmuted">({entry.name})</span> : null}
                        </span>
                        <span className="text-inkmuted">
                          {entry.count.toLocaleString()} rows · row {entry.firstRow}
                          {!entry.creatable ? ' · create it in the master screen' : ''}
                          {entry.approved ? ' · approved' : ''}
                        </span>
                      </label>
                    ))}
                    {missingMasters.length > 200 && (
                      <div className="py-1 text-inkmuted">Showing the first 200 of {missingMasters.length}. The full list is in the error report.</div>
                    )}
                  </div>
                  <div className="px-3 pb-2 text-[11.5px] text-[#8a5a00]">
                    Tick the masters you approve for creation, then use <strong>Re-validate</strong>. Only approved
                    values are created. An Item needs its UOM and HSN to be existing or approved too. Locations are
                    never created from a stock summary.
                  </div>
                </div>
              )}

              {(analysis.warnings || []).length > 0 && (
                <div className="rounded-lg border border-line bg-[#f7f9fc] px-3 py-2 text-[12px]">
                  <div className="mb-1 font-semibold">Warnings ({analysis.warnings.length})</div>
                  <ul className="max-h-32 list-inside list-disc overflow-y-auto text-inkmuted">
                    {analysis.warnings.slice(0, 20).map((warning, index) => (
                      <li key={index}>Row {warning.row}: {warning.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {analysis.priorJob && (
                <div className="rounded-lg border border-[#e7c96b] bg-[#fff8e6] px-3 py-2 text-[12px] text-[#8a5a00]">
                  This workbook was already imported as job {analysis.priorJob.jobId}
                  {' '}({analysis.priorJob.status}). Existing barcodes are skipped, so a re-run cannot duplicate them.
                  Tick <strong>Re-run this workbook</strong> on the preview step to allow it.
                </div>
              )}
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {FILTERS.map((entry) => (
                  <button
                    key={entry.key}
                    type="button"
                    className={'btn h-8 px-2 ' + (filter === entry.key ? 'btn-dark' : '')}
                    onClick={() => loadPreview(entry.key, 1)}
                    disabled={busy}
                  >
                    {entry.label} ({Number(analysis?.filters?.[entry.key] || 0).toLocaleString()})
                  </button>
                ))}
              </div>

              <div className="max-h-[42vh] overflow-auto rounded-lg border border-line">
                <table className="w-full text-[12px]">
                  <thead className="sticky top-0 bg-[#f7f9fc] text-left">
                    <tr>
                      <th className="px-2 py-1.5">Row</th>
                      <th className="px-2 py-1.5">Status</th>
                      <th className="px-2 py-1.5">Barcode</th>
                      <th className="px-2 py-1.5">Item</th>
                      <th className="px-2 py-1.5">Location</th>
                      <th className="px-2 py-1.5 text-right">Qty</th>
                      <th className="px-2 py-1.5">Issue / note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((row) => (
                      <tr key={`${row.row}-${row.barcode}`} className="border-t border-line/70">
                        <td className="px-2 py-1.5">{row.row}</td>
                        <td className="px-2 py-1.5">
                          <span className={'rounded px-1.5 py-0.5 text-[11px] font-semibold ' + (ROW_STATUS_TONES[row.status] || 'bg-[#eef2f8] text-inkmuted')}>
                            {ROW_STATUS_LABELS[row.status] || row.status}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 font-mono">{row.barcode || '—'}{!row.barcodeProvided ? <span className="ml-1 text-[10px] text-inkmuted">(from Item Code)</span> : null}</td>
                        <td className="px-2 py-1.5">{row.itemCode} {row.itemName && row.itemName !== row.itemCode ? <span className="text-inkmuted">· {row.itemName}</span> : null}</td>
                        <td className="px-2 py-1.5">{row.locationName}</td>
                        <td className="px-2 py-1.5 text-right">{Number(row.qty || 0).toLocaleString()}{row.existingQty !== null && row.existingQty !== undefined ? <span className="block text-[10px] text-inkmuted">was {Number(row.existingQty).toLocaleString()}</span> : null}</td>
                        <td className="px-2 py-1.5 text-inkmuted">
                          {row.problems?.[0]?.message || row.warnings?.[0] || '—'}
                        </td>
                      </tr>
                    ))}
                    {!preview.rows.length && (
                      <tr><td colSpan={7} className="px-2 py-6 text-center text-inkmuted">No rows in this filter.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between text-[12px] text-inkmuted">
                <span>Showing {preview.total.toLocaleString()} row(s) in this filter · page {preview.page} of {preview.pages}</span>
                <span className="flex gap-2">
                  <button type="button" className="btn h-8 px-2" disabled={busy || preview.page <= 1} onClick={() => loadPreview(filter, preview.page - 1)}>Previous</button>
                  <button type="button" className="btn h-8 px-2" disabled={busy || preview.page >= preview.pages} onClick={() => loadPreview(filter, preview.page + 1)}>Next</button>
                </span>
              </div>

              <div className="rounded-lg border border-line bg-[#f7f9fc] px-3 py-2 text-[12px]">
                <div className="font-semibold">Ready to import: {readyCount.toLocaleString()} rows</div>
                <div className="text-inkmuted">
                  New barcodes: {Number(summary.create || 0).toLocaleString()} ·
                  {' '}Updates: {Number(summary.update || 0).toLocaleString()} ·
                  {' '}Quantity: {Number(summary.totalQty || 0).toLocaleString()} ·
                  {' '}Value: {Number(summary.totalValue || 0).toLocaleString()}
                </div>
                {strategy === STRATEGIES.UPDATE && !replaceStock && (
                  <div className="mt-1 font-semibold text-danger">Tick “Replace existing stock” on the review step before importing.</div>
                )}
                {analysis?.priorJob && (
                  <label className="mt-2 flex items-center gap-2 font-semibold text-[#8a5a00]">
                    <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
                    Re-run this workbook (job {analysis.priorJob.jobId} already imported it)
                  </label>
                )}
                <label className="mt-2 flex items-start gap-2 font-semibold">
                  <input type="checkbox" className="mt-0.5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
                  <span>
                    I reviewed this preview. Import the ready rows into the ERP. Existing barcodes are not recreated;
                    {strategy === STRATEGIES.UPDATE ? ' the selected barcodes have their quantity replaced.' : ' nothing outside the ready rows is changed.'}
                  </span>
                </label>
              </div>
            </div>
          )}

          {step === 'result' && result && (
            <div className="space-y-3">
              <div className={'rounded-lg px-4 py-3 ' + (result.status === 'FAILED' ? 'bg-[#fdecec] text-danger' : 'bg-okgreenbg text-okgreen')}>
                <div className="text-[15px] font-bold">
                  {result.status === 'FAILED' ? 'Import failed' : result.status === 'PARTIAL' ? 'Import completed with failures' : 'Import completed'}
                </div>
                <div className="text-[12px]">
                  Job {result.jobId} · {Number(result.result?.durationMs || 0).toLocaleString()} ms
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                <Stat label="Imported" value={Number(result.result?.imported || 0).toLocaleString()} tone="text-okgreen" />
                <Stat label="Updated" value={Number(result.result?.updated || 0).toLocaleString()} />
                <Stat label="Unchanged" value={Number(result.result?.unchanged || 0).toLocaleString()} />
                <Stat label="Skipped" value={Number(result.result?.skipped || 0).toLocaleString()} />
                <Stat label="Failed" value={Number(result.result?.failed || 0).toLocaleString()} tone="text-danger" />
                <Stat label="Masters created" value={Number(result.result?.mastersCreated || 0).toLocaleString()} />
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-lg border border-line px-3 py-2 text-[12px]">
                  <div className="font-semibold">Database result</div>
                  <div>Barcode rows created: {Number(result.result?.barcodesCreated || 0).toLocaleString()}</div>
                  <div>Barcode rows updated: {Number(result.result?.barcodesUpdated || 0).toLocaleString()}</div>
                  <div>Stock movements written: {Number(result.result?.stockAdjustments || 0).toLocaleString()}</div>
                  <div>Quantity imported: {Number(result.result?.totalQty || 0).toLocaleString()}</div>
                  <div>Value imported: {Number(result.result?.totalValue || 0).toLocaleString()}</div>
                  <div>Masters reused: {Number(result.result?.mastersReused || 0).toLocaleString()}</div>
                </div>
                <div className="rounded-lg border border-line px-3 py-2 text-[12px]">
                  <div className="font-semibold">Resulting analysis</div>
                  <div>Ready: {Number(result.summary?.importable || 0).toLocaleString()}</div>
                  <div>Missing master: {Number(result.summary?.missingMaster || 0).toLocaleString()}</div>
                  <div>Invalid: {Number(result.summary?.invalid || 0).toLocaleString()}</div>
                  <div>Existing / skipped: {Number(result.summary?.existingBarcodeRows || 0).toLocaleString()}</div>
                  {Object.entries(result.result?.mastersCreatedByType || {}).map(([type, count]) => (
                    <div key={type}>{type} created: {count}</div>
                  ))}
                </div>
              </div>

              {(result.result?.errors || []).length > 0 && (
                <div className="rounded-lg border border-line">
                  <div className="border-b border-line px-3 py-2 text-[13px] font-semibold">Row errors (first {result.result.errors.length})</div>
                  <div className="max-h-40 overflow-y-auto px-3 py-2 text-[12px]">
                    {result.result.errors.map((entry, index) => (
                      <div key={index} className="border-b border-line/60 py-1 last:border-0">
                        Row {entry.row} · {entry.barcode || entry.itemCode}: {entry.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(result.result?.masterFailures || []).length > 0 && (
                <div className="rounded-lg border border-[#e7c96b] bg-[#fff8e6] px-3 py-2 text-[12px] text-[#8a5a00]">
                  <div className="font-semibold">Masters that could not be created</div>
                  {result.result.masterFailures.map((entry, index) => (
                    <div key={index}>{entry.type} {entry.value}: {entry.message}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Modal>
      )}
    </>
  );
}
