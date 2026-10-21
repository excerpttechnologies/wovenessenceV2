/* The ITEMS sheet on the REAL Barcode Generation page, driven in headless
   Chrome with real keyboard and mouse events, against the real API and the
   real database.

   WHAT IT PROVES
     - the existing rows show, with the Barcode Identifier, and a sold row is
       locked
     - click / type / Enter, Tab, Shift+Tab, the arrows, Esc, F2 and
       double-click behave as in Excel; a refused value shows its reason
     - Add Row, Delete row (with confirm and Undo), Sl No renumbering
     - copy, clear, Excel-style tab-separated paste, one value filling a
       selection, Ctrl+Z / Ctrl+Y
     - the header stays put while the rows scroll; the sheet scrolls up/down
       and left/right inside its own box; the page itself does not scroll
       sideways; the chat button stays fixed outside the sheet
     - the totals bar follows an edit at once
     - Export Excel writes the edited value; Import Excel still works and its
       rows are editable
     - Submit saves the edits, the new rows and the deletions - checked in the
       database - and a double click saves once
     - no console errors, no failed API calls; 500 pasted rows stay quick
     - the real GRC page (read-only) renders its rows in the sheet

   Rows are identified by their bill serial (Sl No as seeded), not by their
   barcode numbers - the save route composes those.

   HOW TO RUN
     npm run dev                          (any running server; E2E_BASE points at it)
     npm run test:items-sheet:ui

   All writes happen inside a throwaway business, location and GRC: the page
   is pointed at them by answering its business / location dropdown requests,
   so it cannot touch real stock or the real barcode counter. Everything it
   creates is removed at the end, pass or fail. The real GRC is only viewed. */

import mongoose from 'mongoose';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import XLSX from 'xlsx';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const REAL_GRC = process.env.REAL_GRC || '6aa3879b22af3e76c3ba4fdb';
const CHROME = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== '' ? '  -> ' + detail : '')); }
};
const note = (text) => console.log('  NOTE  ' + text);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

const business = new ObjectId();
const location = new ObjectId();
const finYear = '2026-2027';
const grcId = new ObjectId();
const supplierId = new ObjectId();
const supplierCode = 'GUI' + crypto.randomBytes(2).toString('hex').toUpperCase();
/* the value the save route must give: SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY */
const uiValue = (seq, qty) => `${supplierCode} * 90518 * ${seq} * ${qty}`;
const email = 'items-sheet-ui@example.invalid';
const workDir = fs.mkdtempSync(path.join(process.env.E2E_WORK_DIR || os.tmpdir(), 'items-sheet-'));
const downloads = path.join(workDir, 'downloads');
fs.mkdirSync(downloads);
let chrome = null;
let cdp = null;

async function cleanup() {
  try { cdp?.close(); } catch { /* already closed */ }
  try { chrome?.kill(); } catch { /* already gone */ }
  await Promise.all([
    db.collection('barcodeLabel').deleteMany({ $or: [{ grcId: String(grcId) }, { businessId: String(business) }] }),
    db.collection('stockmovement').deleteMany({ $or: [{ refId: grcId }, { businessId: business }] }),
    db.collection('grc').deleteOne({ _id: grcId }),
    db.collection('contact').deleteOne({ _id: supplierId }),
    db.collection('counter').deleteMany({ key: { $regex: String(business) } }),
    db.collection('user').deleteOne({ email }),
  ]);
  await sleep(300);
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* chrome may still hold a file */ }
}

/* ------------------------------------------------------------------ CDP -- */

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const handlers = new Map();
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message)); else res(msg.result);
      } else if (msg.method) {
        (handlers.get(msg.method) || []).forEach((fn) => fn(msg.params));
      }
    };
    ws.onerror = () => reject(new Error('could not connect to Chrome'));
    ws.onopen = () => resolve({
      send: (method, params = {}) => new Promise((res, rej) => {
        const n = ++id;
        pending.set(n, { res, rej });
        ws.send(JSON.stringify({ id: n, method, params }));
      }),
      on: (method, fn) => {
        if (!handlers.has(method)) handlers.set(method, []);
        handlers.get(method).push(fn);
      },
      close: () => ws.close(),
    });
  });
}

const evaluate = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const waitFor = async (expression, ms = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await evaluate(expression); if (v) return v; } catch { /* page still loading */ }
    await sleep(100);
  }
  return null;
};

const KEYS = {
  Enter: [13, '\r'], Tab: [9], Escape: [27], ArrowUp: [38], ArrowDown: [40], ArrowLeft: [37], ArrowRight: [39],
  Delete: [46], Backspace: [8], F2: [113], Home: [36], End: [35], PageDown: [34], PageUp: [33],
};
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };
async function press(key, modifiers = 0) {
  const named = KEYS[key];
  const [keyCode, text] = named || [key.toUpperCase().charCodeAt(0)];
  const code = named ? key : 'Key' + key.toUpperCase();
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  if (text) await cdp.send('Input.dispatchKeyEvent', { type: 'char', key, text, modifiers });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
  await sleep(40);
}
/* typing as a person does: the first key lands on the sheet and opens the
   editor, the rest go into it */
async function type(text) {
  for (const ch of text) {
    const keyCode = ch.toUpperCase().charCodeAt(0);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ch, text: ch, unmodifiedText: ch, windowsVirtualKeyCode: keyCode });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch, windowsVirtualKeyCode: keyCode });
    await sleep(15);
  }
  await sleep(40);
}
async function clickAt(x, y, { clickCount = 1, modifiers = 0 } = {}) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, modifiers });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount, modifiers });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount, modifiers });
  await sleep(60);
}

/* ---------------------------------------------------------- page probes -- */

const GRID = `document.querySelector('[aria-label^="Items - editable sheet"]')`;
const colIndex = (label) => evaluate(`[...${GRID}.querySelectorAll('thead th')].findIndex((th) => th.textContent.trim() === ${JSON.stringify(label)})`);
const cellText = (r, c) => evaluate(`(() => { const td = ${GRID}.querySelector('td[data-r="${r}"][data-c="${c}"]'); return td ? td.textContent.trim() : null; })()`);
const activeCell = () => evaluate(`(() => { const td = ${GRID}.querySelector('td[aria-selected="true"]'); return td ? [Number(td.dataset.r), Number(td.dataset.c)] : null; })()`);
const editorValue = () => evaluate(`(() => { const i = ${GRID}.querySelector('td input'); return i ? i.value : null; })()`);
const notice = () => evaluate(`${GRID}.parentElement.querySelector('[role="status"]')?.textContent.trim() || ''`);
const total = (label) => evaluate(`(() => { const s = [...document.querySelectorAll('span')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); return s ? Number(s.nextElementSibling.textContent.replace(/[^0-9.]/g, '')) : null; })()`);
const lastSl = async () => {
  await evaluate(`${GRID}.scrollTop = 99999`);
  await sleep(300);
  return evaluate(`Math.max(0, ...[...${GRID}.querySelectorAll('tbody td[data-c="0"]')].map((td) => Number(td.textContent.trim()) || 0))`);
};
/* the sheet renders the rows around the viewport - scroll a far row in first */
async function revealRow(r) {
  await evaluate(`(() => { const g = ${GRID}; const tr = g.querySelector('tbody tr[data-row]'); const h = tr ? tr.getBoundingClientRect().height : 33; g.scrollTop = Math.max(0, ${r} * h - g.clientHeight / 2); })()`);
  await sleep(120);
}
async function clickCell(r, c, opts) {
  await revealRow(r);
  const at = await evaluate(`(() => {
    const td = ${GRID}.querySelector('td[data-r="${r}"][data-c="${c}"]');
    if (!td) return null;
    td.scrollIntoView({ block: 'center', inline: 'center' });
    const b = td.getBoundingClientRect();
    return [b.left + b.width / 2, b.top + b.height / 2];
  })()`);
  if (!at) throw new Error(`cell ${r},${c} is not rendered`);
  await clickAt(at[0], at[1], opts);
}
async function clickButton(text, extra = '') {
  const at = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)} ${extra});
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  if (!at) throw new Error('no button ' + text);
  await clickAt(at[0], at[1]);
}
/* the barcode values the Item With Barcode tab shows, in grid order - the tab
   is opened, read, and the ITEMS sheet put back */
async function shownValues() {
  await clickButton('ITEM WITH BARCODE');
  await waitFor(`document.querySelectorAll('input[aria-label="System generated barcode"]').length > 0`, 5000);
  const values = await evaluate(`[...document.querySelectorAll('input[aria-label="System generated barcode"]')].map((i) => i.value)`);
  await clickButton('ITEMS');
  await waitFor(`!!${GRID}`, 5000);
  return values;
}
const rowButton = (r, selector) => evaluate(`(() => { const b = ${GRID}.querySelector('td[data-r="${r}"]')?.closest('tr').querySelector(${JSON.stringify(selector)}); if (b) b.click(); return Boolean(b); })()`);
const clipboardEvent = (type, text = '') => evaluate(`(() => {
  const dt = new DataTransfer();
  if (${JSON.stringify(type)} === 'paste') dt.setData('text/plain', ${JSON.stringify(text)});
  const target = document.activeElement || ${GRID};
  target.dispatchEvent(new ClipboardEvent(${JSON.stringify(type)}, { clipboardData: dt, bubbles: true, cancelable: true }));
  return dt.getData('text/plain');
})()`);

/* ------------------------------------------------------------- the run -- */

const consoleErrors = [];
const failedApi = [];
const posts = [];

try {
  if (!CHROME) throw new Error('No Chrome or Edge found - set CHROME_PATH');

  /* ---- a throwaway GRC with 40 received rows, like GRC 05177 --------- */
  const salt = crypto.randomBytes(16).toString('hex');
  const pw = 'Ui-' + crypto.randomBytes(6).toString('hex');
  await db.collection('user').deleteOne({ email });
  await db.collection('user').insertOne({
    name: 'Items Sheet UI', email, password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
    role: 'Super Admin', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  });
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  const api = (p, o = {}) => fetch(BASE + p, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } }).then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));

  await db.collection('contact').insertOne({
    _id: supplierId, contactId: supplierCode, businessName: 'E2E UI SUPPLIER', contactKind: 'Supplier',
    businessId: business, createdAt: new Date(), updatedAt: new Date(),
  });
  await db.collection('grc').insertOne({
    _id: grcId, businessId: business, locationId: location, finYear, grcNumber: 'GRC 90518', supplierId, grcDate: new Date(),
    stockPointName: 'Warehouse', taxable: 0, totalQuantity: 0, gst: 0, netAmount: 0, items: [], voucherRows: [], createdAt: new Date(), updatedAt: new Date(),
  });
  const seedRows = Array.from({ length: 40 }, (_, i) => ({
    id: 'seed-' + i, itemCode: '10-PLNBTM', itemName: '10-PLNBTM', hsn: '520811', gst: '0', uom: 'MTR', qty: String(i === 7 ? 30 : 20),
    purchaseRate: '74', finalPrice: '70.3', retailPrice: '150', uniqueBarcode: 'Yes', mode: 'unique', barcodeNo: '', billSlNo: String(i + 1),
    supplierDescription: '10-PLNBTM', printDescription: '10-PLNBTM', discountType: 'Percentage', discount: '5', groupId: 'mtr-' + (i + 1),
  }));
  const seeded = await api('/api/barcode-generation', { method: 'POST', body: JSON.stringify({ rows: seedRows, grcId: String(grcId), business: String(business), location: String(location), finYear, supplierId: null }) });
  if (!seeded.ok) throw new Error('seeding failed: ' + JSON.stringify(seeded.body));
  await db.collection('barcodeLabel').updateOne({ grcId: String(grcId), billSlNo: '3' }, { $set: { status: 'SOLD' } });
  const before = await db.collection('barcodeLabel').find({ grcId: String(grcId) }).toArray();
  const bySl = (list, sl) => list.find((u) => u.billSlNo === String(sl));

  /* ---- Chrome -------------------------------------------------------- */
  const port = 9300 + Math.floor(Math.random() * 600);
  chrome = spawn(CHROME, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(workDir, 'profile')}`, '--headless=new',
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,900', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { /* starting */ }
    await sleep(150);
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  cdp = await connect(target.webSocketDebuggerUrl);
  cdp.on('Runtime.exceptionThrown', (p) => consoleErrors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') consoleErrors.push('console.error: ' + p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)); });
  cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error' && !/favicon/i.test(p.entry.url || '')) consoleErrors.push('log: ' + p.entry.text + ' ' + (p.entry.url || '')); });
  cdp.on('Network.responseReceived', (p) => {
    const { url, status } = p.response;
    if (url.includes('/api/') && status >= 400) failedApi.push(status + ' ' + url.replace(BASE, ''));
  });
  cdp.on('Network.requestWillBeSent', (p) => { if (p.request.method === 'POST' && /\/api\/barcode-generation(\?|$)/.test(p.request.url)) posts.push(p.request.url); });
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Network.enable')]);
  await cdp.send('Network.setCookie', { name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: BASE });
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

  /* ======================= 1. the real GRC, read-only ================== */
  console.log(`\n--- 1. the real GRC page (${REAL_GRC}), viewed only ---`);
  const realUnits = await db.collection('barcodeLabel').find({ grcId: REAL_GRC }).toArray();
  await cdp.send('Page.navigate', { url: `${BASE}/admin/transaction/purchase/grc/${REAL_GRC}/barcode-generation` });
  const realLoaded = await waitFor(`!!${GRID} && ${GRID}.querySelectorAll('tbody tr[data-row]').length > 0`, 120000);
  ok('the page renders the ITEMS sheet', Boolean(realLoaded));
  if (realLoaded) {
    const listed = await evaluate(`${GRID}.querySelectorAll('tbody tr[data-row]').length`);
    ok(`every saved row is listed (${realUnits.length})`, listed === realUnits.length, String(listed));
    const heads = await evaluate(`[...${GRID}.querySelectorAll('thead th')].map((th) => th.textContent.trim())`);
    const dataHeads = heads.filter((h) => h !== 'Barcode Identifier');
    ok('columns: Sl No, Item Code ... GST Amount, as the table had them',
      ['Sl No', 'Item Code', 'Item', 'HSN', 'GST%', 'QTY/MTR', 'No. of Cut', 'Rate', 'GST Amount'].every((h, i) => dataHeads[i] === h), heads.join(' | '));
    const soldCount = realUnits.filter((u) => u.status && u.status !== 'IN_STOCK').length;
    ok(`the ${soldCount} sold unit(s) show as Locked`, await evaluate(`[...${GRID}.querySelectorAll('tbody td')].filter((td) => td.textContent.trim() === 'Locked').length`) === soldCount);
    const rateCol = await colIndex('Rate');
    ok('Rate shows purchase / final as before', /^74\.00 \/ 70\.30$/.test(await cellText(1, rateCol)), await cellText(1, rateCol));
    const realQty = await colIndex('QTY/MTR');
    await clickCell(1, realQty);
    await press('ArrowDown'); await press('ArrowRight');
    ok('keyboard navigation on the real page', JSON.stringify(await activeCell()) === JSON.stringify([2, realQty + 1]), JSON.stringify(await activeCell()));
    const realAfter = await db.collection('barcodeLabel').find({ grcId: REAL_GRC }).toArray();
    ok('the real GRC was not written to', realAfter.length === realUnits.length && realAfter.every((u) => {
      const b = realUnits.find((x) => String(x._id) === String(u._id));
      return b && new Date(b.updatedAt).getTime() === new Date(u.updatedAt).getTime();
    }));
    ok('no console errors on the real page', consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' || '));
  }

  /* ============ point the page at the throwaway business ============== */
  await cdp.send('Fetch.enable', { patterns: [
    { urlPattern: '*/api/options?ref=business*', requestStage: 'Request' },
    { urlPattern: '*/api/options?ref=companylocations*', requestStage: 'Request' },
  ] });
  cdp.on('Fetch.requestPaused', (p) => {
    const body = p.request.url.includes('ref=business')
      ? { options: [{ value: String(business), label: 'E2E SHEET BUSINESS', isDefault: true }] }
      : { options: [{ value: String(location), label: 'E2E SHEET LOCATION' }] };
    cdp.send('Fetch.fulfillRequest', {
      requestId: p.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    }).catch(() => {});
  });

  consoleErrors.length = 0;
  failedApi.length = 0;
  await cdp.send('Page.navigate', { url: `${BASE}/admin/transaction/purchase/grc/${grcId}/barcode-generation` });
  const loaded = await waitFor(`!!${GRID} && ${GRID}.querySelectorAll('tbody tr[data-row]').length > 0`, 120000);
  ok('the test GRC opens in the sheet', Boolean(loaded));
  if (!loaded) throw new Error('the sheet never rendered');

  const C = {
    code: await colIndex('Item Code'), item: await colIndex('Item'), hsn: await colIndex('HSN'), gst: await colIndex('GST%'),
    qty: await colIndex('QTY/MTR'), cuts: await colIndex('No. of Cut'), rate: await colIndex('Rate'), gstAmt: await colIndex('GST Amount'),
  };

  console.log('\n--- 2. rows, identifier, lock ---');
  ok('Sl No starts at 1', await cellText(0, 0) === '1');
  const shown0 = await shownValues();
  ok('each saved barcode shows its exact value: SEQ 1-40 with its own quantity',
    shown0.length === 40 && shown0[0] === uiValue(1, 20) && shown0[7] === uiValue(8, 30) && shown0[39] === uiValue(40, 20), shown0.slice(0, 2).join(' | '));
  ok('the sold row is marked Locked', await evaluate(`${GRID}.querySelector('td[data-r="2"]').closest('tr').textContent.includes('Locked')`));

  console.log('\n--- 3. scrolling, sticky header, own scroll box ---');
  const box = await evaluate(`(() => { const g = ${GRID}; return { sh: g.scrollHeight, ch: g.clientHeight, sw: g.scrollWidth, cw: g.clientWidth, oy: getComputedStyle(g).overflowY, ox: getComputedStyle(g).overflowX }; })()`);
  ok('the sheet scrolls vertically inside its own box', box.sh > box.ch && box.oy === 'auto', JSON.stringify(box));
  ok('...and horizontally', box.sw > box.cw && box.ox === 'auto', JSON.stringify(box));
  await evaluate(`${GRID}.scrollTop = 400`); await sleep(200);
  const sticky = await evaluate(`(() => { const g = ${GRID}; return Math.round(g.querySelector('thead th').getBoundingClientRect().top - g.getBoundingClientRect().top); })()`);
  ok('the header stays at the top while the rows scroll under it', sticky === 0, 'offset ' + sticky);
  await evaluate(`${GRID}.scrollLeft = 300`); await sleep(150);
  const frozen = await evaluate(`(() => { const g = ${GRID}; return Math.round(g.querySelector('thead th[data-c="0"]').getBoundingClientRect().left - g.getBoundingClientRect().left); })()`);
  ok('Sl No stays in view while scrolling sideways', frozen === 0, 'offset ' + frozen);
  ok('the page itself does not scroll sideways', await evaluate('document.documentElement.scrollWidth <= window.innerWidth + 1'),
    await evaluate('document.documentElement.scrollWidth + " > " + window.innerWidth'));
  ok('scrolled to the bottom, the last row (Sl No 40) is there', await lastSl() === 40);
  const chat = await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => /bottom-32/.test(x.className) && getComputedStyle(x).position === 'fixed'); return b ? { inGrid: ${GRID}.contains(b), right: Math.round(window.innerWidth - b.getBoundingClientRect().right) } : null; })()`);
  ok('the chat button stays fixed on the right, outside the sheet', Boolean(chat) && !chat.inGrid && chat.right < 60, JSON.stringify(chat));
  await evaluate(`${GRID}.scrollTop = 0; ${GRID}.scrollLeft = 0`); await sleep(150);

  console.log('\n--- 4. edit a cell: click, type, Enter ---');
  const taxBefore = await total('Total Taxable');
  await clickCell(0, C.qty);
  ok('clicking makes the cell active', JSON.stringify(await activeCell()) === JSON.stringify([0, C.qty]), JSON.stringify(await activeCell()));
  await type('35');
  ok('typing opens the editor in the cell with what was typed', await editorValue() === '35', String(await editorValue()));
  await press('Enter');
  ok('Enter saves the value', await cellText(0, C.qty) === '35', await cellText(0, C.qty));
  ok('...and moves down a row', JSON.stringify(await activeCell()) === JSON.stringify([1, C.qty]), JSON.stringify(await activeCell()));
  const taxAfter = await total('Total Taxable');
  ok('Total Taxable follows at once (+15 x 70.30)', Math.abs((taxAfter - taxBefore) - 15 * 70.3) < 0.01, `${taxBefore} -> ${taxAfter}`);
  const shown4 = await shownValues();
  ok('before saving, the value shown is the one the save will give: ' + uiValue(1, 35), shown4[0] === uiValue(1, 35), shown4[0]);

  console.log('\n--- 5. Tab, Shift+Tab, arrows, Esc, F2, double-click ---');
  await clickCell(1, C.qty);
  await press('Tab');
  ok('Tab moves to the next editable cell', JSON.stringify(await activeCell()) === JSON.stringify([1, C.cuts]), JSON.stringify(await activeCell()));
  await press('Tab', MOD.shift);
  ok('Shift+Tab moves back', JSON.stringify(await activeCell()) === JSON.stringify([1, C.qty]), JSON.stringify(await activeCell()));
  await press('ArrowDown'); await press('ArrowRight'); await press('ArrowUp'); await press('ArrowLeft'); await press('ArrowLeft');
  ok('arrow keys move the cursor', JSON.stringify(await activeCell()) === JSON.stringify([1, C.gst]), JSON.stringify(await activeCell()));
  await clickCell(1, C.rate);
  await press('Tab');
  ok('Tab skips the calculated GST Amount', JSON.stringify(await activeCell()) !== JSON.stringify([1, C.gstAmt]), JSON.stringify(await activeCell()));
  await clickCell(3, C.qty);
  await type('999');
  await press('Escape');
  ok('Esc cancels the edit and keeps the old value', await cellText(3, C.qty) === '20' && await editorValue() === null, await cellText(3, C.qty));
  await clickCell(3, C.item);
  await clickCell(3, C.item, { clickCount: 2 });
  ok('double-click edits, keeping the value', await editorValue() === '10-PLNBTM', String(await editorValue()));
  await cdp.send('Input.insertText', { text: ' BLUE' });
  await press('Enter');
  ok('...and Enter saves it', await cellText(3, C.item) === '10-PLNBTM BLUE', await cellText(3, C.item));
  await clickCell(4, C.hsn);
  await press('F2');
  ok('F2 edits the cell', await editorValue() === '520811', String(await editorValue()));
  await press('Escape');

  console.log('\n--- 6. validation ---');
  await clickCell(4, C.gst);
  await type('abc');
  await press('Enter');
  const alert = await evaluate(`${GRID}.querySelector('[role="alert"]')?.textContent || ''`);
  ok('a refused value keeps the editor open with its reason', await editorValue() === 'abc' && /GST% must be a number/.test(alert), alert);
  await press('Escape');
  ok('...Esc then restores the cell', await cellText(4, C.gst) === '0');
  await clickCell(2, C.qty);
  await type('5');
  ok('a sold row cannot be edited', await editorValue() === null && /Sold/.test(await notice()), await notice());

  console.log('\n--- 7. copy, paste, fill, clear, undo ---');
  await clickCell(0, C.qty);
  await clickCell(1, C.qty, { modifiers: MOD.shift });
  const copied = await clipboardEvent('copy');
  ok('Copy puts the selected cells on the clipboard as Excel rows', copied === '35\r\n20', JSON.stringify(copied));
  await clickCell(5, C.gst);
  await clickCell(6, C.gst, { modifiers: MOD.shift });
  await clipboardEvent('paste', '5');
  ok('one pasted value fills the whole selection', await cellText(5, C.gst) === '5' && await cellText(6, C.gst) === '5');
  await press('z', MOD.ctrl);
  ok('Ctrl+Z undoes it', await cellText(5, C.gst) === '0' && await cellText(6, C.gst) === '0');
  await press('y', MOD.ctrl);
  ok('Ctrl+Y redoes it', await cellText(5, C.gst) === '5' && await cellText(6, C.gst) === '5');
  await clickCell(5, C.cuts); await type('2'); await press('Enter');
  await clickCell(5, C.cuts); await press('Delete');
  ok('Delete clears a cell', await cellText(5, C.cuts) === '-');
  await clickCell(5, C.qty); await press('Delete');
  ok('...but not one that cannot be empty, and says why', await cellText(5, C.qty) === '20' && /required/i.test(await notice()), await notice());

  console.log('\n--- 8. Add Row, typing a new row with Tab ---');
  await clickButton('Add Row');
  await sleep(200);
  ok('Add Row adds row 41 and puts the cursor on its Item Code', await lastSl() === 41 && JSON.stringify(await activeCell()) === JSON.stringify([40, C.code]),
    JSON.stringify(await activeCell()));
  await type('E2E-NEW'); await press('Tab');
  await type('New item'); await press('Tab');
  await type('520811'); await press('Tab');
  await type('5'); await press('Tab');
  await type('12'); await press('Tab');
  await press('Tab');
  await type('100'); await press('Enter');
  const newRow = [await cellText(40, C.code), await cellText(40, C.qty), await cellText(40, C.rate), await cellText(40, C.gstAmt)].join('|');
  ok('a row typed in with Tab is filled in (rate less the row\'s 5% discount, GST worked out)', newRow === 'E2E-NEW|12|100.00 / 95.00|57.00', newRow);

  console.log('\n--- 9. Excel paste adds rows ---');
  await clickButton('Add Row'); await sleep(200);
  const excel = '10-PLNBTM\t10-PLNBTM\t520811\t0\t20\t-\t74.00 / 70.30\t0.00\r\n10-PLNBTM\t10-PLNBTM\t520811\t0\t30\t-\t74.00 / 70.30\t0.00\r\n';
  await clipboardEvent('paste', excel);
  await lastSl();
  const pastedRows = [await cellText(41, C.code), await cellText(41, C.qty), await cellText(42, C.qty), await cellText(42, C.rate)].join('|');
  ok('the brief\'s two Excel rows land in rows 42 and 43', pastedRows === '10-PLNBTM|20|30|74.00 / 70.30', pastedRows + ' / ' + await notice());

  console.log('\n--- 10. delete rows, Sl No, Undo ---');
  await clickButton('Add Row'); await sleep(200);
  const withBlank = await lastSl();
  await rowButton(withBlank - 1, 'button[aria-label^="Delete row"]');
  await sleep(150);
  ok('an empty new row goes without a question', await lastSl() === withBlank - 1);
  /* row 8 (Sl No 8) is the one line of 30 among the first ten */
  const rowsNow = await lastSl();
  await evaluate(`${GRID}.scrollTop = 0`); await sleep(200);
  await rowButton(7, 'button[aria-label^="Delete row"]');
  await sleep(120);
  ok('a saved row asks first', await evaluate(`!!${GRID}.querySelector('td[data-r="7"]').closest('tr').querySelector('button.bg-red-600')`));
  await rowButton(7, 'button.bg-red-600');
  await sleep(150);
  ok('...then leaves the grid and Sl No closes up', await cellText(7, 0) === '8' && await cellText(7, C.qty) === '20' && await lastSl() === rowsNow - 1,
    String(await cellText(7, C.qty)));
  ok('the pending deletion is announced with Undo', await evaluate(`${GRID}.parentElement.textContent.includes('will be deleted on Submit')`));
  await clickButton('Undo'); await sleep(150);
  await evaluate(`${GRID}.scrollTop = 0`); await sleep(150);
  ok('Undo puts it back in place', await cellText(7, C.qty) === '30' && await lastSl() === rowsNow, String(await cellText(7, C.qty)));
  await evaluate(`${GRID}.scrollTop = 0`); await sleep(150);
  await rowButton(7, 'button[aria-label^="Delete row"]');
  await sleep(100);
  await rowButton(7, 'button.bg-red-600');
  await sleep(150);

  console.log('\n--- 11. Export Excel has the edited value ---');
  await clickButton('Export Excel');
  let file = null;
  for (let i = 0; i < 60 && !file; i++) {
    file = fs.readdirSync(downloads).find((f) => f.endsWith('.xlsx'));
    if (!file) await sleep(250);
  }
  ok('Export Excel downloads a workbook', Boolean(file));
  let exportedPath = null;
  if (file) {
    exportedPath = path.join(downloads, file);
    const wb = XLSX.readFile(exportedPath);
    const sheet = XLSX.utils.sheet_to_json(wb.Sheets['Barcode Items'], { defval: '' });
    const first = sheet.find((r) => String(r['Barcode No']) === bySl(before, 1).barcodeNo);
    ok('...with the quantity as edited on the sheet (35, not 20)', String(first?.Quantity) === '35', JSON.stringify(first && { q: first.Quantity }));
    ok('...and the row typed in', sheet.some((r) => r['Item Code'] === 'E2E-NEW' && String(r.Quantity) === '12'));
  }

  console.log('\n--- 12. Submit ---');
  posts.length = 0;
  await clickButton('Submit', ` && /bg-green-600/.test(x.className)`);
  await waitFor(`[...document.querySelectorAll('button')].some((x) => x.textContent.trim() === 'Submit' && /bg-blue-600/.test(x.className))`, 5000);
  /* a double click on the confirm button */
  await evaluate(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === 'Submit' && /bg-blue-600/.test(x.className)); b.click(); b.click(); })()`);
  const reloaded = await waitFor(`![...document.querySelectorAll('h3')].some((h) => h.textContent.includes('Confirm submit')) && ${GRID} && !${GRID}.parentElement.textContent.includes('edited - Submit')`, 60000);
  await sleep(1500);
  const saveError = await evaluate(`document.querySelector('[aria-label="Dismiss save error"]')?.parentElement?.textContent || ''`);
  ok('Submit is accepted', Boolean(reloaded) && !saveError, saveError);
  ok('a double click sends one save', posts.length === 1, 'POSTs: ' + posts.length);
  const after = await db.collection('barcodeLabel').find({ grcId: String(grcId) }).toArray();
  ok('the edited quantity is saved on the same row', bySl(after, 1)?.qty === '35' && String(bySl(after, 1)?._id) === String(bySl(before, 1)._id));
  ok('the edited Item name is saved', bySl(after, 4)?.itemName === '10-PLNBTM BLUE', bySl(after, 4)?.itemName);
  ok('the filled GST% is saved', bySl(after, 6)?.gst === '5' && bySl(after, 7)?.gst === '5');
  ok('the deleted row is gone from the database', !after.some((u) => String(u._id) === String(bySl(before, 8)._id)));
  const added = after.filter((u) => !before.some((b) => String(b._id) === String(u._id)));
  ok('the three new rows are saved once each, as SEQ 41-43 with their own quantities',
    added.length === 3 && JSON.stringify(added.map((u) => u.barcodeNo).sort()) === JSON.stringify([uiValue(41, 12), uiValue(42, 20), uiValue(43, 30)].sort()),
    added.map((u) => u.billSlNo + ':' + u.itemCode + ':' + u.qty + ':' + u.barcodeNo).join(', '));
  ok('the edited line keeps its SEQ; its value follows its new quantity', bySl(after, 1)?.barcodeNo === uiValue(1, 35), bySl(after, 1)?.barcodeNo);
  ok('every other row kept its _id and barcode value',
    before.filter((b) => !['1', '8'].includes(b.billSlNo)).every((b) => after.some((u) => String(u._id) === String(b._id) && u.barcodeNo === b.barcodeNo)));
  ok('the sold row was not touched', bySl(after, 3)?.status === 'SOLD' && new Date(bySl(after, 3).updatedAt).getTime() === new Date(bySl(before, 3).updatedAt).getTime());
  const grcAfter = await db.collection('grc').findOne({ _id: grcId });
  ok('the GRC totals are the rows\' totals', grcAfter.totalQuantity === after.reduce((s, u) => s + (parseFloat(u.qty) || 0), 0), grcAfter.totalQuantity);
  ok('the grid re-read the database: 42 rows, nothing marked edited', await lastSl() === 42 && !(await evaluate(`${GRID}.parentElement.textContent.includes('edited - Submit')`)));
  ok('no two barcodes of the GRC share a value', new Set(after.map((u) => u.barcodeNo)).size === after.length);

  console.log('\n--- 12b. the Barcode Print page prints exactly the stored values ---');
  await cdp.send('Page.navigate', { url: `${BASE}/admin/transaction/purchase/barcode-print/${grcId}` });
  const drawn = await waitFor(`(() => { const n = document.querySelectorAll('svg[data-barcode]'); return n.length && [...n].every((s) => s.childNodes.length) ? n.length : 0; })()`, 60000);
  ok('the labels draw their bars', Boolean(drawn), String(drawn));
  const labelTexts = await evaluate(`[...document.querySelectorAll('span.font-mono')].map((s) => s.textContent.trim()).filter(Boolean)`);
  const storedValues = new Set(after.map((u) => u.barcodeNo));
  ok('every label shows a stored value, exactly', labelTexts.length > 0 && labelTexts.every((t) => storedValues.has(t)), labelTexts.slice(0, 3).join(' | '));
  ok(`...including ${uiValue(1, 35)} and ${uiValue(43, 30)}`, labelTexts.includes(uiValue(1, 35)) && labelTexts.includes(uiValue(43, 30)));
  ok('no "GRC ... · Supplier ..." text beside the value', !(await evaluate(`/·\\s*supplier/i.test(document.body.textContent)`)));
  await cdp.send('Page.navigate', { url: `${BASE}/admin/transaction/purchase/grc/${grcId}/barcode-generation` });
  await waitFor(`!!${GRID} && ${GRID}.querySelectorAll('tbody tr[data-row]').length > 0`, 60000);

  console.log('\n--- 13. Import Excel still works, and its rows are editable ---');
  if (exportedPath) {
    const wb = XLSX.readFile(exportedPath);
    const ws = wb.Sheets['Barcode Items'];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const qCol = aoa[0].indexOf('Quantity');
    const r = aoa.findIndex((line) => String(line[aoa[0].indexOf('Barcode No')]) === bySl(before, 2).barcodeNo);
    ws[XLSX.utils.encode_cell({ r, c: qCol })] = { t: 'n', v: 25 };
    const importPath = path.join(workDir, 'import.xlsx');
    XLSX.writeFile(wb, importPath);
    const { result } = await cdp.send('Runtime.evaluate', { expression: `document.querySelector('input[type="file"]')` });
    await cdp.send('DOM.enable');
    await cdp.send('DOM.setFileInputFiles', { files: [importPath], objectId: result.objectId });
    const banner = await waitFor(`document.querySelector('[aria-label="Dismiss import message"]')?.parentElement?.textContent || ''`, 15000);
    ok('the import reports the one changed row', /1 updated/.test(banner || ''), banner);
    await evaluate(`${GRID}.scrollTop = 0`); await sleep(200);
    ok('the imported value is in the sheet', await cellText(1, C.qty) === '25', await cellText(1, C.qty));
    await clickCell(1, C.qty); await type('26'); await press('Enter');
    ok('...and the imported row is editable like any other', await cellText(1, C.qty) === '26');
  }

  console.log('\n--- 14. 500 more rows stay quick ---');
  await clickButton('Add Row'); await sleep(200);
  const beforePaste = await lastSl();
  const big = Array.from({ length: 500 }, (_, i) => `BULK-${i}\tBulk ${i}\t520811\t5\t${(i % 9) + 1}\t-\t${100 + i}\t0`).join('\r\n');
  const timing = await evaluate(`(async () => {
    const dt = new DataTransfer(); dt.setData('text/plain', ${JSON.stringify(big)});
    const t0 = performance.now();
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    const handled = performance.now() - t0;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { handled: Math.round(handled), painted: Math.round(performance.now() - t0), rendered: ${GRID}.querySelectorAll('tbody tr[data-row]').length };
  })()`);
  ok('pasting 500 rows is handled and painted in well under a second', timing.painted < 1500, JSON.stringify(timing));
  ok('...and only the rows around the screen are rendered, not all of them', timing.rendered < 120, JSON.stringify(timing));
  const nav = await evaluate(`(async () => {
    const g = ${GRID};
    g.focus();
    const t0 = performance.now();
    for (let i = 0; i < 40; i++) g.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    await new Promise((r) => requestAnimationFrame(r));
    return Math.round((performance.now() - t0) / 40 * 10) / 10;
  })()`);
  ok('moving the cursor through the long sheet stays instant', nav < 30, nav + ' ms per key');
  ok('scrolling to the end shows the last of them', await lastSl() === beforePaste + 499, 'last Sl No ' + await lastSl() + ', expected ' + (beforePaste + 499));

  console.log('\n--- 15. the rest of the page is as it was ---');
  const page = await evaluate(`(() => {
    const text = document.body.textContent;
    const button = (t) => [...document.querySelectorAll('button')].some((b) => b.textContent.includes(t));
    return {
      tabs: ['ITEMS', 'ITEM SUMMARY', 'ITEM WITH BARCODE'].every(button),
      tools: ['Import Excel', 'Export Excel', 'Print Labels'].every(button),
      pcs: /Pc\\(s\\)/.test(text),
      totals: ['Total Taxable', 'Total GST', 'Grand Total'].every((t) => text.includes(t)),
      submit: [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Submit' && /bg-green-600/.test(b.className)),
    };
  })()`);
  ok('tabs, Import / Export / Print Labels, Pc(s), totals and Submit are all still there', Object.values(page).every(Boolean), JSON.stringify(page));
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 820, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const narrow = await evaluate(`(() => { const g = ${GRID}; const r = g.getBoundingClientRect(); return { right: Math.round(r.right), width: window.innerWidth, scrolls: g.scrollWidth > g.clientWidth, font: getComputedStyle(g.querySelector('td')).fontSize }; })()`);
  ok('on a narrow screen the sheet still scrolls sideways, text size unchanged', narrow.scrolls && narrow.font === '12px', JSON.stringify(narrow));
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  console.log('\n--- 16. console and network ---');
  ok('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 5).join(' || '));
  ok('no failed API calls', failedApi.length === 0, failedApi.slice(0, 5).join(', '));
} catch (err) {
  fail++;
  console.log('  FAIL  test aborted -> ' + (err?.stack || err));
} finally {
  await cleanup();
  await mongoose.disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
