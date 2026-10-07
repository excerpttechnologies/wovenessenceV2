/* Regression sweep: request EVERY admin page and EVERY API GET route, and
   report anything that returns 5xx.

   This is the check that the inventory work did not break the other 140
   screens. It is deliberately shallow - it proves a page renders and a route
   answers, not that the numbers on it are right - but a 500 is the failure
   mode that actually matters after a change to shared plumbing, and this
   catches every one of them in a couple of minutes.

   Routes are enumerated from the filesystem rather than a list, so a screen
   added later is swept without anyone remembering to add it here.

   Dynamic segments ([id]) are filled with a real document id looked up from
   the collection that route belongs to; a route whose collection is empty is
   reported as SKIP rather than counted as a pass.

   Read-only: it issues GET requests only, and removes the temporary sign-in
   account it creates.

     npx next start -p 3111          (in one terminal)
     npm run smoke                   (in another)
*/

import mongoose from 'mongoose';
import crypto from 'crypto';
import { readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const BASE = process.env.SMOKE_BASE || 'http://127.0.0.1:3111';
const URI = process.env.MONGODB_URI;

/* Which collection to pull a sample id from, per route segment. Only needed
   where the route name and the collection name differ. */
const SAMPLE = {
  'purchase-grc': 'grc', grc: 'grc', 'purchase-grt': 'grt', 'purchase-invoice': 'purchaseinvoice',
  'purchase-debitnote': 'debitnote', 'sell-pos': 'posinvoice', 'sell-pos-return': 'posreturn',
  'sell-salesinvoice': 'salesinvoice', 'sell-salereturn': 'salesreturn',
  'sell-deliverychallan': 'deliverychallan', 'sell-creditnote': 'creditnote',
  'sell-b2binvoice': 'b2binvoice', 'stock-transfer': 'stocktransfer',
  'stock-transfer-location': 'stocktransferlocation', 'stock-transfer-packet': 'stocktransferpacket',
  'stock-transfer-received': 'stocktransferreceived', 'stock-adjustment': 'stockadjustment',
  'company-location': 'companylocation', 'contact-type': 'contacttype', 'city-group': 'citygroup',
  'doc-setup': 'docsetup', 'ledger-group': 'ledgergroup', 'payment-method': 'paymentmethod',
  'pos-counter': 'poscounter', 'product-filter': 'productfilter', 'product-group': 'productgroup',
  'purchase-charge': 'purchasecharge', 'purchase-group': 'purchasegroup', 'purchase-term': 'purchaseterm',
  'sales-term': 'salesterm', 'stock-point': 'stockpoint', 'barcode-setting': 'barcodesetting',
  'split-barcode-setting': 'splitbarcodesetting', 'attribute-addon': 'attributeaddon',
  'transport-route': 'transportroute', 'ic-sales-invoice': 'icsalesinvoice',
  'ic-delivery-challan': 'icdeliverychallan', 'ic-sales-return': 'icsalesreturn',
  'ic-auto-purchase-received': 'icautopurchasereceived', 'ic-auto-purchase-return': 'icautopurchasereturn',
  'cash-register': 'cashregister', 'delivery-challan': 'deliverychallan',
  customer: 'contact', supplier: 'contact', agent: 'contact', item: 'item', uom: 'uom',
  hsn: 'hsn', tax: 'tax', ledger: 'ledger', business: 'business', voucher: 'voucher',
  logistic: 'logistic', delivery: 'delivery', dispatch: 'dispatch', driver: 'driver',
  vehicle: 'vehicle', transporter: 'transporter', user: 'user', barcodeitem: 'barcodeLabel',
};

/* Pages whose folder name maps to a collection for their [id] */
const PAGE_SAMPLE = {
  grc: 'grc', grt: 'grt', invoice: 'purchaseinvoice', debitnote: 'debitnote',
  pos: 'posinvoice', 'pos-return': 'posreturn', salesinvoice: 'salesinvoice',
  salereturn: 'salesreturn', deliverychallan: 'deliverychallan', creditnote: 'creditnote',
  transfer: 'stocktransfer', transferstocklocation: 'stocktransferlocation',
  transferstockpacket: 'stocktransferpacket', 'stock-adjustment': 'stockadjustment',
  companylocations: 'companylocation', 'contact-type': 'contacttype', citygroup: 'citygroup',
  docsetup: 'docsetup', ledgergroups: 'ledgergroup', paymentmethod: 'paymentmethod',
  poscounter: 'poscounter', filter: 'productfilter', group: 'productgroup',
  charge: 'purchasecharge', purchasegroup: 'purchasegroup', term: 'purchaseterm',
  stockpoint: 'stockpoint', barcodesetting: 'barcodesetting', users: 'user',
  'split-barcode-setting': 'splitbarcodesetting', 'attribute-addon': 'attributeaddon',
  route: 'transportroute', salesinvoice_ic: 'icsalesinvoice', customer: 'contact',
  supplier: 'contact', agent: 'contact', item: 'item', uom: 'uom', hsn: 'hsn',
  tax: 'tax', ledger: 'ledger', business: 'business', vehicle: 'vehicle',
  driver: 'driver', transporter: 'transporter', dispatch: 'dispatch', logistic: 'logistic',
  'barcode-print': 'grc', 'barcode-generation': 'grc', print: 'grc', view: 'posinvoice',
  payment: 'posinvoice', challan: 'stocktransfer',
};

let cookie = '';
const results = { pass: 0, fail: 0, skip: 0, failures: [], slow: [] };

function walk(dir, base = '') {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    out.push(...walk(full, base + '/' + entry));
    if (existsSync(join(full, 'page.jsx')) || existsSync(join(full, 'page.js'))) out.push(base + '/' + entry);
    if (existsSync(join(full, 'route.js'))) out.push(base + '/' + entry);
  }
  return out;
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  /* a throwaway administrator, so every screen is reachable */
  const salt = crypto.randomBytes(16).toString('hex');
  const pw = 'Smoke-' + crypto.randomBytes(6).toString('hex');
  const email = 'route-smoke@example.invalid';
  await db.collection('user').deleteOne({ email });
  await db.collection('user').insertOne({
    name: 'Route Smoke', email,
    password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
    role: 'Super Admin', isActive: true, createdAt: new Date(), updatedAt: new Date(),
  });
  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: pw }),
  });
  cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) { console.error('could not sign in - is the server running on ' + BASE + '?'); process.exit(1); }

  /* scope, appended to every request the way the app does */
  const biz = await db.collection('business').findOne({ isMainBranch: true })
    || await db.collection('business').findOne({});
  const loc = await db.collection('companylocation').findOne({ businessId: biz?._id })
    || await db.collection('companylocation').findOne({});
  const scope = `business=${biz?._id || ''}&location=${loc?._id || ''}&finYear=2026-2027`;

  const sampleCache = new Map();
  const sampleId = async (name) => {
    const coll = SAMPLE[name] || PAGE_SAMPLE[name];
    if (!coll) return null;
    if (sampleCache.has(coll)) return sampleCache.get(coll);
    const doc = await db.collection(coll).findOne({});
    const id = doc ? String(doc._id) : null;
    sampleCache.set(coll, id);
    return id;
  };

  /* /api/barcode/<code> is addressed by the barcode NUMBER, not an id */
  let sampleBarcode = null;
  const barcodeNo = async () => {
    if (sampleBarcode === null) {
      const b = await db.collection('barcodeLabel').findOne({ barcodeNo: { $nin: [null, ''] } });
      sampleBarcode = b?.barcodeNo || false;
    }
    return sampleBarcode || null;
  };

  /* fill every [segment] from the nearest named ancestor */
  const resolve = async (path) => {
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i += 1) {
      if (!parts[i].startsWith('[')) continue;
      if (parts[i].startsWith('[...')) return null;          // catch-all, skip

      if (parts[i] === '[code]') {
        const code = await barcodeNo();
        if (!code) return null;
        parts[i] = encodeURIComponent(code);
        continue;
      }

      let id = null;
      for (let j = i - 1; j >= 0 && !id; j -= 1) id = await sampleId(parts[j]);
      if (!id) return null;
      parts[i] = id;
    }
    return parts.join('/');
  };

  const hit = async (url, label) => {
    const t0 = Date.now();
    try {
      const res = await fetch(BASE + url, { headers: { Cookie: cookie }, redirect: 'manual' });
      const ms = Date.now() - t0;
      if (ms > 4000) results.slow.push({ url, ms });
      if (res.status >= 500) {
        results.fail += 1;
        results.failures.push({ url, status: res.status });
        console.log(`  ${res.status}  ${label}   <-- FAIL`);
      } else {
        results.pass += 1;
      }
    } catch (e) {
      results.fail += 1;
      results.failures.push({ url, status: 'ERR', message: e.message });
      console.log(`  ERR  ${label}   <-- ${e.message}`);
    }
  };

  /* --------------------------------------------------------------- pages */
  const pages = [...new Set(walk('app/admin', '/admin'))]
    .filter((p) => !p.includes('[...'))
    .sort();
  console.log(`\n=== ${pages.length} admin pages ===`);
  for (const p of pages) {
    const url = await resolve(p);
    if (!url) { results.skip += 1; console.log(`  SKIP ${p}  (no sample record)`); continue; }
    await hit(url, p);
  }

  /* ---------------------------------------------------------------- api */
  const apis = [...new Set(walk('app/api', '/api'))]
    .filter((p) => !p.includes('[...') && !p.includes('/auth/'))
    .sort();
  console.log(`\n=== ${apis.length} API routes (GET) ===`);
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  for (const p of apis) {
    const url = await resolve(p);
    if (!url) { results.skip += 1; console.log(`  SKIP ${p}  (no sample record)`); continue; }
    /* reports need a window, and the options endpoint needs a ref */
    const extra = p.startsWith('/api/reports/') ? `&fromDate=${monthAgo}&toDate=${today}`
      : p === '/api/options' ? '&ref=item'
        : p === '/api/barcode/scan' ? '' : '';
    await hit(`${url}?${scope}${extra}`, p);
  }

  await db.collection('user').deleteOne({ email });

  console.log(`\n================  ${results.pass} ok, ${results.fail} failed, ${results.skip} skipped  ================`);
  if (results.slow.length) {
    console.log('\nslow (>4s):');
    results.slow.sort((a, b) => b.ms - a.ms).slice(0, 10)
      .forEach((s) => console.log(`  ${String(s.ms).padStart(6)}ms  ${s.url}`));
  }
  if (results.failures.length) {
    console.log('\nfailures:');
    results.failures.forEach((f) => console.log(`  ${f.status}  ${f.url}  ${f.message || ''}`));
  }
  await mongoose.disconnect();
  process.exit(results.fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
