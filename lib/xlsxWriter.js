import zlib from 'zlib';

/* ==========================================================================
   A SMALL .XLSX WRITER.

   The project already reads workbooks with SheetJS, but the community build
   cannot write cell styles, frozen panes, filters or data validation. The
   import template needs all four - a header you can read, a barcode column
   that stays text, dropdowns for the masters, and an error workbook that
   highlights what failed.

   An .xlsx is a zip of XML. This writes exactly the parts Excel needs and
   nothing else: workbook, styles, worksheets, core/app properties. It is
   deliberately tiny (no shared strings - strings are inline) so a 20,000-row
   error report stays quick to build.
   ========================================================================== */

/* Style indexes, shared by the template and the error workbook. */
export const STYLE = {
  DEFAULT: 0,
  TITLE: 1,
  NOTE: 2,
  HEADER: 3,
  HEADER_REQUIRED: 4,
  TEXT: 5,
  INTEGER: 6,
  DECIMAL: 7,
  DATE: 8,
  PERCENT: 9,
  CURRENCY: 10,
  WARNING: 11,
  REQUIRED_INPUT: 12,
  INPUT: 13,
};

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

const STYLES_XML = XML_HEADER + `
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="6">
    <numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>
    <numFmt numFmtId="165" formatCode="#,##0.00"/>
    <numFmt numFmtId="166" formatCode="@"/>
    <numFmt numFmtId="167" formatCode="0"/>
    <numFmt numFmtId="168" formatCode="0.00"/>
    <numFmt numFmtId="169" formatCode="#,##0.00;[Red]-#,##0.00"/>
  </numFmts>
  <fonts count="5">
    <font><sz val="11"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="14"/><color rgb="FF1F4E78"/><name val="Calibri"/><family val="2"/></font>
    <font><i/><sz val="10"/><color rgb="FF595959"/><name val="Calibri"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FF9C0006"/><name val="Calibri"/><family val="2"/></font>
  </fonts>
  <fills count="6">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFD9EAF7"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF2CC"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFCE4D6"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFBFBFBF"/></left>
      <right style="thin"><color rgb="FFBFBFBF"/></right>
      <top style="thin"><color rgb="FFBFBFBF"/></top>
      <bottom style="thin"><color rgb="FFBFBFBF"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="14">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
    <xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="169" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
    <xf numFmtId="0" fontId="0" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
    <xf numFmtId="166" fontId="0" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"/>
    <xf numFmtId="166" fontId="0" fillId="3" borderId="0" xfId="0" applyNumberFormat="1" applyFill="1"/>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>`;

/* ------------------------------------------------------------- zip ---- */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const time = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31);
  const day = (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  return { time, day };
}

function zip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  const stamp = dosDateTime();

  Object.entries(files).forEach(([name, content]) => {
    const nameBuffer = Buffer.from(name, 'utf8');
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const compressed = zlib.deflateRawSync(raw, { level: 6 });
    const crc = crc32(raw);

    const local = Buffer.alloc(30 + nameBuffer.length);
    local.writeUInt32LE(0x04034B50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);            // UTF-8 names
    local.writeUInt16LE(8, 8);                 // deflate
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuffer.copy(local, 30);
    localParts.push(local, compressed);

    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014B50, 0);
    central.writeUInt16LE(20, 4);              // version made by
    central.writeUInt16LE(20, 6);              // version needed
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt16LE(0, 30);              // extra
    central.writeUInt16LE(0, 32);              // comment
    central.writeUInt16LE(0, 34);              // disk
    central.writeUInt16LE(0, 36);              // internal attributes
    central.writeUInt32LE(0, 38);              // external attributes
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);
    centralParts.push(central);

    offset += local.length + compressed.length;
  });

  const centralSize = centralParts.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054B50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(centralParts.length, 8);
  end.writeUInt16LE(centralParts.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, ...centralParts, end]);
}

/* ------------------------------------------------------------ xml ---- */

function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function refOf(row, col) {
  return colName(col) + (row + 1);
}

function serialOfDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds());
  return (utc - Date.UTC(1899, 11, 30)) / 86400000;
}

function cellXml(cell, row, col) {
  if (cell === null || cell === undefined) return '';
  const value = typeof cell === 'object' && !(cell instanceof Date) && 'v' in cell ? cell.v : cell;
  if (value === null || value === undefined || value === '') return '';
  const style = typeof cell === 'object' && !(cell instanceof Date) && cell.s !== undefined ? cell.s : STYLE.DEFAULT;
  const type = typeof cell === 'object' && !(cell instanceof Date) && cell.t ? cell.t : null;
  const ref = refOf(row, col);
  const styleAttr = style ? ` s="${style}"` : '';

  if (type === 'n' || (type === null && typeof value === 'number' && Number.isFinite(value))) {
    return `<c r="${ref}"${styleAttr}><v>${value}</v></c>`;
  }
  if (type === 'b' || typeof value === 'boolean') {
    return `<c r="${ref}" t="b"${styleAttr}><v>${value ? 1 : 0}</v></c>`;
  }
  if (value instanceof Date || type === 'd') {
    const serial = serialOfDate(value);
    return serial === null ? '' : `<c r="${ref}"${styleAttr}><v>${serial}</v></c>`;
  }
  if (type === 'f') {
    return `<c r="${ref}"${styleAttr}><f>${esc(value)}</f></c>`;
  }
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function sheetXml(sheet) {
  const rows = sheet.rows || [];
  let maxCol = 0;
  rows.forEach((row) => { if (Array.isArray(row)) maxCol = Math.max(maxCol, row.length); });
  (sheet.cols || []).forEach((col, i) => { if (col) maxCol = Math.max(maxCol, i + 1); });
  const lastRef = refOf(Math.max(rows.length - 1, 0), Math.max(maxCol - 1, 0));

  const cols = (sheet.cols || []).length
    ? `<cols>${sheet.cols.map((col, i) => {
      if (!col) return '';
      const parts = [`min="${i + 1}"`, `max="${i + 1}"`, `width="${col.width || 12}"`, 'customWidth="1"'];
      if (col.style) parts.push(`style="${col.style}"`);
      if (col.hidden) parts.push('hidden="1"');
      return `<col ${parts.join(' ')}/>`;
    }).join('')}</cols>`
    : '';

  const pane = sheet.freeze
    ? `<pane ${sheet.freeze.col ? `xSplit="${sheet.freeze.col}"` : ''} ${sheet.freeze.row ? `ySplit="${sheet.freeze.row}"` : ''} topLeftCell="${refOf(sheet.freeze.row || 0, sheet.freeze.col || 0)}" activePane="${sheet.freeze.col && sheet.freeze.row ? 'bottomRight' : sheet.freeze.col ? 'topRight' : 'bottomLeft'}" state="frozen"/>`
    : '';

  const data = rows.map((row, r) => {
    if (!Array.isArray(row) || !row.length) return '';
    if (row.__skip) return '';
    const cells = row.map((cell, c) => cellXml(cell, r, c)).join('');
    return cells ? `<row r="${r + 1}">${cells}</row>` : '';
  }).join('');

  const autoFilter = sheet.autoFilter ? `<autoFilter ref="${esc(sheet.autoFilter)}"/>` : '';
  const merges = sheet.merges && sheet.merges.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${esc(m)}"/>`).join('')}</mergeCells>`
    : '';

  const validations = sheet.validations && sheet.validations.length
    ? `<dataValidations count="${sheet.validations.length}">${sheet.validations.map((v) => {
      const attrs = [
        `type="${v.type || 'list'}"`,
        `sqref="${esc(v.sqref)}"`,
        `allowBlank="${v.allowBlank === false ? 0 : 1}"`,
        `showInputMessage="${v.showInputMessage === false ? 0 : 1}"`,
      ];
      if (v.showErrorMessage !== false) {
        attrs.push('showErrorMessage="1"');
        attrs.push(`errorStyle="${v.errorStyle || 'stop'}"`);
      }
      if (v.promptTitle) attrs.push(`promptTitle="${esc(v.promptTitle)}"`);
      if (v.prompt) attrs.push(`prompt="${esc(v.prompt)}"`);
      if (v.errorTitle) attrs.push(`errorTitle="${esc(v.errorTitle)}"`);
      if (v.error) attrs.push(`error="${esc(v.error)}"`);
      if (v.operator) attrs.push(`operator="${esc(v.operator)}"`);
      const formula = v.formula1 !== undefined
        ? `<formula1>${esc(v.formula1)}</formula1>`
        : '';
      const formula2 = v.formula2 !== undefined
        ? `<formula2>${esc(v.formula2)}</formula2>`
        : '';
      return `<dataValidation ${attrs.join(' ')}>${formula}${formula2}</dataValidation>`;
    }).join('')}</dataValidations>`
    : '';

  return XML_HEADER + `
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${lastRef}"/>
  <sheetViews><sheetView tabSelected="${sheet.selected ? 1 : 0}" workbookViewId="0">${pane}</sheetView></sheetViews>
  <sheetFormatPr defaultRowHeight="15"/>
  ${cols}
  <sheetData>${data}</sheetData>
  ${autoFilter}
  ${merges}
  ${validations}
  <pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

function contentTypes(sheetCount) {
  return XML_HEADER + `
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  ${Array.from({ length: sheetCount }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function workbookXml(sheets) {
  return XML_HEADER + `
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
  <calcPr calcId="191029"/>
</workbook>`;
}

function workbookRels(sheetCount) {
  return XML_HEADER + `
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${Array.from({ length: sheetCount }, (_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function packageRels() {
  return XML_HEADER + `
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function coreXml(title) {
  const now = new Date().toISOString();
  return XML_HEADER + `
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${esc(title || 'Import')}</dc:title>
  <dc:creator>Orbit ERP</dc:creator>
  <cp:lastModifiedBy>Orbit ERP</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}

function appXml() {
  return XML_HEADER + `
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Orbit ERP</Application>
  <DocSecurity>0</DocSecurity>
  <ScaleCrop>false</ScaleCrop>
  <Company>Orbit ERP</Company>
  <LinksUpToDate>false</LinksUpToDate>
  <SharedDoc>false</SharedDoc>
  <HyperlinksChanged>false</HyperlinksChanged>
  <AppVersion>1.0</AppVersion>
</Properties>`;
}

/* Build the workbook buffer.

   sheet = {
     name, rows: [[cell]], cols: [{width, style}], freeze: {row, col},
     autoFilter: 'A1:G1', merges: ['A1:G1'],
     validations: [{sqref, formula1, promptTitle, prompt, errorTitle, error}]
   }
   cell = primitive | { v, t: 's'|'n'|'d'|'b', s: STYLE.x } */
export function buildXlsx({ sheets, title = 'Orbit ERP Import' }) {
  if (!Array.isArray(sheets) || !sheets.length) throw new Error('A workbook needs at least one sheet.');
  const files = {
    '[Content_Types].xml': contentTypes(sheets.length),
    '_rels/.rels': packageRels(),
    'docProps/core.xml': coreXml(title),
    'docProps/app.xml': appXml(),
    'xl/workbook.xml': workbookXml(sheets),
    'xl/_rels/workbook.xml.rels': workbookRels(sheets.length),
    'xl/styles.xml': STYLES_XML,
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = sheetXml(sheet);
  });
  return zip(files);
}

export default buildXlsx;
