/* TEMPORARY read-only UI check - deleted after the run.
   Opens the Barcode Generation form of the reported GRC and reads the two
   Serial No. boxes, then picks two Item Summary items and reads them again.
   It never presses Submit, so no GRC record is written. */
import mongoose from 'mongoose';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';

const BASE = process.env.E2E_BASE || 'http://localhost:3001';
const GRC_ID = '6abd1c3f1dd6ac4f2056d5b0';
const CHROME = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
].find((p) => p && fs.existsSync(p));

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

const hex = crypto.randomBytes(3).toString('hex').toUpperCase();
const email = `tmp-ui-${hex.toLowerCase()}@example.invalid`;
const pw = 'Tmp-ui-pass';
const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp-ui-check-'));
let chrome = null, cdp = null;

try {
  const grc = await db.collection('grc').findOne({ _id: new ObjectId(GRC_ID) });
  ok('GRC row found', Boolean(grc), GRC_ID);
  const business = String(grc.businessId);
  const location = String(grc.locationId);

  const salt = crypto.randomBytes(16).toString('hex');
  await db.collection('user').insertOne({
    name: 'TMP UI', email, password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
    role: 'Super Admin', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  });
  let cookie = '';
  let loginStatus = 0;
  for (let attempt = 0; attempt < 4 && !cookie; attempt += 1) {
    const login = await fetch(BASE + '/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }),
    });
    loginStatus = login.status;
    cookie = (login.headers.get('set-cookie') || '').split(';')[0];
    if (!cookie) await sleep(1500);
  }
  ok('signed in', Boolean(cookie), 'HTTP ' + loginStatus);
  if (!cookie) throw new Error('sign-in failed');

  const port = 9600 + Math.floor(Math.random() * 300);
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
  await Promise.all([cdp.send('Page.enable'), cdp.send('Runtime.enable'), cdp.send('Network.enable')]);
  await cdp.send('Network.setCookie', { name: cookie.split('=')[0], value: cookie.split('=').slice(1).join('='), url: BASE });

  /* the page's company / location selectors answer with this GRC's own scope,
     so the Item Code search looks in the business the rows belong to */
  await cdp.send('Fetch.enable', { patterns: [
    { urlPattern: '*/api/options?ref=business*', requestStage: 'Request' },
    { urlPattern: '*/api/options?ref=companylocations*', requestStage: 'Request' },
  ] });
  cdp.on('Fetch.requestPaused', (p) => {
    const body = p.request.url.includes('ref=business')
      ? { options: [{ value: business, label: 'TMP BUSINESS', isDefault: true }] }
      : { options: [{ value: location, label: 'TMP LOCATION' }] };
    cdp.send('Fetch.fulfillRequest', {
      requestId: p.requestId, responseCode: 200,
      responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
      body: Buffer.from(JSON.stringify(body)).toString('base64'),
    }).catch(() => {});
  });

  const evaluate = async (expression) => {
    const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const waitFor = async (expression, ms = 30000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      try { const v = await evaluate(expression); if (v) return v; } catch { /* loading */ }
      await sleep(200);
    }
    return null;
  };
  const pressEnter = async () => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'char', key: 'Enter', text: '\r' });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(80);
  };
  const serialBoxes = `[...document.querySelectorAll('input[aria-label="Serial No."]')].map((i) => ({ value: i.value, readOnly: i.readOnly }))`;

  await cdp.send('Page.navigate', { url: `${BASE}/admin/transaction/purchase/grc/${GRC_ID}/barcode-generation` });
  const loaded = await waitFor(`document.querySelectorAll('input[aria-label="Serial No."]').length >= 2`, 120000);
  ok('Barcode Generation form loaded', Boolean(loaded));

  let boxes = await evaluate(serialBoxes);
  ok('two Serial No. boxes', boxes.length === 2, JSON.stringify(boxes));
  ok('both show the Item Summary BILL SL NO. 1 (not 12)', boxes.every((b) => b.value === '1'), JSON.stringify(boxes));
  ok('one editable and one locked', boxes[0].readOnly === false && boxes[1].readOnly === true, JSON.stringify(boxes));

  /* pick each item on the Item Summary; the bill line must follow the row */
  for (const code of ['10-PF-CHN', '9-PVD']) {
    const focused = await evaluate(`(() => {
      const i = document.querySelector('input[placeholder="Search Item Code…"]');
      if (!i) return false;
      i.scrollIntoView({ block: 'center' }); i.focus(); i.select?.();
      return true;
    })()`);
    if (!focused) { ok(`Item Code search available for ${code}`, false); break; }
    await cdp.send('Input.insertText', { text: code });
    const option = await waitFor(`[...document.querySelectorAll('div')].some((d) => d.textContent.trim() === ${JSON.stringify(code)} && d.className.includes('font-medium'))`, 15000);
    ok(`${code} found in the Item Code search`, Boolean(option));
    if (!option) continue;
    await pressEnter();
    await sleep(1500);
    boxes = await evaluate(serialBoxes);
    ok(`after picking ${code}: both boxes still show its BILL SL NO. 1`, boxes.length === 2 && boxes.every((b) => b.value === '1'), JSON.stringify(boxes));
  }
} finally {
  try { cdp?.close(); } catch { /* closed */ }
  try { chrome?.kill(); } catch { /* gone */ }
  await new Promise((resolve) => setTimeout(resolve, 300));
  try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* chrome holds a file */ }
  await db.collection('user').deleteOne({ email });
  await mongoose.disconnect();
  console.log(`\n${pass} passed, ${fail} failed (temp user removed, nothing saved)`);
  if (fail) process.exitCode = 1;
}
