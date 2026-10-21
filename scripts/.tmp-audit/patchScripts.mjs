/* One-shot patcher: route the scripts' raw contact-collection access through
   lib/contactStorage.js. Asserts every change it makes. */
import fs from 'node:fs';

const IMPORT = "import { contactCollection } from '../lib/contactStorage.js';";

function load(p) { return fs.readFileSync(p, 'utf8'); }
function save(p, s) { fs.writeFileSync(p, s); }
function addImport(s, p) {
  if (s.includes(IMPORT)) return s;
  const anchor = "import mongoose from 'mongoose';";
  if (!s.includes(anchor)) throw new Error(p + ': no mongoose import to anchor on');
  return s.replace(anchor, anchor + '\n' + IMPORT);
}
function replaceExact(s, p, from, to, expected) {
  const n = s.split(from).length - 1;
  if (expected !== undefined && n !== expected) throw new Error(`${p}: expected ${expected} x ${JSON.stringify(from)}, found ${n}`);
  if (n === 0) throw new Error(`${p}: ${JSON.stringify(from)} not found`);
  return s.split(from).join(to);
}
/* handle.method({ contactKind: 'X' ...  ->  db.collection(contactCollection('X')).method({ contactKind: 'X' ... */
function perKindCalls(s, handle, dbExpr) {
  const rx = new RegExp('\\b' + handle + '\\.(\\w+)\\(\\{\\s*contactKind:\\s*\'(Supplier|Customer|Agent)\'', 'g');
  let n = 0;
  const out = s.replace(rx, (_m, method, kind) => { n += 1; return `${dbExpr}.collection(contactCollection('${kind}')).${method}({ contactKind: '${kind}'`; });
  return { out, n };
}
function assertNoRawContact(s, p) {
  const code = s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  if (/collection\(\s*['"]contact['"]\s*\)/.test(code)) throw new Error(p + ': raw contact collection access left');
}

const report = [];

/* ---- single-kind scripts: the one handle becomes the kind's collection */
for (const [p, kind, count] of [
  ['scripts/replaceSuppliersFromExcel.mjs', 'Supplier', 1],
  ['scripts/replaceAgentsFromExcel.mjs', 'Agent', 1],
  ['scripts/seedSuppliersNew.mjs', 'Supplier', 1],
  ['scripts/restateGrcBarcodes.mjs', 'Supplier', 1],
  ['scripts/testBarcodePreserve.mjs', 'Supplier', 4],
  ['scripts/testItemsSheetUi.mjs', 'Supplier', 2],
  ['scripts/testLrLabel.mjs', 'Supplier', 1],
  ['scripts/testGrcPipeline.mjs', 'Supplier', 3],
]) {
  let s = load(p);
  s = addImport(s, p);
  s = replaceExact(s, p, "db.collection('contact')", `db.collection(contactCollection('${kind}'))`, count);
  assertNoRawContact(s, p);
  save(p, s);
  report.push(`${p}: ${count} site(s) -> ${kind}`);
}

/* ---- seedCustomersFromExcel: counts all three kinds, writes customers */
{
  const p = 'scripts/seedCustomersFromExcel.mjs';
  let s = load(p);
  s = addImport(s, p);
  const { out, n } = perKindCalls(s, 'contact', 'db');
  s = out;
  s = replaceExact(s, p, "const contact = db.collection('contact');", "/* the customer collection; the before/after counts read each kind from its own */\nconst contact = db.collection(contactCollection('Customer'));", 1);
  assertNoRawContact(s, p);
  save(p, s);
  report.push(`${p}: ${n} per-kind call(s), default handle -> Customer`);
}

/* ---- testAgentImport: agents, with customer/supplier "untouched" counts */
{
  const p = 'scripts/testAgentImport.mjs';
  let s = load(p);
  s = addImport(s, p);
  const { out, n } = perKindCalls(s, 'contacts', 'db');
  s = out;
  s = replaceExact(s, p, "const contacts = db.collection('contact');", "const contacts = db.collection(contactCollection('Agent'));", 1);
  assertNoRawContact(s, p);
  save(p, s);
  report.push(`${p}: ${n} per-kind call(s), default handle -> Agent`);
}

/* ---- testSupplierImport: suppliers, with customer/agent counts and a
        "three kinds still exist" check that has to span collections */
{
  const p = 'scripts/testSupplierImport.mjs';
  let s = load(p);
  s = addImport(s, p);
  s = replaceExact(s, p,
    "  (await contacts.distinct('contactKind')).length === 3);",
    "  (await Promise.all(['Supplier', 'Customer', 'Agent'].map((k) => db.collection(contactCollection(k)).countDocuments({ contactKind: k }, { limit: 1 })))).every(Boolean));",
    1);
  const { out, n } = perKindCalls(s, 'contacts', 'db');
  s = out;
  s = replaceExact(s, p, "const contacts = db.collection('contact');", "const contacts = db.collection(contactCollection('Supplier'));", 1);
  assertNoRawContact(s, p);
  save(p, s);
  report.push(`${p}: ${n} per-kind call(s), distinct-kinds check spans collections, default handle -> Supplier`);
}

/* ---- ensureSupplierGstIndex: the index belongs on whichever collection
        holds suppliers, with that collection's own spec */
{
  const p = 'scripts/ensureSupplierGstIndex.mjs';
  let s = load(p);
  s = replaceExact(s, p,
    "const { SUPPLIER_GST_INDEX } = await import('../models/Contact.js');",
    "/* The spec of the collection suppliers live in right now: models/Contact.js\n   (partial on contactKind) while they share `contact`, models/Supplier.js once\n   they have a collection of their own - see lib/contactStorage.js. */\nconst { contactCollection, isSplitContactStorage } = await import('../lib/contactStorage.js');\nconst SUPPLIER_COLLECTION = contactCollection('Supplier');\nconst { SUPPLIER_GST_INDEX } = await import(isSplitContactStorage() ? '../models/Supplier.js' : '../models/Contact.js');",
    1);
  s = replaceExact(s, p, "mongoose.connection.db.collection('contact')", 'mongoose.connection.db.collection(SUPPLIER_COLLECTION)', 1);
  s = replaceExact(s, p, "  console.log(`collection : contact`);", '  console.log(`collection : ${SUPPLIER_COLLECTION}`);', 1);
  s = replaceExact(s, p, "  console.log(`\\nindexes on contact now (${before.length}):`);", '  console.log(`\\nindexes on ${SUPPLIER_COLLECTION} now (${before.length}):`);', 1);
  s = replaceExact(s, p, "    console.log('\\nNo duplicates. With --apply this would be created on contact:');", "    console.log('\\nNo duplicates. With --apply this would be created on ' + SUPPLIER_COLLECTION + ':');", 1);
  assertNoRawContact(s, p);
  save(p, s);
  report.push(`${p}: collection + index spec follow the switch`);
}

/* ---- smokeAllRoutes: [id] samples for the three contact screens */
{
  const p = 'scripts/smokeAllRoutes.mjs';
  let s = load(p);
  s = addImport(s, p);
  s = replaceExact(s, p,
    "  customer: 'contact', supplier: 'contact', agent: 'contact', item: 'item', uom: 'uom',",
    "  customer: contactCollection('Customer'), supplier: contactCollection('Supplier'), agent: contactCollection('Agent'), item: 'item', uom: 'uom',",
    1);
  s = replaceExact(s, p,
    "  route: 'transportroute', salesinvoice_ic: 'icsalesinvoice', customer: 'contact',\n  supplier: 'contact', agent: 'contact', item: 'item', uom: 'uom', hsn: 'hsn',",
    "  route: 'transportroute', salesinvoice_ic: 'icsalesinvoice', customer: contactCollection('Customer'),\n  supplier: contactCollection('Supplier'), agent: contactCollection('Agent'), item: 'item', uom: 'uom', hsn: 'hsn',",
    1);
  save(p, s);
  report.push(`${p}: contact sample collections follow the switch`);
}

console.log(report.join('\n'));
