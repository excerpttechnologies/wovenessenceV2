/* Report export for assistant answers.

   The workbook is built from the SAME payload the screen rendered, so the
   file and the answer cannot disagree: no query is re-run here and no figure
   is recomputed. The client posts back the answer it was given; the server
   validates the shape, caps the volume and writes the file.

   CSV is included because it opens everywhere; Excel because it keeps one
   sheet per table and preserves numbers as numbers. PDF is offered by the
   interface as the browser's print view, not generated here - the project
   already prints documents that way and has no PDF writer.

   CSV cell values starting with =, +, - or @ are prefixed with an apostrophe.
   That is spreadsheet formula-injection protection: a product name should
   never become a formula when the file is opened.
   ========================================================================== */

import * as XLSX from 'xlsx';

const MAX_TABLES = 20;
const MAX_ROWS = 2000;
const MAX_CELL = 500;
const MAX_SHEET_NAME = 31;

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).slice(0, MAX_CELL);
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : '';
}

function csvCell(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const raw = String(value).slice(0, MAX_CELL);
  const guarded = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

function sheetName(base, used) {
  let name = String(base || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, MAX_SHEET_NAME) || 'Sheet';
  let candidate = name;
  let index = 2;
  while (used.has(candidate)) {
    const suffix = ` ${index}`;
    candidate = name.slice(0, MAX_SHEET_NAME - suffix.length) + suffix;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function cellFor(column, value) {
  if (value === null || value === undefined || value === '') return '';
  if (column.format === 'money' || column.format === 'number' || column.format === 'units' || column.format === 'percent') {
    return numeric(value);
  }
  if (column.format === 'date') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? text(value) : date;
  }
  return text(value);
}

export function answerWorkbook(answer) {
  const book = XLSX.utils.book_new();
  const used = new Set();
  const meta = answer?.metadata || {};

  const summary = [
    ['Woven Essence AI Business Assistant'],
    [text(answer?.title || 'Answer')],
    ['Question', text(meta.question || '')],
    ['Reporting period', text(meta.period?.label || '')],
    ['Period from', text(meta.period?.from || '')],
    ['Period to', text(meta.period?.to || '')],
    ['Comparison', text(meta.period?.comparison?.label || '')],
    ['Company', text(meta.filters?.company || '')],
    ['Branch', text(meta.filters?.branch || '')],
    ['Channel', text(meta.filters?.channel || '')],
    ['Generated at', text(meta.generatedAt || '')],
    ['Reasoning', text(meta.reasoning?.mode === 'ai'
      ? `AI provider (${meta.reasoning.provider || ''} ${meta.reasoning.model || ''})`
      : 'Deterministic business intelligence layer')],
    ['Complete', meta.isComplete ? 'Yes' : 'No - see limitations'],
    [],
    ['KPI', 'Value', 'Change'],
    ...(answer?.kpis || []).map((card) => [text(card.label), text(card.display), text(card.changeLabel || '')]),
    [],
    ['Sources'],
    ...(meta.sources || []).map((source) => [text(source)]),
    [],
    ['Limitations'],
    ...(answer?.limitations || []).map((limitation) => [text(limitation)]),
    [],
    ['Answer'],
    [text(answer?.summary || '')],
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summary);
  summarySheet['!cols'] = [{ wch: 28 }, { wch: 60 }, { wch: 18 }];
  XLSX.utils.book_append_sheet(book, summarySheet, sheetName('Summary', used));

  (answer?.tables || []).slice(0, MAX_TABLES).forEach((table) => {
    const columns = Array.isArray(table.columns) ? table.columns : [];
    if (!columns.length) return;
    const rows = (Array.isArray(table.rows) ? table.rows : []).slice(0, MAX_ROWS);
    const aoa = [
      [text(table.title || 'Table')],
      columns.map((column) => text(column.label || column.key)),
      ...rows.map((row) => columns.map((column) => cellFor(column, row?.[column.key]))),
    ];
    if (table.note) {
      aoa.push([]);
      aoa.push([text(table.note)]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet['!cols'] = columns.map((column) => ({ wch: Math.min(40, Math.max(12, String(column.label || '').length + 4)) }));
    XLSX.utils.book_append_sheet(book, sheet, sheetName(table.title || 'Table', used));
  });

  const chartRows = [['Chart', 'Series or category', 'Label', 'Value']];
  (answer?.charts || []).forEach((chart) => {
    if (chart.type === 'line') {
      (chart.labels || []).forEach((label, index) => {
        (chart.series || []).forEach((series) => {
          chartRows.push([text(chart.title), text(series.name || ''), text(label), numeric(series.points?.[index])]);
        });
      });
      return;
    }
    (chart.data || []).forEach((point) => {
      chartRows.push([text(chart.title), '', text(point.label), numeric(point.value)]);
    });
  });
  if (chartRows.length > 1) {
    const sheet = XLSX.utils.aoa_to_sheet(chartRows);
    sheet['!cols'] = [{ wch: 32 }, { wch: 20 }, { wch: 28 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(book, sheet, sheetName('Chart data', used));
  }

  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });
}

export function answerCsv(answer) {
  const rows = [];
  const meta = answer?.metadata || {};
  rows.push(['Woven Essence AI Business Assistant']);
  rows.push(['Title', text(answer?.title || '')]);
  rows.push(['Question', text(meta.question || '')]);
  rows.push(['Period', text(meta.period?.label || '')]);
  rows.push(['Company', text(meta.filters?.company || '')]);
  rows.push(['Branch', text(meta.filters?.branch || '')]);
  rows.push(['Channel', text(meta.filters?.channel || '')]);
  rows.push(['Generated at', text(meta.generatedAt || '')]);
  rows.push([]);
  rows.push(['KPI', 'Value', 'Change']);
  (answer?.kpis || []).forEach((card) => rows.push([text(card.label), text(card.display), text(card.changeLabel || '')]));

  (answer?.tables || []).slice(0, MAX_TABLES).forEach((table) => {
    const columns = Array.isArray(table.columns) ? table.columns : [];
    if (!columns.length) return;
    rows.push([]);
    rows.push([text(table.title || 'Table')]);
    rows.push(columns.map((column) => text(column.label || column.key)));
    (Array.isArray(table.rows) ? table.rows : []).slice(0, MAX_ROWS).forEach((row) => {
      rows.push(columns.map((column) => {
        const value = row?.[column.key];
        if (['money', 'number', 'units', 'percent'].includes(column.format)) return Number.isFinite(Number(value)) ? Number(value) : '';
        return text(value);
      }));
    });
    if (table.note) rows.push([text(table.note)]);
  });

  rows.push([]);
  rows.push(['Answer']);
  rows.push([text(answer?.summary || '')]);

  if (answer?.limitations?.length) {
    rows.push([]);
    rows.push(['Limitations']);
    answer.limitations.forEach((limitation) => rows.push([text(limitation)]));
  }

  /* BOM so Excel opens UTF-8 names and the rupee sign correctly. */
  return '\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

export function answerFilename(answer, extension) {
  const base = String(answer?.title || 'ai-business-answer')
    .replace(/[^\w\s.-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/^-|-$/g, '') || 'ai-business-answer';
  const day = new Date().toISOString().slice(0, 10);
  return `${base}-${day}.${extension}`;
}
