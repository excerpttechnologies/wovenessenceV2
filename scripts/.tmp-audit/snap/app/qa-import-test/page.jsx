'use client';
/* TEMPORARY QA HARNESS - delete after verifying the Excel re-import fix.
   Renders the REAL GCRBarcodeGeneration with database-shaped rows, stubs every
   API it calls (nothing reaches the database - the save POST is captured, not
   sent), feeds it real .xlsx files and records what happens. */
import { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import { ScopeProvider } from '@/components/ScopeContext';
import GCRBarcodeGeneration from '@/components/GCRBarcodeGeneration';

const base = { hsn: '54078470', gst: '5', qty: '1', uom: 'PC', billSlNo: '1', batchUnique: 'unique', status: 'IN_STOCK' };
const INITIAL = [
  { ...base, _id: 'u1', itemCode: '4-OTH', itemName: '4-OTH', supplierDescription: '4-OTH', printDescription: '4-OTH', purRate: '200', finalNet: '200', encodedPurRate: 'BJJ', retailPrice: '400.00', offerPrice: '400.00', wspPrice: '230.00', dpPrice: '300.00', barcodeGenerated: '9A0005', barcodeNo: '9A0005', p_m_f: '' },
  { ...base, _id: 'u2', itemCode: '4-OTH', itemName: '4-OTH', supplierDescription: '4-OTH', printDescription: '4-OTH', purRate: '200', finalNet: '200', encodedPurRate: 'BJJ', retailPrice: '400.00', offerPrice: '400.00', wspPrice: '230.00', dpPrice: '300.00', barcodeGenerated: '9A0004', barcodeNo: '9A0004', p_m_f: '' },
  { ...base, _id: 'u3', itemCode: 'LB-O', itemName: 'LB-O', supplierDescription: 'LB-O', printDescription: 'LB-O', purRate: '150', finalNet: '150', encodedPurRate: 'AEJ', retailPrice: '300.00', offerPrice: '', wspPrice: '180.00', dpPrice: '', barcodeGenerated: '9A0002', barcodeNo: '9A0002', p_m_f: 'P' },
];

const HEADERS_NEW = [
  ['itemCode', 'Item Code'], ['itemName', 'Item Name'], ['goodsType', 'Attribute Add On'], ['sm', 'SM'], ['p_m_f', 'P-M-F'],
  ['hsn', 'HSN'], ['gst', 'GST'], ['uom', 'UOM'], ['qty', 'Quantity'], ['noOfCuts', 'No. of Cuts'], ['totalMtr', 'Total MTR'],
  ['billSlNo', 'Serial No'], ['purchaseRate', 'Purchase Rate'], ['discountType', 'Discount Type'], ['discount', 'Discount'],
  ['finalPrice', 'Final Price'], ['retailPrice', 'Retail Price'], ['disc1', 'Disc 1'], ['uniqueBarcode', 'Unique Barcode'],
  ['barcodeNo', 'Barcode No'], ['supplierDescription', 'Supplier Description'], ['printDescription', 'Print Description'],
  ['rsp', 'RSP'], ['wsp', 'WSP'], ['dp', 'E-COMM'], ['offerPrice', 'Offer Price'], ['wspPrice', 'WSP Offer Price'],
  ['dpPrice', 'E-COMM Offer Price'], ['rspOfferPct', 'RSP Offer %'], ['wspOfferPct', 'WSP Offer %'], ['dpOfferPct', 'E-COMM Offer %'],
  ['markupRSP', 'Markup RSP %'], ['markupWSP', 'Markup WSP %'], ['markupDP', 'Markup E-COMM %'],
];
// what Export Excel wrote BEFORE this fix: no SM / P-M-F columns
const HEADERS_OLD = HEADERS_NEW.filter(([k]) => k !== 'sm' && k !== 'p_m_f');

// a grid row as Export Excel writes it (the grid's normalised names)
const exported = (r) => ({
  itemCode: r.itemCode, itemName: r.itemName, goodsType: '', sm: '', p_m_f: r.p_m_f, hsn: r.hsn, gst: r.gst, uom: r.uom,
  qty: r.qty, noOfCuts: '', totalMtr: '', billSlNo: r.billSlNo, purchaseRate: r.purRate, discountType: '', discount: '',
  finalPrice: r.finalNet, retailPrice: r.retailPrice, disc1: '', uniqueBarcode: 'Yes', barcodeNo: r.barcodeGenerated,
  supplierDescription: r.supplierDescription, printDescription: r.printDescription, rsp: r.retailPrice, wsp: r.wspPrice,
  dp: r.dpPrice, offerPrice: r.offerPrice, wspPrice: r.wspPrice, dpPrice: r.dpPrice,
});

const MAPPING = { 1: 'A', 2: 'B', 3: 'C', 4: 'D', 5: 'E', 6: 'F', 7: 'G', 8: 'H', 9: 'I', 0: 'J' };

if (typeof window !== 'undefined' && !window.__qaStubbed) {
  window.__qaStubbed = true;
  window.__qaPosts = [];
  window.__qaReserve = 0;
  const reply = (data, status = 200) => Promise.resolve(new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }));
  window.fetch = async (input, init = {}) => {
    const url = String(typeof input === 'string' ? input : input.url);
    const method = (init.method || 'GET').toUpperCase();
    if (url.startsWith('/api/auth/me')) return reply({ user: { name: 'qa' } });
    if (url.includes('ref=business')) return reply({ options: [{ value: 'b1', label: 'QA', isDefault: true }] });
    if (url.includes('ref=companylocations')) return reply({ options: [{ value: 'l1', label: 'QA LOC' }] });
    if (url.startsWith('/api/purchase-rate-code')) return reply({ doc: { isActive: true, digitMappings: MAPPING } });
    if (url.startsWith('/api/barcode-generation/reserve')) {
      const body = JSON.parse(init.body || '{}');
      const n = Number(body.qty) || 0;
      return reply({ rows: Array.from({ length: n }, () => ({ barcodeNo: 'QA' + String(++window.__qaReserve).padStart(4, '0') })) });
    }
    if (url.startsWith('/api/barcode-generation') && method === 'POST') {
      window.__qaPosts.push(JSON.parse(init.body || '{}'));
      return reply({ ok: true });
    }
    return reply({ rows: [], options: [], items: [], data: [], doc: null });
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await sleep(60);
  }
  return null;
}
const text = (sel) => document.querySelector(sel)?.parentElement?.querySelector('span')?.textContent?.trim() || '';
const banner = () => text('[aria-label="Dismiss import message"]');
const saveError = () => text('[aria-label="Dismiss save error"]');
const buttons = () => [...document.querySelectorAll('button')];

async function dismissAll() {
  document.querySelector('[aria-label="Dismiss import message"]')?.click();
  document.querySelector('[aria-label="Dismiss save error"]')?.click();
  await waitFor(() => !banner() && !saveError(), 3000);
}

async function upload(headers, objs, name = 'barcode-items-template.xlsx') {
  await dismissAll();
  const aoa = [headers.map(([, label]) => label), ...objs.map((o) => headers.map(([k]) => o[k] ?? ''))];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Barcode Items');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  const file = new File([buf], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const input = document.querySelector('input[type="file"]');
  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  return (await waitFor(banner)) || 'NO MESSAGE';
}

async function submit() {
  await dismissAll();
  const before = window.__qaPosts.length;
  buttons().find((b) => b.textContent.trim() === 'Submit' && b.className.includes('bg-green-600'))?.click();
  const confirm = await waitFor(() => buttons().find((b) => b.textContent.trim() === 'Submit' && b.className.includes('bg-blue-600')));
  confirm?.click();
  await waitFor(() => window.__qaPosts.length > before || saveError(), 8000);
  await sleep(200);
  const post = window.__qaPosts.length > before ? window.__qaPosts[window.__qaPosts.length - 1] : null;
  const pick = ['barcodeNo', 'itemCode', 'p_m_f', 'qty', 'purchaseRate', 'purRate', 'finalPrice', 'finalNet', 'encodedPurchaseRate', 'encodedPurRate', 'rsp', 'retailPrice', 'offerPrice', 'wsp', 'wspPrice', 'dp', 'dpPrice'];
  return {
    posted: Boolean(post),
    error: saveError(),
    rows: post ? post.rows.map((r) => Object.fromEntries(pick.map((k) => [k, r[k] ?? null]))) : null,
  };
}

async function withBarcodeTable() {
  buttons().find((b) => b.textContent.trim() === 'ITEM WITH BARCODE')?.click();
  const table = await waitFor(() => [...document.querySelectorAll('table')].find((t) => t.textContent.includes('E-COMM')), 4000);
  if (!table) return null;
  return [...table.querySelectorAll('tbody tr')].map((tr) => {
    const c = [...tr.querySelectorAll('td')].map((td) => td.textContent.trim());
    return { item: c[1], purchase: c[4], final: c[6], rsp: c[10], wsp: c[11], ecomm: c[12] };
  });
}

async function run(setStatus) {
  const out = {};
  await waitFor(() => document.querySelector('input[type="file"]'), 20000);
  await sleep(1500); // rate-code mapping and scope settle
  out.accept = document.querySelector('input[type="file"]').getAttribute('accept');
  const [u1, u2, u3] = INITIAL;

  setStatus('A');
  // A: file exported BEFORE the fix (no P-M-F column); RSP typed with a thousands separator
  out.A_import = await upload(HEADERS_OLD, [{ ...exported(u1), rsp: '2,100' }, exported(u2), exported(u3)]);
  out.A_table = await withBarcodeTable();
  out.A_submit = await submit();

  setStatus('B');
  // B: new template with P-M-F filled; WSP / E-COMM / Purchase Rate / Final Price edited; one new row
  out.B_import = await upload(HEADERS_NEW, [
    { ...exported(u1), rsp: '2100', retailPrice: '2100', p_m_f: 'P', dp: '1500' },
    { ...exported(u2), p_m_f: 'M', wsp: '1300' },
    { ...exported(u3), purchaseRate: '1,234', finalPrice: '1300' },
    { itemCode: 'NEW-ITEM', itemName: 'NEW-ITEM', p_m_f: 'F', uom: 'PC', qty: '1', uniqueBarcode: 'Yes', purchaseRate: '500', rsp: '999', billSlNo: '9' },
  ]);
  out.B_table = await withBarcodeTable();
  out.B_submit = await submit();

  setStatus('C');
  // C: the SAME file name imported again after another edit - must update, not duplicate
  out.C_import = await upload(HEADERS_NEW, [{ ...exported(u1), rsp: '2200', retailPrice: '2100', p_m_f: 'P', dp: '1500' }]);
  out.C_submit = await submit();

  setStatus('D');
  // D: a sheet carrying only Barcode No and the price being changed
  out.D_import = await upload([['barcodeNo', 'Barcode No'], ['rsp', 'RSP']], [{ barcodeNo: '9A0004', rsp: '777' }]);
  out.D_submit = await submit();

  setStatus('E');
  // E: the same barcode twice, and a price that is not a number
  out.E_import = await upload([['barcodeNo', 'Barcode No'], ['rsp', 'RSP'], ['wsp', 'WSP']], [
    { barcodeNo: '9A0005', rsp: '1' }, { barcodeNo: '9A0005', rsp: '2' }, { barcodeNo: '9A0002', wsp: 'abc' },
  ]);
  out.E_submit_rows = (await submit()).rows?.length ?? null;

  setStatus('F');
  // F: the operator's real workflow - one column of each pair edited, its
  // duplicate left as exported (stale). Imported twice: the second import of
  // the SAME sheet must change nothing.
  const staleSheet = [{ ...exported(u1), p_m_f: 'P', rsp: '2500', retailPrice: '400.00', wsp: '999', wspPrice: '230.00', dp: '1600', dpPrice: '300.00' }];
  out.F_import1 = await upload(HEADERS_NEW, staleSheet);
  out.F_table1 = (await withBarcodeTable())?.[0];
  out.F_import2 = await upload(HEADERS_NEW, staleSheet);
  out.F_table2 = (await withBarcodeTable())?.[0];

  setStatus('G');
  // G: only the offer-price column filled (WSP left empty); offer % on E-COMM
  out.G_import = await upload(
    [['barcodeNo', 'Barcode No'], ['wsp', 'WSP'], ['wspPrice', 'WSP Offer Price'], ['dp', 'E-COMM'], ['dpOfferPct', 'E-COMM Offer %'], ['sm', 'SM'], ['p_m_f', 'P-M-F']],
    [{ barcodeNo: '9A0004', wsp: '', wspPrice: '555', dp: '1000', dpOfferPct: '10', sm: '12', p_m_f: 'MIX' }],
  );
  const g = await submit();
  out.G_row = g.rows?.find((r) => r.barcodeNo === '9A0004');
  out.G_sm = window.__qaPosts[window.__qaPosts.length - 1]?.rows?.find((r) => r.barcodeNo === '9A0004')?.sm;
  out.F_saved = g.rows?.find((r) => r.barcodeNo === '9A0005');

  setStatus('done');
  return out;
}

export default function QaImportTest() {
  const [status, setStatus] = useState('start');
  const [result, setResult] = useState('');
  useEffect(() => {
    run(setStatus).then((r) => setResult(JSON.stringify(r))).catch((e) => setResult(JSON.stringify({ fatal: String(e && e.stack || e) })));
  }, []);
  return (
    <ScopeProvider>
      <pre id="qa-status">{status}</pre>
      <pre id="qa-result" style={{ display: 'none' }}>{result}</pre>
      <GCRBarcodeGeneration grcId="grc-qa" initialRows={INITIAL} supplierMarkup={{}} grcHeader={{ grcNumber: '05162', supplierName: 'QA' }} />
    </ScopeProvider>
  );
}
