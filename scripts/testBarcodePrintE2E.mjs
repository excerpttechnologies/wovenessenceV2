/* ==========================================================================
   END TO END: GRC -> Barcode Generation -> saved record -> Print Label
   Picker -> Barcode Print -> print run (PDF), plus the supplier Price
   Calculation Setup on Barcode Generation.

     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/testBarcodePrintE2E.mjs

   Runs against the dev server (E2E_BASE, default http://localhost:3000) in a
   THROWAWAY scope: its own business, location, suppliers, item, Barcode
   Setting, GRCs and sign-in user, all removed in `finally`. The page is
   pointed at that business by answering /api/options itself, so no save can
   land on a real business or spend a real counter number.

   Real GRCs are only VIEWED (05182 - the reference record, 05178, and one
   GRC whose barcodes have no composed value) and checked to be unwritten.

   What it proves, for every label it can see:
     the bars decode to exactly canonical(barcodeGenerated)
     the right-hand text is that same string
     the left-hand text is the unit's own barcodeNo
     nothing is clipped and the bars sit inside the label
   and that saving numbers Bill Sl No. / Serial No. by the rule, never twice.
   ========================================================================== */
import mongoose from 'mongoose';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn, spawnSync } from 'child_process';
import { createRequire } from 'module';
import { contactCollection } from '../lib/contactStorage.js';
import { toGridRow } from '@/lib/barcodeRowSync';
import { canonicalBarcodeValue, isComposedBarcodeValue, grcNumberForBarcode } from '@/lib/barcodeValue';
import { priceSetupFieldDefs } from '@/lib/supplierPriceSetup';
import { TABS as SUPPLIER_TABS } from '@/app/admin/contact/supplier/tabs';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const REAL = { g05182: '6aaa8020d2c6e3f3c0ca3898', g05178: '6aa3c1e73abe2f45934279ea' };
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => p && fs.existsSync(p));
const PDFTOTEXT = ['C:/Program Files/Git/mingw64/bin/pdftotext.exe', 'pdftotext'].find((p) => p === 'pdftotext' || fs.existsSync(p));

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== '' ? '  -> ' + detail : '')); }
};
const note = (text) => console.log('  NOTE  ' + text);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const canon = canonicalBarcodeValue;

/* ------------------------------------------------ CODE128 bar decoding -- */
const req = createRequire(path.join(process.cwd(), 'package.json'));
const BARS = (() => { const m = req('jsbarcode/bin/barcodes/CODE128/constants.js'); return (m.default || m).BARS; })();
const SYM = new Map(BARS.map((b, i) => [String(b), i]));
const MODULE_UNITS = 1.2;                       // BarcodeSvg's default `width`
function bitsFromRects(rects) {
  if (!rects.length) return '';
  const spans = rects.map((r) => [Math.round(r.x / MODULE_UNITS), Math.round(r.width / MODULE_UNITS)]);
  const len = Math.max(...spans.map(([s, w]) => s + w));
  const bits = Array(len).fill('0');
  spans.forEach(([s, w]) => { for (let i = s; i < s + w; i += 1) bits[i] = '1'; });
  return bits.join('');
}
function decode128(bits) {
  if (!bits.endsWith('1100011101011')) throw new Error('no stop pattern');
  const body = bits.slice(0, -13);
  if (body.length % 11) throw new Error('bad length');
  const syms = [];
  for (let i = 0; i < body.length; i += 11) {
    const v = SYM.get(body.slice(i, i + 11));
    if (v === undefined) throw new Error('unknown symbol');
    syms.push(v);
  }
  const [start, ...rest] = syms;
  const check = rest.pop();
  const sum = rest.reduce((s, v, i) => s + v * (i + 1), start) % 103;
  if (sum !== check) throw new Error('bad checksum');
  let set = { 103: 'A', 104: 'B', 105: 'C' }[start];
  let out = '';
  let shift = false;
  for (const v of rest) {
    const cur = shift ? (set === 'A' ? 'B' : 'A') : set;
    shift = false;
    if (cur === 'C') {
      if (v < 100) { out += String(v).padStart(2, '0'); continue; }
      set = v === 100 ? 'B' : 'A';
      continue;
    }
    if (v === 98) { shift = true; continue; }
    if (v === 99) { set = 'C'; continue; }
    if (v === 100 || v === 101) { set = v === 100 ? 'B' : 'A'; continue; }
    out += cur === 'B' ? String.fromCharCode(v + 32) : String.fromCharCode(v < 64 ? v + 32 : v - 64);
  }
  return out;
}
const decodeRects = (rects) => { try { return decode128(bitsFromRects(rects)); } catch (e) { return 'UNDECODABLE: ' + e.message; } };

/* ----------------------------------------------------------- the scope -- */
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

const hex = crypto.randomBytes(2).toString('hex').toUpperCase();
const business = new ObjectId();
const location = new ObjectId();
const finYear = '2026-2027';
const prefix = 'Z' + hex.slice(0, 2);
const supA = new ObjectId(); const codeA = 'GPA' + hex;
const supB = new ObjectId(); const codeB = 'GPB' + hex;
const supC = new ObjectId(); const codeC = 'GPC' + hex;
const grcNoSupplier = new ObjectId();
const grcSupplierC = new ObjectId();
const itemId = new ObjectId();
const itemCode = 'E2EITEM' + hex;
const email = `barcode-print-e2e-${hex.toLowerCase()}@example.invalid`;
const workDir = fs.mkdtempSync(path.join(process.env.E2E_WORK_DIR || os.tmpdir(), 'barcode-print-e2e-'));
const createdGrcs = [grcNoSupplier, grcSupplierC];
let chrome = null;
let cdp = null;

async function cleanup() {
  try { cdp?.close(); } catch { /* closed */ }
  try { chrome?.kill(); } catch { /* gone */ }
  const grcStrings = createdGrcs.map(String);
  await Promise.all([
    db.collection('barcodeLabel').deleteMany({ $or: [{ businessId: String(business) }, { grcId: { $in: grcStrings } }] }),
    db.collection('stockmovement').deleteMany({ $or: [{ businessId: business }, { businessId: String(business) }, { refId: { $in: [...createdGrcs, ...grcStrings] } }] }),
    db.collection('grc').deleteMany({ $or: [{ businessId: business }, { _id: { $in: createdGrcs } }] }),
    db.collection(contactCollection('Supplier')).deleteMany({ _id: { $in: [supA, supB, supC] } }),
    db.collection('barcodesetting').deleteMany({ businessId: business }),
    db.collection('item').deleteOne({ _id: itemId }),
    db.collection('counter').deleteMany({ key: { $regex: String(business) } }),
    db.collection('user').deleteOne({ email }),
  ]);
  await sleep(300);
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* chrome may hold a file */ }
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
const waitFor = async (expression, ms = 30000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const v = await evaluate(expression); if (v) return v; } catch { /* loading */ }
    await sleep(150);
  }
  return null;
};
const KEYS = { Enter: [13, '\r'], Tab: [9], Escape: [27] };
async function press(key, modifiers = 0) {
  const [keyCode, text] = KEYS[key];
  await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key, code: key, windowsVirtualKeyCode: keyCode, modifiers });
  if (text) await cdp.send('Input.dispatchKeyEvent', { type: 'char', key, text, modifiers });
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode: keyCode, modifiers });
  await sleep(60);
}
async function clickAt(x, y) {
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(80);
}
async function clickButton(text) {
  const at = await evaluate(`(() => {
    const b = [...document.querySelectorAll('button')].find((x) => x.textContent.trim() === ${JSON.stringify(text)} && !x.disabled);
    if (!b) return null;
    b.scrollIntoView({ block: 'center' });
    const r = b.getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  })()`);
  if (!at) throw new Error('no button ' + text);
  await clickAt(at[0], at[1]);
}
const FIELD = (label) => `(() => { const l = [...document.querySelectorAll('label')].find((x) => x.textContent.trim() === ${JSON.stringify(label)}); return l ? l.parentElement.querySelector('input,select') : null; })()`;
const fieldValue = (label) => evaluate(`(${FIELD(label)} || {}).value ?? null`);
async function setField(label, value) {
  const found = await evaluate(`(() => { const i = ${FIELD(label)}; if (!i) return false; i.scrollIntoView({ block: 'center' }); i.focus(); if (i.select) i.select(); return true; })()`);
  if (!found) throw new Error('no field ' + label);
  await cdp.send('Input.insertText', { text: value });
  await sleep(250);
}
const navigate = async (url) => { await cdp.send('Page.navigate', { url }); await sleep(400); };

/* every label on the page, as drawn */
const READ_LABELS = (rootExpr) => `(() => {
  const root = ${rootExpr};
  if (!root) return null;
  return [...root.querySelectorAll('[data-label]')].map((l) => {
    const s = l.querySelector('svg[data-barcode]');
    const g = s && s.querySelector('g');
    const sp = l.children[1] ? [...l.children[1].querySelectorAll('span')] : [];
    const lb = l.getBoundingClientRect();
    const sb = s ? s.getBoundingClientRect() : null;
    return {
      left: sp[0] ? sp[0].textContent : null,
      right: sp[1] ? sp[1].textContent : null,
      leftCut: sp[0] ? sp[0].scrollWidth > sp[0].clientWidth + 1 : false,
      rightCut: sp[1] ? sp[1].scrollWidth > sp[1].clientWidth + 1 : false,
      rects: g ? [...g.querySelectorAll('rect')].map((r) => ({ x: +r.getAttribute('x'), width: +r.getAttribute('width') })) : [],
      vbW: s && s.viewBox && s.viewBox.baseVal ? s.viewBox.baseVal.width : 0,
      svgW: sb ? sb.width : 0,
      inside: sb ? (sb.width > 0 && sb.left >= lb.left - 0.5 && sb.right <= lb.right + 0.5 && sb.top >= lb.top - 0.5 && sb.bottom <= lb.bottom + 0.5) : false,
    };
  });
})()`;

/* the checks every label must pass against the record it was printed from */
function checkLabels(where, labels, rowsByNumber, { expectCount = null } = {}) {
  ok(`${where}: labels drawn${expectCount !== null ? ` (${expectCount})` : ''}`, Array.isArray(labels) && labels.length > 0 && (expectCount === null || labels.length === expectCount), labels ? String(labels.length) : 'none');
  if (!labels) return;
  const problems = [];
  const widths = new Set();
  labels.forEach((label, i) => {
    const decoded = decodeRects(label.rects);
    const row = rowsByNumber.get(label.left) || rowsByNumber.get(decoded);
    if (!row) { problems.push(`#${i} no record for left "${label.left}" / bars "${decoded}"`); return; }
    const composed = isComposedBarcodeValue(row.barcodeGenerated) ? canon(row.barcodeGenerated) : '';
    const expectedBars = composed || row.barcodeNo;
    if (decoded !== expectedBars) problems.push(`#${i} bars "${decoded}" != "${expectedBars}"`);
    if (composed && label.right !== decoded) problems.push(`#${i} right "${label.right}" != bars "${decoded}"`);
    if (!composed && label.right !== '') problems.push(`#${i} right "${label.right}" should be empty`);
    if (label.left !== row.barcodeNo) problems.push(`#${i} left "${label.left}" != barcodeNo "${row.barcodeNo}"`);
    if (label.rightCut || label.leftCut) problems.push(`#${i} text clipped`);
    if (!label.inside) problems.push(`#${i} bars outside the label`);
    if (label.vbW) widths.add(((label.svgW * 25.4 / 96) / (label.vbW / MODULE_UNITS)).toFixed(3));
  });
  ok(`${where}: every label's bars = its right-hand text = canonical(barcodeGenerated), left = barcodeNo, nothing clipped`, problems.length === 0, problems.slice(0, 5).join(' | '));
  if (widths.size) note(`${where}: module width on screen ${[...widths].join(' / ')} mm`);
}

const consoleErrors = [];
const failedApi = [];

try {
  if (!CHROME) throw new Error('No Chrome or Edge found - set CHROME_PATH');

  /* ------------------------------------------------------ sign in ----- */
  const salt = crypto.randomBytes(16).toString('hex');
  const pw = 'E2e-' + crypto.randomBytes(6).toString('hex');
  await db.collection('user').insertOne({
    name: 'Barcode Print E2E', email, password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
    role: 'Super Admin', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  });
  const login = await fetch(BASE + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }) });
  const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) throw new Error('sign-in failed: HTTP ' + login.status);
  const api = (p, o = {}) => fetch(BASE + p, { ...o, headers: { 'Content-Type': 'application/json', Cookie: cookie } })
    .then(async (r) => ({ ok: r.ok, status: r.status, body: await r.json().catch(() => null) }));

  /* ------------------------------------------------------ masters ----- */
  const now = new Date();
  const supplier = (_id, contactId, name, setup) => ({
    _id, contactId, businessName: name, contactKind: 'Supplier', businessId: business,
    markupPriceCalculation: 'Purchase Rate', discountType: '', discount: null,
    markUpOnCostRsp: null, rspRoundOff: null, markUpOnCostWsp: null, wspRoundOff: null, markUpOnCostDp: null, dpRoundOff: null,
    ...setup, createdAt: now, updatedAt: now,
  });
  await db.collection(contactCollection('Supplier')).insertMany([
    supplier(supA, codeA, 'E2E SUPPLIER A', { discountType: 'Percentage', discount: 10, markUpOnCostRsp: 100, rspRoundOff: 1, markUpOnCostWsp: 15, wspRoundOff: 1, markUpOnCostDp: 12.5, dpRoundOff: 1 }),
    /* stored as text, the way the imported suppliers are */
    supplier(supB, codeB, 'E2E SUPPLIER B', { markUpOnCostRsp: '80', markUpOnCostDp: 12 }),
    supplier(supC, codeC, 'E2E SUPPLIER C', {}),
  ]);
  await db.collection('barcodesetting').insertOne({
    businessId: business, finYear, type: 'Periodic', subType: 'Yearly', periodIndex: 1, periodLabel: 'YEARLY 1',
    prefix, suffix: '', startNumber: 1, numberLenght: 4,
    effectiveDate: new Date('2026-04-01'), expiryDate: new Date('2027-03-31'), createdAt: now, updatedAt: now,
  });
  /* offerPriceNetPrice "No" is what almost every real item carries - it used
     to be read as the item's E-COMM markup */
  await db.collection('item').insertOne({
    _id: itemId, businessId: business, itemCode, name: itemCode + ' NAME', description: 'E2E PRINT DESC',
    offerPriceNetPrice: 'No', createdAt: now, updatedAt: now,
  });
  await db.collection('grc').insertMany([
    { _id: grcNoSupplier, businessId: business, locationId: location, finYear, grcNumber: '97001', supplierId: null, items: [], voucherRows: [], createdAt: now, updatedAt: now },
    { _id: grcSupplierC, businessId: business, locationId: location, finYear, grcNumber: '97002', supplierId: supC, items: [], voucherRows: [], createdAt: now, updatedAt: now },
  ]);

  const baseRow = { itemName: 'E2E ITEM', hsn: '520811', gst: '5', uom: 'PC', qty: '1', purchaseRate: '95', finalPrice: '95', retailPrice: '150', discountType: 'Percentage', discount: '0', mode: 'unique', uniqueBarcode: 'Yes', supplierDescription: 'E2E SUPPLIER TEXT', printDescription: 'E2E PRINT DESC' };
  const row = (id, o) => ({ ...baseRow, id: `e2e-${hex}-${id}`, itemCode: 'E2E-PC', ...o });
  const scopeBody = { business: String(business), location: String(location), finYear };
  const counterSeq = async () => (await db.collection('counter').findOne({ key: { $regex: '^barcode:' + prefix + ':.*' + String(business) } }))?.seq ?? null;

  /* ================= 1. a NEW GRC, saved through the API ============== */
  console.log('\n--- 1. new GRC: complete records, Bill Sl No. / Serial No. by the rule ---');
  const rows1 = [
    row('A1', { billSlNo: '1' }), row('A2', { billSlNo: '1' }), row('A3', { billSlNo: '1' }),
    row('M1', { itemCode: 'E2E-MTR', uom: 'MTR', qty: '16', billSlNo: '2' }),
    row('B1', { itemCode: 'E2E-BATCH', qty: '5', mode: 'batch', uniqueBarcode: 'No', billSlNo: '2' }),
  ];
  const r1 = await api('/api/barcode-generation', { method: 'POST', body: JSON.stringify({ rows: rows1, grcId: null, deleteIds: [], supplierId: String(supA), totals: { count: 5, value: 0 }, ...scopeBody }) });
  ok('POST new GRC answers 200', r1.ok, JSON.stringify(r1.body).slice(0, 300));
  if (!r1.ok) throw new Error('cannot continue without the GRC');
  const grcId = r1.body.grcId;
  createdGrcs.push(new ObjectId(grcId));
  const gno = grcNumberForBarcode(r1.body.grcNumber);
  const val = (b, s, code = codeA) => `${code} * ${gno} * ${b} * ${s}`;
  const unitsOf = async () => db.collection('barcodeLabel').find({ grcId }).toArray();
  const byClient = (list, key) => list.find((u) => u.clientRowId === `e2e-${hex}-${key}`);
  let units = await unitsOf();
  const expected1 = { A1: ['1', 1], A2: ['1', 2], A3: ['1', 3], M1: ['2', 1], B1: ['2', 2] };
  Object.entries(expected1).forEach(([key, [b, s]]) => {
    const u = byClient(units, key);
    ok(`${key}: value ${val(b, s)}, serialNo ${s}, own number`, u
      && u.barcodeGenerated === val(b, s) && u.serialNo === String(s) && u.billSlNo === b
      && /^\S+$/.test(u.barcodeNo) && !isComposedBarcodeValue(u.barcodeNo) && u.barcodeNo !== u.barcodeGenerated,
    u ? JSON.stringify({ no: u.barcodeNo, gen: u.barcodeGenerated, serial: u.serialNo }) : 'missing');
  });
  ok(`unit numbers come from this business's Barcode Setting (${prefix}NNNN)`, units.every((u) => new RegExp('^' + prefix + '\\d{4}$').test(u.barcodeNo)), units.map((u) => u.barcodeNo).join(','));
  ok('createdRows carry barcodeNo, barcodeGenerated, billSlNo and serialNo', (r1.body.createdRows || []).every((c) => c.barcodeNo && c.barcodeGenerated && c.billSlNo && c.serialNo));
  let grcRaw = await db.collection('grc').findOne({ _id: new ObjectId(grcId) });
  ok('GRC remembers each line\'s highest serial (b1 3, b2 2, base 0)', grcRaw.lastSerialByBill?.b1 === 3 && grcRaw.lastSerialByBill?.b2 === 2 && grcRaw.serialFloorBase === 0, JSON.stringify({ m: grcRaw.lastSerialByBill, b: grcRaw.serialFloorBase }));

  /* =================== 2. the same Submit again ======================= */
  console.log('\n--- 2. Submit pressed twice creates nothing ---');
  const r2 = await api('/api/barcode-generation', { method: 'POST', body: JSON.stringify({ rows: rows1, grcId, deleteIds: [], supplierId: String(supA), ...scopeBody }) });
  ok('second identical Submit: 0 created, still 5 rows', r2.ok && r2.body.created === 0 && (await unitsOf()).length === 5, JSON.stringify(r2.body).slice(0, 200));

  /* ============ 3. more rows on the same GRC (grid + 2 new) =========== */
  console.log('\n--- 3. adding rows to an existing GRC ---');
  const gridOf = async () => ((await api(`/api/grc/${grcId}`)).body.rows || []).map(toGridRow);
  const before3 = await unitsOf();
  const r3 = await api('/api/barcode-generation', { method: 'POST', body: JSON.stringify({ rows: [...await gridOf(), row('A4', { billSlNo: '1' }), row('M2', { itemCode: 'E2E-MTR', uom: 'MTR', qty: '4.5', billSlNo: '3' })], grcId, deleteIds: [], ...scopeBody }) });
  units = await unitsOf();
  ok('2 created, 0 updated', r3.ok && r3.body.created === 2 && r3.body.updated === 0, JSON.stringify(r3.body).slice(0, 200));
  ok(`A4 -> ${val(1, 4)}, M2 -> ${val(3, 1)}`, byClient(units, 'A4')?.barcodeGenerated === val(1, 4) && byClient(units, 'M2')?.barcodeGenerated === val(3, 1),
    JSON.stringify([byClient(units, 'A4')?.barcodeGenerated, byClient(units, 'M2')?.barcodeGenerated]));
  ok('the five saved rows are untouched (_id, number, value, updatedAt)', before3.every((b) => {
    const a = units.find((u) => String(u._id) === String(b._id));
    return a && a.barcodeNo === b.barcodeNo && a.barcodeGenerated === b.barcodeGenerated && +a.updatedAt === +b.updatedAt;
  }));

  /* ================ 4. a row with no Bill Sl No. ====================== */
  console.log('\n--- 4. no Bill Sl No.: refused, nothing saved, no number spent ---');
  const seqBefore = await counterSeq();
  const r4 = await api('/api/barcode-generation', { method: 'POST', body: JSON.stringify({ rows: [...await gridOf(), row('X1', { billSlNo: '' })], grcId, deleteIds: [], ...scopeBody }) });
  ok('refused with 400 naming Bill Sl No.', r4.status === 400 && /Bill Sl No/i.test(r4.body?.error || ''), `${r4.status} ${r4.body?.error}`);
  ok('nothing inserted', (await unitsOf()).length === 7);
  ok('no barcode number spent', (await counterSeq()) === seqBefore, `${seqBefore} -> ${await counterSeq()}`);

  /* ============== 5. a corrected Bill Sl No. restates the value ======= */
  console.log('\n--- 5. correcting a Bill Sl No. ---');
  const a2 = byClient(units, 'A2');
  const grid5 = (await gridOf()).map((g) => (g._id === String(a2._id) ? { ...g, billSlNo: '3' } : g));
  const r5 = await api('/api/barcode-generation', { method: 'POST', body: JSON.stringify({ rows: grid5, grcId, deleteIds: [], ...scopeBody }) });
  const a2After = (await unitsOf()).find((u) => String(u._id) === String(a2._id));
  ok(`A2 -> ${val(3, 2)} (same serial, free on line 3), number kept`, r5.ok && a2After.barcodeGenerated === val(3, 2) && a2After.serialNo === '2' && a2After.barcodeNo === a2.barcodeNo,
    JSON.stringify({ status: r5.status, gen: a2After.barcodeGenerated, serial: a2After.serialNo, err: r5.body?.error }));

  /* ========== 6. a deleted barcode's value is never given again ======= */
  console.log('\n--- 6. delete, then add: the deleted serial is not reused ---');
  const a4 = byClient(await unitsOf(), 'A4');
  const del = await api('/api/barcode-generation', { method: 'DELETE', body: JSON.stringify({ id: String(a4._id) }) });
  ok('A4 deleted', del.ok, JSON.stringify(del.body));
  const r6 = await api('/api/barcode-generation', { method: 'POST', body: JSON.stringify({ rows: [...await gridOf(), row('A5', { billSlNo: '1' })], grcId, deleteIds: [], ...scopeBody }) });
  units = await unitsOf();
  ok(`A5 -> ${val(1, 5)}, not ${val(1, 4)}`, r6.ok && byClient(units, 'A5')?.barcodeGenerated === val(1, 5), byClient(units, 'A5')?.barcodeGenerated);

  /* ====================== 7. scanning the new labels ================== */
  console.log('\n--- 7. a label scans back to its record, in every spelling ---');
  const a1 = byClient(units, 'A1');
  for (const [what, code] of [['compact (what the bars encode)', canon(a1.barcodeGenerated)], ['stored spelling', a1.barcodeGenerated], ['unit number', a1.barcodeNo]]) {
    const s = await api('/api/barcode/scan', { method: 'POST', body: JSON.stringify({ code, business: String(business), intent: 'LOOKUP' }) });
    ok(`scan ${what} "${code}" -> ${a1.barcodeNo}`, s.ok && s.body?.unit?.barcodeNo === a1.barcodeNo, `${s.status} ${JSON.stringify(s.body).slice(0, 160)}`);
  }

  /* ============== 8. supplier Price Calculation Setup (API) =========== */
  console.log('\n--- 8. GET /api/grc/:id carries the supplier\'s Price Calculation Setup ---');
  const defs = priceSetupFieldDefs(SUPPLIER_TABS);
  const g8 = (await api(`/api/grc/${grcId}`)).body.grc;
  const setup = g8.supplierPriceSetup;
  ok('status OK, supplier A by id', setup?.status === 'OK' && setup.supplierId === String(supA) && setup.supplierCode === codeA, JSON.stringify(setup).slice(0, 200));
  ok(`every Price Calculation Setup field, in order (${defs.map((d) => d.key).join(', ')})`, JSON.stringify(setup.fields.map((f) => [f.key, f.label])) === JSON.stringify(defs.map((d) => [d.key, d.label])));
  ok('Mark Up on Cost E-comm = 12.5 as stored', setup.fields.find((f) => f.key === 'markUpOnCostDp')?.value === 12.5 && g8.supplierMarkup?.dp === 12.5);
  ok('no supplier -> NO_SUPPLIER', (await api(`/api/grc/${grcNoSupplier}`)).body.grc.supplierPriceSetup?.status === 'NO_SUPPLIER');
  ok('supplier without a setup -> NO_SETUP', (await api(`/api/grc/${grcSupplierC}`)).body.grc.supplierPriceSetup?.status === 'NO_SETUP');

  /* ============================== Chrome ============================== */
  const port = 9300 + Math.floor(Math.random() * 600);
  chrome = spawn(CHROME, [
    `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(workDir, 'profile')}`, '--headless=new',
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--window-size=1440,1000', 'about:blank',
  ], { stdio: 'ignore' });
  for (let i = 0; i < 100; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${port}/json/version`)).ok) break; } catch { /* starting */ }
    await sleep(150);
  }
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  cdp = await connect(target.webSocketDebuggerUrl);
  cdp.on('Runtime.exceptionThrown', (p) => consoleErrors.push('exception: ' + (p.exceptionDetails?.exception?.description || p.exceptionDetails?.text)));
  cdp.on('Runtime.consoleAPICalled', (p) => { if (p.type === 'error') consoleErrors.push('console.error: ' + p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)); });
  cdp.on('Log.entryAdded', (p) => { if (p.entry.level === 'error' && !/favicon/i.test(p.entry.url || '')) consoleErrors.push('log: ' + p.entry.text + ' ' + (p.entry.url || '')); });
  cdp.on('Network.responseReceived', (p) => { if (p.response.url.includes('/api/') && p.response.status >= 400) failedApi.push(p.response.status + ' ' + p.response.url.replace(BASE, '')); });
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Log.enable'), cdp.send('Network.enable')]);
  await cdp.send('Network.setCookie', { name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: BASE });
  /* the screen's company / location selectors answer with the throwaway
     scope, so any save from the page lands there */
  await cdp.send('Fetch.enable', { patterns: [
    { urlPattern: '*/api/options?ref=business*', requestStage: 'Request' },
    { urlPattern: '*/api/options?ref=companylocations*', requestStage: 'Request' },
  ] });
  cdp.on('Fetch.requestPaused', (p) => {
    const body = p.request.url.includes('ref=business')
      ? { options: [{ value: String(business), label: 'E2E PRINT BUSINESS', isDefault: true }] }
      : { options: [{ value: String(location), label: 'E2E PRINT LOCATION' }] };
    cdp.send('Fetch.fulfillRequest', {
      requestId: p.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    }).catch(() => {});
  });

  /* ============ 9. Barcode Generation: the Add Item form ============== */
  console.log('\n--- 9. Barcode Generation page: Bill Sl No. hidden, supplier setup, Tab, Submit & Print ---');
  await navigate(`${BASE}/admin/transaction/purchase/grc/${grcId}/barcode-generation`);
  ok('page loaded', Boolean(await waitFor(`!!${FIELD('Markup E-COMM % *')}`, 120000)));
  ok('no "Bill Sl No. *" field anywhere on the form', await evaluate(`![...document.querySelectorAll('label')].some((l) => /Bill Sl No/i.test(l.textContent)) && !document.querySelector('input[aria-label="Bill Sl No."]')`));
  ok('Serial No. is still shown', await evaluate(`document.querySelectorAll('input[aria-label="Serial No."]').length > 0`));
  ok('Markup E-COMM % = 12.50 (supplier A, Mark Up on Cost E-comm 12.5)', (await fieldValue('Markup E-COMM % *')) === '12.50', await fieldValue('Markup E-COMM % *'));
  ok('Markup RSP % = 100, Markup WSP % = 15', (await fieldValue('Markup RSP % *')) === '100' && (await fieldValue('Markup WSP % *')) === '15', `${await fieldValue('Markup RSP % *')} / ${await fieldValue('Markup WSP % *')}`);
  ok('Discount Type = Percentage, Discount = 10', (await fieldValue('Discount Type')) === 'Percentage' && (await fieldValue('Discount *')) === '10');
  const panel = await evaluate(`document.querySelector('[data-testid="supplier-price-setup"]')?.textContent || ''`);
  ok('setup panel names the supplier and lists the Round Off values', /E2E SUPPLIER A/.test(panel) && /RSP Round Off:\s*1/.test(panel) && /WSP Round Off:\s*1/.test(panel) && /E-comm Round Off:\s*1/.test(panel), panel);

  /* Tab: from Discount straight to Markup RSP % (Final price is not a stop) */
  await evaluate(`${FIELD('Discount *')}.focus()`);
  await press('Tab');
  ok('Tab from Discount lands on Markup RSP %', await evaluate(`document.activeElement === ${FIELD('Markup RSP % *')}`),
    await evaluate(`document.activeElement?.outerHTML.slice(0, 120)`));

  /* Tab walk, with the ITEM WITH BARCODE tab (row Delete buttons) open */
  await clickButton('ITEM WITH BARCODE');
  await waitFor(`document.querySelectorAll('input[aria-label="System generated barcode"]').length > 0`, 10000);
  const shown = await evaluate(`[...document.querySelectorAll('input[aria-label="System generated barcode"]')].map((i) => i.value)`);
  ok('ITEM WITH BARCODE shows each saved value in the label spelling', shown.length === 7 && units.every((u) => shown.includes(canon(u.barcodeGenerated))), shown.join(', '));
  await evaluate(`document.querySelector('input[placeholder="Enter / Scan Old Barcode"]').focus()`);
  const stops = [];
  for (let i = 0; i < 70; i += 1) {
    await press('Tab');
    stops.push(await evaluate(`(() => { const a = document.activeElement; if (!a || a === document.body) return null; return { tag: a.tagName, text: (a.textContent || '').trim().slice(0, 30), aria: a.getAttribute('aria-label') || '', ro: Boolean(a.readOnly), label: a.closest('.space-y-1')?.querySelector('label')?.textContent.trim() || '' }; })()`));
  }
  const destructive = stops.filter((s) => s && s.tag === 'BUTTON' && (/^(delete|remove|−|-|✕|×|\+)$/i.test(s.text) || /delete|clear|remove/i.test(s.aria)));
  ok('Tab never lands on a Delete / Remove / minus / clear control', destructive.length === 0, JSON.stringify(destructive.slice(0, 3)));
  ok('Tab never lands on a read-only box', !stops.some((s) => s && s.tag === 'INPUT' && s.ro), JSON.stringify(stops.filter((s) => s && s.ro).slice(0, 3)));
  const inputOrder = stops.filter((s) => s && (s.tag === 'INPUT' || s.tag === 'SELECT') && s.label).map((s) => s.label);
  note('input stops: ' + [...new Set(inputOrder)].join(' > '));
  await clickButton('ITEMS');
  await sleep(300);

  /* pick the item: its "No" flag must not blank the supplier's markup */
  await evaluate(`(() => { const i = ${FIELD('Item Code *')}; i.scrollIntoView({ block: 'center' }); i.focus(); })()`);
  await cdp.send('Input.insertText', { text: itemCode });
  const optionShown = await waitFor(`[...document.querySelectorAll('div')].some((d) => d.textContent.trim() === ${JSON.stringify(itemCode)} && d.className.includes('font-medium'))`, 15000);
  ok('item found in the Item Code search', Boolean(optionShown));
  await press('Enter');
  await waitFor(`[...document.querySelectorAll('span')].some((s) => s.textContent.trim() === ${JSON.stringify(itemCode)})`, 10000);
  await sleep(1500);   // the item detail request
  ok('after picking the item, Markup E-COMM % is still 12.50', (await fieldValue('Markup E-COMM % *')) === '12.50', await fieldValue('Markup E-COMM % *'));

  await setField('Purchase Rate *', '100');
  await setField('Quantity *', '2');
  await sleep(400);
  const prices = {
    final: await fieldValue('Final price *'), rsp: await fieldValue('RSP Price *'),
    wsp: await fieldValue('WSP Price *'), ecomm: await fieldValue('E-COMM Price *'),
  };
  ok('prices use the supplier setup: final 90.00, RSP 180.00, WSP 103.50, E-COMM 101.25',
    prices.final === '90.00' && prices.rsp === '180.00' && prices.wsp === '103.50' && prices.ecomm === '101.25', JSON.stringify(prices));

  const unitsBeforeUi = await unitsOf();
  await clickButton('Submit & Print Label');
  const pickerOpen = await waitFor(`[...document.querySelectorAll('h3')].some((h) => h.textContent.trim() === 'Print Label Picker') && document.querySelectorAll('[data-label] svg[data-barcode] g').length > 0`, 60000);
  ok('Submit & Print Label saved and opened the picker', Boolean(pickerOpen), await evaluate(`document.body.innerText.match(/Save failed[^\\n]*|[^\\n]*Nothing was saved[^\\n]*/)?.[0] || ''`));
  const unitsAfterUi = await unitsOf();
  const fresh = unitsAfterUi.filter((u) => !unitsBeforeUi.some((b) => String(b._id) === String(u._id)));
  ok('exactly 2 new barcodes saved, nothing else changed', fresh.length === 2 && unitsBeforeUi.every((b) => {
    const a = unitsAfterUi.find((u) => String(u._id) === String(b._id));
    return a && +a.updatedAt === +b.updatedAt;
  }), `${fresh.length} new`);
  const freshValues = fresh.map((u) => u.barcodeGenerated).sort();
  ok(`hidden Bill Sl No. (1) + next serials: ${val(1, 6)}, ${val(1, 7)}`, JSON.stringify(freshValues) === JSON.stringify([val(1, 6), val(1, 7)]), freshValues.join(', '));
  ok('new rows are complete (own number, serialNo, item, RSP from the supplier markup)', fresh.every((u) => u.barcodeNo && !isComposedBarcodeValue(u.barcodeNo)
    && ['6', '7'].includes(u.serialNo) && u.itemCode === itemCode && Number(u.retailPrice) === 180), JSON.stringify(fresh.map((u) => [u.barcodeNo, u.serialNo, u.itemCode, u.retailPrice])));
  const pickerLines = await evaluate(`[...document.querySelectorAll('.font-mono.text-xs.text-gray-600')].map((d) => d.firstChild?.textContent || '')`);
  ok('the picker lists only the 2 new barcodes, in the label spelling', pickerLines.length === 2 && fresh.every((u) => pickerLines.includes(canon(u.barcodeGenerated))), pickerLines.join(', '));
  const rowsByNumber = (list) => new Map(list.flatMap((u) => [[u.barcodeNo, u], [canon(u.barcodeGenerated), u]]));
  checkLabels('picker preview', await evaluate(READ_LABELS('document')), rowsByNumber(unitsAfterUi), { expectCount: 2 });
  await clickButton('×');
  await sleep(300);

  /* reload: everything comes back from the database */
  await navigate(`${BASE}/admin/transaction/purchase/grc/${grcId}/barcode-generation`);
  await waitFor(`!!${FIELD('Markup E-COMM % *')}`, 60000);
  await clickButton('ITEM WITH BARCODE');
  await waitFor(`document.querySelectorAll('input[aria-label="System generated barcode"]').length >= 9`, 15000);
  const shownAfter = await evaluate(`[...document.querySelectorAll('input[aria-label="System generated barcode"]')].map((i) => i.value)`);
  ok('after reload, all 9 values are listed as stored', shownAfter.length === 9 && unitsAfterUi.every((u) => shownAfter.includes(canon(u.barcodeGenerated))), shownAfter.join(', '));
  await clickButton('Print Labels');
  await waitFor(`document.querySelectorAll('[data-label] svg[data-barcode] g').length > 0`, 20000);
  checkLabels('picker (Print Labels, after reload)', await evaluate(READ_LABELS('document')), rowsByNumber(unitsAfterUi));
  await clickButton('×');

  /* ===================== 10. Barcode Print page ======================= */
  console.log('\n--- 10. Barcode Print page ---');
  const allUnits = await unitsOf();
  const printUrl = `${BASE}/admin/transaction/purchase/barcode-print/${grcId}`;
  await navigate(printUrl);
  /* 6 unique + 2 MTR x 2 = 10 labels before the batch count is set */
  ok('10 labels drawn before the batch count', Boolean(await waitFor(`document.querySelectorAll('[data-label] svg[data-barcode] g').length === 10`, 60000)),
    String(await evaluate(`document.querySelectorAll('[data-label]').length`)));
  await clickButton('Set quantity');
  await waitFor(`!!document.getElementById('batch-label-count')`, 5000);
  await evaluate(`document.getElementById('batch-label-count').focus()`);
  await cdp.send('Input.insertText', { text: '3' });
  await press('Enter');
  ok('13 labels once the batch asks for 3', Boolean(await waitFor(`document.querySelectorAll('[data-label] svg[data-barcode] g').length === 13`, 10000)));
  checkLabels('barcode print page', await evaluate(READ_LABELS('document')), rowsByNumber(allUnits), { expectCount: 13 });
  const batchLine = await evaluate(`[...document.querySelectorAll('li span.font-mono')].map((s) => s.textContent)`);
  const b1 = byClient(allUnits, 'B1');
  ok('the batch list names the barcode in the label spelling', batchLine.includes(canon(b1.barcodeGenerated)), batchLine.join(', '));

  /* the real print run: the page's own readiness check, then window.print */
  await evaluate(`(() => {
    window.__snap = null;
    window.print = () => {
      const r = document.getElementById('barcode-print-root');
      if (!r) { window.__snap = { error: 'no print root' }; return; }
      window.__snap = { count: r.querySelectorAll('svg[data-barcode]').length };
      const copy = r.cloneNode(true);
      copy.id = 'bp-copy';
      document.body.appendChild(copy);
    };
  })()`);
  await clickButton('Print Labels');
  const snap = await waitFor(`window.__snap`, 20000);
  ok('Print Labels passed the readiness check and printed 13 labels', snap?.count === 13, JSON.stringify(snap) + ' ' + (await evaluate(`document.body.innerText.match(/Printing stopped[^\\n]*/)?.[0] || ''`)));
  checkLabels('print run output', await evaluate(READ_LABELS(`document.getElementById('bp-copy')`)), rowsByNumber(allUnits), { expectCount: 13 });
  await evaluate(`(() => {
    const live = document.getElementById('barcode-print-root');
    if (live) live.id = 'bp-live';
    document.getElementById('bp-copy').id = 'barcode-print-root';
    document.body.classList.add('printing-labels');
  })()`);
  if (process.env.E2E_SHOT) {
    /* a picture of the printed sheet, at 3x, to look at */
    await cdp.send('Emulation.setEmulatedMedia', { media: 'print' });
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 800, height: 1100, deviceScaleFactor: 3, mobile: false });
    const shot = await cdp.send('Page.captureScreenshot', { captureBeyondViewport: false });
    fs.writeFileSync(process.env.E2E_SHOT, Buffer.from(shot.data, 'base64'));
    await cdp.send('Emulation.clearDeviceMetricsOverride');
    await cdp.send('Emulation.setEmulatedMedia', { media: '' });
  }
  const pdf = await cdp.send('Page.printToPDF', { preferCSSPageSize: true, printBackground: true });
  const pdfFile = path.join(workDir, 'labels.pdf');
  fs.writeFileSync(pdfFile, Buffer.from(pdf.data, 'base64'));
  const text = spawnSync(PDFTOTEXT, ['-layout', pdfFile, '-'], { encoding: 'utf8' }).stdout || '';
  const flat = text.replace(/\s+/g, ' ');
  const missingInPdf = allUnits.filter((u) => !flat.includes(canon(u.barcodeGenerated)) || !flat.includes(u.barcodeNo)).map((u) => u.barcodeNo);
  ok('the printed PDF carries every number and every value', text.length > 0 && missingInPdf.length === 0, missingInPdf.join(', ') || (text ? '' : 'pdftotext gave nothing'));
  if (process.env.E2E_KEEP_PDF) fs.copyFileSync(pdfFile, process.env.E2E_KEEP_PDF);

  await navigate(printUrl);
  ok('after reload the page draws the labels again', Boolean(await waitFor(`document.querySelectorAll('[data-label] svg[data-barcode] g').length === 10`, 60000)));
  checkLabels('barcode print page (reloaded)', await evaluate(READ_LABELS('document')), rowsByNumber(allUnits), { expectCount: 10 });
  const afterPrint = await unitsOf();
  ok('opening, printing and reloading wrote nothing', afterPrint.length === allUnits.length && allUnits.every((b) => {
    const a = afterPrint.find((u) => String(u._id) === String(b._id));
    return a && +a.updatedAt === +b.updatedAt;
  }));

  /* ============ 11. a different supplier, and none at all ============= */
  console.log('\n--- 11. another supplier / no setup / no supplier ---');
  await db.collection('grc').updateOne({ _id: new ObjectId(grcId) }, { $set: { supplierId: supB } });
  await navigate(`${BASE}/admin/transaction/purchase/grc/${grcId}/barcode-generation`);
  await waitFor(`/E2E SUPPLIER B/.test(document.querySelector('[data-testid="supplier-price-setup"]')?.textContent || '')`, 60000);
  ok('supplier B: Markup E-COMM % 12, RSP 80, WSP blank, discount back to 0',
    (await fieldValue('Markup E-COMM % *')) === '12' && (await fieldValue('Markup RSP % *')) === '80'
    && (await fieldValue('Markup WSP % *')) === '' && (await fieldValue('Discount *')) === '0',
    JSON.stringify([await fieldValue('Markup E-COMM % *'), await fieldValue('Markup RSP % *'), await fieldValue('Markup WSP % *'), await fieldValue('Discount *')]));
  await navigate(`${BASE}/admin/transaction/purchase/grc/${grcSupplierC}/barcode-generation`);
  const cPanel = await waitFor(`document.querySelector('[data-testid="supplier-price-setup"]')?.textContent || ''`, 60000);
  ok('supplier C: "No price calculation setup configured", no percentages', /No price calculation setup configured for this supplier/.test(cPanel || '')
    && (await fieldValue('Markup E-COMM % *')) === '' && (await fieldValue('Markup RSP % *')) === '', cPanel);
  await navigate(`${BASE}/admin/transaction/purchase/grc/${grcNoSupplier}/barcode-generation`);
  const nPanel = await waitFor(`document.querySelector('[data-testid="supplier-price-setup"]')?.textContent || ''`, 60000);
  ok('no supplier: "No supplier linked to this GRC."', /No supplier linked to this GRC/.test(nPanel || ''), nPanel);

  /* ================ 12. real GRCs, viewed only ======================== */
  console.log('\n--- 12. real GRCs (viewed only) ---');
  const legacyGrc = await db.collection('grc').findOne({ grcNumber: '05177' });
  const realIds = [REAL.g05182, REAL.g05178, legacyGrc && String(legacyGrc._id)].filter(Boolean);
  const realBefore = await db.collection('barcodeLabel').find({ grcId: { $in: realIds } }).toArray();
  for (const [name, id] of [['05182 (reference)', REAL.g05182], ['05178', REAL.g05178], ...(legacyGrc ? [['05177 (no composed values)', String(legacyGrc._id)]] : [])]) {
    const list = realBefore.filter((u) => u.grcId === id);
    await navigate(`${BASE}/admin/transaction/purchase/barcode-print/${id}`);
    const drawn = await waitFor(`document.querySelectorAll('[data-label] svg[data-barcode] g').length > 0 && document.querySelectorAll('[data-label] svg[data-barcode] g').length >= document.querySelectorAll('[data-label]').length`, 90000);
    ok(`${name}: labels drawn`, Boolean(drawn));
    checkLabels(`real GRC ${name}`, await evaluate(READ_LABELS('document')), rowsByNumber(list));
  }
  const ref = realBefore.filter((u) => u.grcId === REAL.g05182);
  const refLabels = await (async () => {
    await navigate(`${BASE}/admin/transaction/purchase/barcode-print/${REAL.g05182}`);
    await waitFor(`document.querySelectorAll('[data-label] svg[data-barcode] g').length >= 15`, 90000);
    return evaluate(READ_LABELS('document'));
  })();
  ok('reference 05182: G1319*05182*1*1 .. *2*15 on the right, 9A numbers on the left',
    ['G1319*05182*1*1', 'G1319*05182*1*6', 'G1319*05182*2*15'].every((v) => refLabels.some((l) => l.right === v && decodeRects(l.rects) === v && /^9A\d{4}$/.test(l.left))),
    refLabels.map((l) => `${l.left}|${l.right}`).join(', '));
  await navigate(`${BASE}/admin/transaction/purchase/grc/${REAL.g05182}/barcode-generation`);
  await waitFor(`!!${FIELD('Markup E-COMM % *')}`, 90000);
  ok('reference 05182 generation page: Markup E-COMM % = 30 (AMEERA TEX WORLD), no Bill Sl No. field',
    (await fieldValue('Markup E-COMM % *')) === '30' && await evaluate(`![...document.querySelectorAll('label')].some((l) => /Bill Sl No/i.test(l.textContent))`),
    await fieldValue('Markup E-COMM % *'));
  await clickButton('ITEM WITH BARCODE');
  await waitFor(`document.querySelectorAll('input[aria-label="System generated barcode"]').length >= ${ref.length}`, 15000);
  const refShown = await evaluate(`[...document.querySelectorAll('input[aria-label="System generated barcode"]')].map((i) => i.value)`);
  ok(`reference 05182 lists its ${ref.length} stored values`, ref.every((u) => refShown.includes(canon(u.barcodeGenerated))), refShown.join(', '));
  const realAfter = await db.collection('barcodeLabel').find({ grcId: { $in: realIds } }).toArray();
  ok('the real GRCs were not written to', realAfter.length === realBefore.length && realBefore.every((b) => {
    const a = realAfter.find((u) => String(u._id) === String(b._id));
    return a && +a.updatedAt === +b.updatedAt;
  }));

  /* ================ 13. the standalone generation screen ============== */
  console.log('\n--- 13. standalone Barcode Generation screen ---');
  const errorsBefore = consoleErrors.length;
  await navigate(`${BASE}/admin/inventory/barcode-generation`);
  ok('renders', Boolean(await waitFor(`[...document.querySelectorAll('h1')].some((h) => h.textContent.includes('GRC Barcode Generation'))`, 90000)));
  await sleep(2500);
  ok('does not re-render for ever', !consoleErrors.slice(errorsBefore).some((e) => /Maximum update depth/i.test(e)), consoleErrors.slice(errorsBefore).join(' || ').slice(0, 300));

  const realErrors = consoleErrors.filter((e) => !/Failed to load resource.*(favicon|404)/i.test(e));
  ok('no console errors on any page', realErrors.length === 0, realErrors.slice(0, 4).join(' || ').slice(0, 600));
  ok('no failed API calls from the pages', failedApi.length === 0, failedApi.slice(0, 5).join(', '));
} catch (error) {
  fail++;
  console.log('  FAIL  run aborted: ' + (error.stack || error.message));
} finally {
  await cleanup();
  const left = await db.collection('barcodeLabel').countDocuments({ businessId: String(business) });
  console.log(`\ncleanup: ${left === 0 ? 'done' : left + ' barcode rows left behind!'}`);
  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
