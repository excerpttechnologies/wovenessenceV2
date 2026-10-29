/* Formatting for assistant answers.

   The server sends raw numbers for table cells and chart points, and a
   declared format for each column. Formatting happens here so the rupee
   grouping, compact chart axes and date style stay consistent with the rest
   of the ERP, which uses the same Indian number conventions. */

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function formatMoney(value, { compact = false, decimals = 0 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (compact) {
    if (abs >= 1e7) return `${sign}\u20B9${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 1)} Cr`;
    if (abs >= 1e5) return `${sign}\u20B9${(abs / 1e5).toFixed(abs >= 1e6 ? 0 : 1)} L`;
    if (abs >= 1e3) return `${sign}\u20B9${(abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
    return `${sign}\u20B9${Math.round(abs)}`;
  }
  return `${sign}\u20B9${(decimals ? inr2 : inr).format(abs)}`;
}

export function formatCount(value) {
  const n = Number(value);
  return Number.isFinite(n) ? number.format(n) : '-';
}

export function formatPercent(value, { signed = true, digits = 1 } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '-';
  return `${signed && n > 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

export function formatDate(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata',
  }).format(date);
}

export function formatCell(value, format) {
  if (value === null || value === undefined || value === '') return '-';
  switch (format) {
    case 'money':
      return formatMoney(value);
    case 'percent':
      return formatPercent(value, { signed: false });
    case 'number':
      return formatCount(value);
    case 'units':
      return formatCount(value);
    case 'date':
      return formatDate(value);
    default:
      return String(value);
  }
}

export function formatChartValue(value, valueFormat) {
  if (valueFormat === 'money') return formatMoney(value);
  if (valueFormat === 'percent') return `${formatCount(value)}%`;
  return formatCount(value);
}

export function trendTone(change) {
  if (change === null || change === undefined || !Number.isFinite(Number(change))) return 'flat';
  if (Number(change) > 0) return 'up';
  if (Number(change) < 0) return 'down';
  return 'flat';
}

/* Plain-text version for the clipboard and the print window. */
export function answerToText(answer) {
  if (!answer) return '';
  const lines = [answer.title || 'AI Business Assistant'];
  if (answer.summary) lines.push('', answer.summary.replace(/\*\*/g, ''));
  if (answer.kpis?.length) {
    lines.push('', 'Key figures');
    answer.kpis.forEach((card) => {
      lines.push(`- ${card.label}: ${card.display}${card.changeLabel ? ` (${card.changeLabel})` : ''}`);
    });
  }
  (answer.tables || []).forEach((table) => {
    lines.push('', table.title || 'Table');
    const columns = table.columns || [];
    lines.push(columns.map((column) => column.label).join(' | '));
    (table.rows || []).slice(0, 100).forEach((row) => {
      lines.push(columns.map((column) => formatCell(row?.[column.key], column.format)).join(' | '));
    });
  });
  if (answer.metadata?.period?.label) lines.push('', `Period: ${answer.metadata.period.label}`);
  if (answer.metadata?.sources?.length) lines.push(`Sources: ${answer.metadata.sources.join('; ')}`);
  if (answer.limitations?.length) {
    lines.push('', 'Limitations');
    answer.limitations.forEach((limitation) => lines.push(`- ${limitation}`));
  }
  return lines.join('\n');
}

export function conversationTitle(question) {
  const text = String(question || '').trim();
  if (!text) return 'New conversation';
  return text.length > 48 ? `${text.slice(0, 45)}...` : text;
}
