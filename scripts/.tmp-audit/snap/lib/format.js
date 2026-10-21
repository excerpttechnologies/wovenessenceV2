export function fmt(kind, value, labels = {}) {
  if (value === null || value === undefined || value === '') return '';
  switch (kind) {
    case 'ref': return labels[String(value)] || '';
    case 'activeText': return String(value);
    case 'yesno': return value === true ? 'Yes' : value === false ? 'No' : String(value);
    case 'amount': return Number(value).toFixed(2);
    case 'date': {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      const p = (n) => String(n).padStart(2, '0');
      return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear();
    }
    case 'datetime': {
      const d = new Date(value);
      if (Number.isNaN(d.getTime())) return String(value);
      const p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
        + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }
    case 'dash': return String(value);
    case 'list': return Array.isArray(value) ? value.join(', ') : String(value);
    case 'count': return Array.isArray(value) ? String(value.length) : '0';
    default: return String(value);
  }
}

/* Exports without a library: CSV and an Excel-readable HTML table, print for PDF. */
export function download(name, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(headers, rows) {
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  return [headers.map(esc).join(','), ...rows.map((r) => r.map(esc).join(','))].join('\r\n');
}

export function toXlsHtml(title, headers, rows) {
  const th = headers.map((h) => '<th>' + h + '</th>').join('');
  const tr = rows.map((r) => '<tr>' + r.map((c) => '<td>' + (c ?? '') + '</td>').join('') + '</tr>').join('');
  return '<html><head><meta charset="utf-8"></head><body><table border="1">'
    + '<thead><tr>' + th + '</tr></thead><tbody>' + tr + '</tbody></table></body></html>';
}

export function printTable(title, headers, rows) {
  const w = window.open('', '_blank');
  if (!w) return;
  const th = headers.map((h) => '<th>' + h + '</th>').join('');
  const tr = rows.map((r) => '<tr>' + r.map((c) => '<td>' + (c ?? '') + '</td>').join('') + '</tr>').join('');
  w.document.write(
    '<html><head><title>' + title + '</title><style>'
    + 'body{font-family:Arial;padding:20px}h3{margin:0 0 12px}'
    + 'table{border-collapse:collapse;width:100%;font-size:12px}'
    + 'th,td{border:1px solid #ccc;padding:6px;text-align:left}th{background:#f2f4f8}'
    + '</style></head><body><h3>' + title + '</h3><table><thead><tr>'
    + th + '</tr></thead><tbody>' + tr + '</tbody></table></body></html>'
  );
  w.document.close();
  w.print();
}
