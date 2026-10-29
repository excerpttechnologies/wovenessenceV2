'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import Chart from './Charts';
import {
  answerToText, formatCell, formatDateTime, trendTone,
} from './formatters';

/* One answer: prose, KPI cards, charts, tables, the period it covers and the
   sources it came from. The same component renders a page answer and a
   floating-panel answer. */

function inlineBold(text) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => (
    part.startsWith('**') && part.endsWith('**')
      ? <strong key={index} className="font-semibold text-ink">{part.slice(2, -2)}</strong>
      : <span key={index}>{part}</span>
  ));
}

function RichText({ text }) {
  const blocks = useMemo(() => String(text || '').split(/\n{2,}/).filter(Boolean), [text]);
  return (
    <div className="space-y-2.5 text-[13.5px] leading-relaxed text-cell">
      {blocks.map((block, index) => {
        const lines = block.split('\n');
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={index} className="ml-4 list-disc space-y-1">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{inlineBold(line.replace(/^\s*[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                {lineIndex > 0 && <br />}
                {inlineBold(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function ChangePill({ change, changeLabel }) {
  const tone = trendTone(change);
  if (change === null || change === undefined || !changeLabel) return null;
  const styles = tone === 'up'
    ? 'bg-[#e8f7ee] text-[#116b3c]'
    : tone === 'down'
      ? 'bg-[#fdecea] text-[#a12a22]'
      : 'bg-[#f0f3f6] text-[#5b6878]';
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${styles}`}>
      {tone === 'up' ? '\u2191' : tone === 'down' ? '\u2193' : '\u2022'} {changeLabel}
    </span>
  );
}

function KpiCard({ card }) {
  return (
    <div className="rounded-xl border border-line bg-white p-3.5 shadow-[0_1px_2px_rgba(20,30,60,0.04)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-inkmuted">{card.label}</p>
      <div className="mt-1.5 flex flex-wrap items-baseline gap-2">
        <p className="text-[19px] font-bold leading-tight text-ink">{card.display}</p>
        <ChangePill change={card.change} changeLabel={card.changeLabel} />
      </div>
      {card.note && <p className="mt-1.5 text-[11px] leading-snug text-inkmuted">{card.note}</p>}
    </div>
  );
}

function DataTable({ table }) {
  const columns = table.columns || [];
  const rows = table.rows || [];
  if (!columns.length) return null;
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <p className="text-[13px] font-bold text-ink">{table.title}</p>
        <span className="text-[11px] text-inkmuted">{rows.length} row{rows.length === 1 ? '' : 's'}</span>
      </div>
      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-thead">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  className={'whitespace-nowrap px-3 py-2 font-semibold text-cell ' + (column.align === 'right' ? 'text-right' : 'text-left')}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-6 text-center text-inkmuted">
                  No rows for this selection.
                </td>
              </tr>
            )}
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex % 2 ? 'bg-rowalt' : 'bg-white'}>
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={
                      'px-3 py-1.5 ' +
                      (column.align === 'right' ? 'text-right tabular-nums ' : '') +
                      (column.format === 'text' ? 'text-ink' : 'text-cell')
                    }
                  >
                    {formatCell(row?.[column.key], column.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {table.note && <p className="border-t border-line px-4 py-2 text-[11px] leading-snug text-inkmuted">{table.note}</p>}
    </div>
  );
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* PDF is the browser's print dialog on a standalone, print-styled document.
   Opening our own window keeps the ERP's own print rules untouched, which is
   exactly what "do not alter existing functionality" requires. */
function openPrintView(answer, options) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    options?.onError?.('The print window was blocked. Allow pop-ups for this site and try again.');
    return;
  }

  const kpis = (answer.kpis || []).map((card) => `
    <tr><td>${escapeHtml(card.label)}</td><td class="right">${escapeHtml(card.display)}</td><td class="right">${escapeHtml(card.changeLabel || '')}</td></tr>
  `).join('');

  const tables = (answer.tables || []).map((table) => {
    const columns = table.columns || [];
    const head = columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join('');
    const body = (table.rows || []).map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(formatCell(row?.[column.key], column.format))}</td>`).join('')}</tr>`).join('');
    return `<h2>${escapeHtml(table.title)}</h2><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }).join('');

  const limitations = (answer.limitations || []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
  const meta = answer.metadata || {};

  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>${escapeHtml(answer.title || 'AI Business Assistant')}</title>
    <style>
      @page { size: A4; margin: 14mm; }
      body { font-family: "Nunito Sans", "Segoe UI", Arial, sans-serif; color: #223047; font-size: 11px; }
      h1 { font-size: 18px; margin: 0 0 4px; }
      h2 { font-size: 12px; margin: 18px 0 6px; }
      .muted { color: #6b7a94; font-size: 10px; }
      .summary { white-space: pre-wrap; line-height: 1.5; margin: 12px 0; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      th, td { border-bottom: 1px solid #e3e8f0; padding: 4px 6px; text-align: left; vertical-align: top; }
      th { background: #f4f8f6; font-size: 10px; text-transform: uppercase; letter-spacing: .03em; }
      td.right, th.right { text-align: right; }
      ul { margin: 4px 0 0 16px; padding: 0; }
      .foot { margin-top: 18px; border-top: 1px solid #e3e8f0; padding-top: 8px; }
    </style></head><body>
    <h1>${escapeHtml(answer.title || 'AI Business Assistant')}</h1>
    <p class="muted">Woven Essence &middot; ${escapeHtml(meta.period?.label || '')} &middot; ${escapeHtml(meta.filters?.company || '')} / ${escapeHtml(meta.filters?.branch || '')}</p>
    <div class="summary">${escapeHtml(String(answer.summary || '').replace(/\*\*/g, ''))}</div>
    ${kpis ? `<h2>Key figures</h2><table><thead><tr><th>Metric</th><th class="right">Value</th><th class="right">Change</th></tr></thead><tbody>${kpis}</tbody></table>` : ''}
    ${tables}
    ${limitations ? `<h2>Limitations</h2><ul>${limitations}</ul>` : ''}
    <div class="foot muted">Sources: ${escapeHtml((meta.sources || []).join('; ') || 'n/a')} &middot; Generated ${escapeHtml(formatDateTime(meta.generatedAt))} &middot; ${escapeHtml(meta.reasoning?.mode === 'ai' ? `AI reasoning (${meta.reasoning.provider || ''} ${meta.reasoning.model || ''})` : 'Deterministic business intelligence layer')}</div>
    </body></html>`);
  win.document.close();
  win.focus();
  win.print();
}

export default function AnswerView({ answer, onAsk, onRetry, compact = false }) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');

  if (!answer) return null;

  const meta = answer.metadata || {};
  const isAi = meta.reasoning?.mode === 'ai';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answerToText(answer));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy failed. Your browser may have blocked clipboard access.');
    }
  };

  const download = async (format) => {
    setExporting(format);
    setError('');
    try {
      const response = await fetch('/api/ai-assistant/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answer, format }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'The export could not be built.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = match?.[1] || `ai-answer.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 4000);
    } catch (err) {
      setError(err.message || 'The export could not be built.');
    } finally {
      setExporting('');
    }
  };

  return (
    <article className="space-y-3.5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight text-ink">{answer.title}</h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-inkmuted">
            <span className="inline-flex items-center gap-1 rounded-full bg-[#e8f7ee] px-2 py-0.5 font-semibold text-[#116b3c]">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              {isAi ? 'AI reasoning' : 'Deterministic analysis'}
            </span>
            {meta.period?.label && <span>{meta.period.label}</span>}
            {meta.period?.comparison?.label && <span>vs {meta.period.comparison.label}</span>}
            {meta.filters?.branch && <span>&middot; {meta.filters.branch}</span>}
            {meta.filters?.channel && meta.filters.channel !== 'All channels' && <span>&middot; {meta.filters.channel}</span>}
            {meta.generatedAt && <span>&middot; {formatDateTime(meta.generatedAt)}</span>}
          </div>
        </div>

        <div className="no-print flex shrink-0 items-center gap-1">
          <button type="button" onClick={copy} className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand">
            {copied ? 'Copied' : 'Copy'}
          </button>
          <button type="button" onClick={() => download('xlsx')} disabled={exporting === 'xlsx'} className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand disabled:opacity-60">
            {exporting === 'xlsx' ? 'Building...' : 'Excel'}
          </button>
          <button type="button" onClick={() => download('csv')} disabled={exporting === 'csv'} className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand disabled:opacity-60">
            {exporting === 'csv' ? 'Building...' : 'CSV'}
          </button>
          <button type="button" onClick={() => openPrintView(answer, { onError: setError })} className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand">
            PDF
          </button>
          {onRetry && (
            <button type="button" onClick={onRetry} className="rounded-md border border-line bg-white px-2 py-1 text-[11px] font-semibold text-cell hover:border-brand hover:text-brand">
              Retry
            </button>
          )}
        </div>
      </header>

      <div className="rounded-xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(20,30,60,0.04)]">
        <RichText text={answer.summary} />
      </div>

      {answer.kpis?.length > 0 && (
        <div className={'grid gap-2.5 sm:grid-cols-2 ' + (compact ? '' : 'lg:grid-cols-3')}>
          {answer.kpis.map((card) => <KpiCard key={`${card.label}-${card.key || ''}`} card={card} />)}
        </div>
      )}

      {answer.charts?.length > 0 && (
        <div className={'grid gap-3 ' + (compact || answer.charts.length === 1 ? '' : 'lg:grid-cols-2')}>
          {answer.charts.map((chart, index) => (
            <div key={`${chart.title}-${index}`} className={chart.type === 'line' ? 'lg:col-span-2' : ''}>
              <Chart chart={chart} />
            </div>
          ))}
        </div>
      )}

      {answer.tables?.length > 0 && (
        <div className="space-y-3">
          {answer.tables.map((table, index) => <DataTable key={`${table.title}-${index}`} table={table} />)}
        </div>
      )}

      {answer.limitations?.length > 0 && (
        <details className="rounded-xl border border-[#efe2b8] bg-[#fdf9ee] px-4 py-3">
          <summary className="cursor-pointer text-[12px] font-semibold text-[#6b5a1e]">
            {answer.limitations.length} limitation{answer.limitations.length === 1 ? '' : 's'} and data notes
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-4 text-[11.5px] leading-snug text-[#6b5a1e]">
            {answer.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}
          </ul>
        </details>
      )}

      <footer className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-inkmuted">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="font-semibold text-cell">Sources:</span>
          {(meta.sources || []).length
            ? meta.sources.map((source) => (
              <span key={source} className="rounded-full bg-pillgrey px-2 py-0.5">{source}</span>
            ))
            : <span>Not available</span>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(answer.links || []).map((link) => (
            <Link key={link.href} href={link.href} className="font-semibold text-brand-link hover:underline">
              {link.label} &rarr;
            </Link>
          ))}
        </div>
      </footer>

      {answer.followUps?.length > 0 && onAsk && (
        <div className="no-print flex flex-wrap gap-1.5">
          {answer.followUps.map((question) => (
            <button
              key={question}
              type="button"
              onClick={() => onAsk(question)}
              className="rounded-full border border-line bg-white px-2.5 py-1 text-[11.5px] text-cell transition-colors hover:border-brand hover:text-brand"
            >
              {question}
            </button>
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-[#f3c9c5] bg-[#fdf1f0] px-3 py-2 text-[11.5px] text-[#a12a22]">{error}</p>
      )}
    </article>
  );
}
