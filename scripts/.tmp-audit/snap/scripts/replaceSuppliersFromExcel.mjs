/* Replace the supplier master from supplier_full_scrape.xlsx.

   THE CENTRAL DECISION: UPSERT BY CONTACT ID, NOT DELETE-AND-REINSERT.

   A blind "delete all 824, insert 250" would issue new _ids, and every
   historical document pointing at a supplier would be left pointing at
   nothing. There are two kinds of pointer in this database and both matter:

     66 suppliers are referenced BY OBJECTID   (grc, delivery, purchaseinvoice,
                                                and 565 barcodeLabel rows)
     281 supplier CODES are referenced AS TEXT (4,707 barcodeLabel rows whose
                                                supplierId holds "G1030", not
                                                an ObjectId - pre-existing)

   Matching the workbook to the database on contactId and updating in place
   keeps both kinds intact: the _id never changes, and neither does the code.
   248 of the workbook's 250 suppliers already exist, so this is an update of
   almost the whole set rather than a re-creation of it.

   THE SUPPLIERS THE WORKBOOK DOES NOT MENTION

   576 database suppliers are absent from the workbook. --replace removes
   them, EXCEPT any that a transaction still points at: deleting those would
   corrupt history, which section 4 and section 22 of the brief forbid. They
   are retained and listed instead, so the choice is visible rather than made
   silently.

   THE "Type (n)" COLUMNS ARE NOT POSITIONALLY STABLE.

   The scrape dumped each supplier's optional fields into an unnamed overflow,
   so the same column holds a state on one row, a city on the next and a zip
   on a third. Reading them by position would scatter phone numbers into
   address fields. They are therefore classified BY VALUE - an @ is an email,
   six digits is a PIN, ten digits starting 6-9 is a mobile, a known state
   name is a state - and anything that cannot be identified is put in remarks
   rather than guessed into a field. Only 13 of 322 rows carry this overflow,
   and every one is printed in the dry run for eyeballing.

   The reliably-named columns (contact id, business name, mobile, email, GST,
   business type, and the whole Purchase/Financial block) are read by header
   name as normal.

   SAFE BY DEFAULT - reports and exits.

     npm run suppliers:import              dry run
     npm run suppliers:import:apply        upsert only, deletes nothing
     npm run suppliers:replace             dry run of the destructive form
     npm run suppliers:replace:apply       upsert AND remove unreferenced extras

   Every run backs up the full supplier set to a timestamped JSON file before
   touching anything. The workbook is only ever read.
*/

import path from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import mongoose from 'mongoose';
import XLSX from 'xlsx';

const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');
const ROOT = process.cwd();
const EXCEL_PATH = process.env.SUPPLIER_EXCEL_PATH || path.join(ROOT, 'supplier_full_scrape.xlsx');
const BACKUP_DIR = path.join(ROOT, 'backups');

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI is not set. Run with --env-file=.env'); process.exit(1); }

const T = (v) => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));

/* Values that mean "nothing was entered". Cleared rather than stored, so a
   supplier with no email has an empty email and not the word "NA". */
const NULLISH = new Set(['', '-', '--', 'n/a', 'na', 'null', 'undefined', 'nil', 'none']);
const clean = (v) => { const s = T(v); return NULLISH.has(s.toLowerCase()) ? '' : s; };

const report = {
  startedAt: new Date().toISOString(),
  mode: APPLY ? (REPLACE ? 'apply+replace' : 'apply') : (REPLACE ? 'dry-run(replace)' : 'dry-run'),
  excel: { rows: 0, valid: 0, skipped: [], duplicates: [] },
  before: { total: 0 },
  matched: 0, inserted: 0, updated: 0,
  extras: { total: 0, deletable: 0, retained: [], deleted: 0 },
  overflow: { rowsWithDetail: 0, classified: [] },
  after: { total: 0 },
  backupFile: '',
  errors: [], warnings: [],
};

/* --------------------------------------------------- value classification */

const INDIAN_STATES = ['andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
  'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala',
  'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha',
  'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh',
  'uttarakhand', 'west bengal', 'delhi', 'jammu and kashmir', 'ladakh', 'puducherry',
  'chandigarh', 'andaman and nicobar islands', 'dadra and nagar haveli', 'daman and diu', 'lakshadweep'];

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPin = (s) => /^\d{6}$/.test(s);
const isMobile = (s) => /^[6-9]\d{9}$/.test(s.replace(/[\s-]/g, ''));
const isLandline = (s) => /^0?\d{2,5}[\s-]?\d{6,8}$/.test(s.replace(/[\s-]/g, ' ').trim()) && !isMobile(s);
const isPrefix = (s) => /^(mr|mrs|ms|dr|m\/s)\.?$/i.test(s);
const isCountry = (s) => /^(india|bharat)$/i.test(s);
const isState = (s) => INDIAN_STATES.includes(s.toLowerCase());

/* Values that are schema ENUMS, not place names. Without this list "Male"
   and "Yes" land in the city field, because they pass every shape test a
   city would. */
const ENUM_TOKENS = new Set(['yes', 'no', 'male', 'female', 'other', 'registered',
  'un-registered', 'unregistered', 'business', 'individual', 'supplier', 'customer',
  'agent', 'regular', 'composition', 'consumer', 'to pay', 'paid']);

/* Assigns each overflow value to a field by WHAT IT IS.

   Deliberately conservative: anything the tests do not recognise is collected
   into `unclassified` and stored in remarks, never forced into an address or
   a phone field. A wrong phone number is worse than a missing one.

   `cityMaster` is the seeded cities collection - a real lookup beats a guess,
   though it holds only ~21 rows, so a shape test backs it up for the many
   towns it does not list. */
function classifyOverflow(values, businessName, cityMaster) {
  const out = {
    prefix: '', state: '', country: '', zip: '', city: '',
    mobiles: [], landlines: [], emails: [], addresses: [], unclassified: [],
  };
  for (const raw of values) {
    const v = clean(raw);
    if (!v) continue;
    /* the business name is repeated in the overflow on some rows - drop it
       rather than storing it as an address line */
    if (businessName && v.toLowerCase() === businessName.toLowerCase()) continue;
    if (isPrefix(v)) { out.prefix = out.prefix || v; continue; }
    if (isEmail(v)) { out.emails.push(v); continue; }
    if (isCountry(v)) { out.country = out.country || v; continue; }
    if (isState(v)) { out.state = out.state || v; continue; }
    if (isPin(v)) { out.zip = out.zip || v; continue; }
    if (isMobile(v)) { out.mobiles.push(v.replace(/[\s-]/g, '')); continue; }
    if (isLandline(v)) { out.landlines.push(v); continue; }

    /* a schema enum that merely looks like a place - never a city */
    if (ENUM_TOKENS.has(v.toLowerCase())) { out.unclassified.push(v); continue; }

    /* A city ONLY if the city master says so.

       A shape test was tried here and rejected: "MANGALDAS MARKET",
       "SP Mukherjee Marg" and "Madanpura" all pass for a city name and are
       in fact address lines. A wrong city is worse than a missing one - it
       corrupts every report that groups by city - so an unrecognised place
       name falls through and becomes an address line, which is where it
       reads correctly anyway. */
    if (!out.city && cityMaster.has(v.toLowerCase())) { out.city = v; continue; }

    /* long free text with letters reads as an address line; a short unknown
       token is left unclassified rather than guessed */
    if (v.length >= 8 && /[a-z]/i.test(v)) { out.addresses.push(v); continue; }
    out.unclassified.push(v);
  }
  return out;
}

/* ================================================================== main == */

async function main() {
  console.log(APPLY
    ? (REPLACE ? '=== APPLYING (upsert + remove unreferenced extras) ===' : '=== APPLYING (upsert only) ===')
    : (REPLACE ? '=== DRY RUN - REPLACE MODE (pass --apply to write) ===' : '=== DRY RUN (pass --apply to write) ==='));

  if (!existsSync(EXCEL_PATH)) { console.error('Workbook not found: ' + EXCEL_PATH); process.exit(1); }
  console.log('workbook :', EXCEL_PATH);

  /* ------------------------------------------------------- parse Excel -- */
  const wb = XLSX.readFile(EXCEL_PATH, { raw: true });
  const sheet = wb.SheetNames.find((n) => /supplier/i.test(n)) || wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null });
  const header = grid[0].map((h) => T(h));
  const rows = grid.slice(1);
  report.excel.rows = rows.length;
  console.log(`sheet    : "${sheet}"  ${rows.length} data rows, ${header.length} columns`);

  /* column index by exact header name - these are the reliable ones */
  const col = {};
  header.forEach((h, i) => { if (h && col[h] === undefined) col[h] = i; });
  const at = (r, name) => (col[name] === undefined ? '' : clean(r[col[name]]));

  /* the unnamed overflow: every "Basic Information - Type…" column */
  const overflowIdx = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^Basic Information - (Type|Allow Login)( \(\d+\))?$/.test(h))
    .map(({ i }) => i);

  /* the DB is opened before parsing so the city master can inform the
     overflow classifier */
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const contacts = db.collection('contact');
  const cityMaster = new Set(
    (await db.collection('cities').find({}).project({ name: 1 }).toArray().catch(() => []))
      .map((c) => T(c.name).toLowerCase()).filter(Boolean)
  );

  const parsed = [];
  const seenCode = new Map();

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const code = at(r, 'Contact ID (resolved)') || at(r, 'Contact ID');
    const name = at(r, 'Business Name');

    if (!code && !name) { report.excel.skipped.push({ row: rowNo, reason: 'blank row' }); return; }
    if (!code) { report.excel.skipped.push({ row: rowNo, name, reason: 'no Contact ID - cannot key the record' }); return; }
    if (!name) { report.excel.skipped.push({ row: rowNo, code, reason: 'no Business Name' }); return; }

    if (seenCode.has(code)) {
      report.excel.duplicates.push({ row: rowNo, code, name, firstSeenRow: seenCode.get(code) });
      return;                                    // keep the first, per section 11
    }
    seenCode.set(code, rowNo);

    const ov = classifyOverflow(overflowIdx.map((ix) => r[ix]), name, cityMaster);
    if (overflowIdx.some((ix) => clean(r[ix]))) {
      report.overflow.rowsWithDetail += 1;
      report.overflow.classified.push({ code, name, ...ov });
    }

    /* Mobile/email/address have named columns AND may appear in the overflow.
       The named column wins; the overflow only fills a gap. */
    const mobile = at(r, 'Mobile') || ov.mobiles[0] || '';
    const email = at(r, 'Email') || ov.emails[0] || '';
    const addr1 = at(r, 'Address') || ov.addresses[0] || '';
    const addr2 = ov.addresses.find((a) => a !== addr1) || '';

    parsed.push({
      rowNo,
      contactId: code,
      businessName: name,
      personName: at(r, 'Name'),
      prefix: ov.prefix || 'Mr.',
      businessType: at(r, 'Basic Information - Business Type'),
      gstNo: at(r, 'Basic Information - GST NO'),
      contactType2: at(r, 'Basic Information - Contact Type (2)'),
      sameAsBilling: at(r, 'Basic Information - Same as Billing Address'),

      billingAddressLine1: addr1,
      billingAddressLine2: addr2,
      billingCity: ov.city,
      billingState: ov.state,
      billingCountry: ov.country,
      billingZipCode: ov.zip,
      billingMobile: mobile,
      billingAlternateContactNumber: ov.mobiles.find((m) => m !== mobile) || '',
      billingLandline: ov.landlines[0] || '',
      billingEmail: email,
      billingEmail2: ov.emails.find((e) => e !== email) || '',

      markupPriceCalculation: at(r, 'Purchase Details - Markup Price Calculation'),
      discountType: at(r, 'Purchase Details - Discount Type'),
      discount: at(r, 'Purchase Details - Discount'),
      markUpOnCostRsp: at(r, 'Purchase Details - Mark Up on Cost RSP'),
      rspRoundOff: at(r, 'Purchase Details - RSP Round Off'),
      markUpOnCostWsp: at(r, 'Purchase Details - Mark Up on Cost WSP'),
      wspRoundOff: at(r, 'Purchase Details - WSP Round Off'),
      markUpOnCostDp: at(r, 'Purchase Details - Mark Up on Cost DP'),
      dpRoundOff: at(r, 'Purchase Details - Dp Round Off'),
      logisticsTerms: at(r, 'Purchase Details - Logistics Terms'),
      paymentWithinDays: at(r, 'Purchase Details - Payment within (Days)'),
      paymentDateType: at(r, 'Purchase Details - Payment Date Type'),

      supplierType: at(r, 'Financial Details - Supplier Type'),
      openingBalance: at(r, 'Financial Details - Opening Balance'),
      gstType: at(r, 'Financial Details - GST Type'),
      pan: at(r, 'Financial Details - PAN (ex: AAAAA1234A)'),
      bankAccountName: at(r, 'Financial Details - Supplier Name as Per Bank'),
      bankName: at(r, 'Financial Details - Bank Name'),
      accountNo: at(r, 'Financial Details - Account No.'),
      ifsc: at(r, 'Financial Details - IFSC'),
      allowProduction: at(r, 'Production Details - Allow Production'),

      remarks: ov.unclassified.length ? 'Unclassified from import: ' + ov.unclassified.join(' | ') : '',
    });
  });

  report.excel.valid = parsed.length;
  console.log(`parsed   : ${parsed.length} valid, ${report.excel.skipped.length} skipped, ${report.excel.duplicates.length} duplicate codes`);

  /* --------------------------------------------------------- database --- */
  const existing = await contacts.find({ contactKind: 'Supplier' }).toArray();
  report.before.total = existing.length;
  const byCode = new Map(existing.map((s) => [T(s.contactId).toUpperCase(), s]));
  console.log(`database : ${existing.length} existing suppliers`);

  /* scope: reuse whatever the existing suppliers already belong to, rather
     than picking a business - the master is not being re-homed */
  const businessId = existing.find((s) => s.businessId)?.businessId
    || (await db.collection('business').findOne({ isMainBranch: true }))?._id;

  /* the contact TYPE (typeId) is a master reference; reuse the one existing
     suppliers already point at rather than inventing a category */
  const typeId = existing.find((s) => s.typeId)?.typeId || null;

  /* ------------------------------------------------------- references --- */
  const referencedIds = new Set();
  for (const [c, f] of [['grc', 'supplierId'], ['delivery', 'supplierId'],
    ['barcodeLabel', 'supplierId'], ['purchaseinvoice', 'supplierId']]) {
    try {
      (await db.collection(c).distinct(f, { [f]: { $nin: [null, ''] } }))
        .forEach((v) => referencedIds.add(String(v)));
    } catch { /* collection absent in this install */ }
  }
  /* codes referenced as TEXT - the pre-existing barcodeLabel rows */
  const referencedCodes = new Set([...referencedIds].filter((v) => !mongoose.isValidObjectId(v)).map((v) => v.toUpperCase()));

  /* --------------------------------------------------------- backup ----- */
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `suppliers-before-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify(existing, null, 2));
  report.backupFile = backupFile;
  console.log(`backup   : ${existing.length} suppliers -> ${backupFile}`);

  /* --------------------------------------------------------- plan ------- */
  const toInsert = [];
  const toUpdate = [];
  parsed.forEach((p) => {
    const hit = byCode.get(p.contactId.toUpperCase());
    if (hit) { toUpdate.push({ p, existing: hit }); report.matched += 1; }
    else toInsert.push(p);
  });

  const excelCodes = new Set(parsed.map((p) => p.contactId.toUpperCase()));
  const extras = existing.filter((s) => !excelCodes.has(T(s.contactId).toUpperCase()));
  report.extras.total = extras.length;

  const retained = extras.filter((s) =>
    referencedIds.has(String(s._id)) || referencedCodes.has(T(s.contactId).toUpperCase()));
  const deletable = extras.filter((s) => !retained.includes(s));
  report.extras.deletable = deletable.length;
  report.extras.retained = retained.map((s) => ({ contactId: s.contactId, businessName: s.businessName }));

  printPlan(toUpdate, toInsert, extras, retained, deletable);

  if (!APPLY) {
    report.after.total = existing.length;
    writeReport();
    console.log('\nDry run complete - nothing was written.');
    await mongoose.disconnect();
    return;
  }

  /* --------------------------------------------------------- write ------ */
  for (const { p, existing: hit } of toUpdate) {
    await contacts.updateOne({ _id: hit._id }, { $set: docFrom(p, businessId, typeId, false) });
    report.updated += 1;
  }
  for (const p of toInsert) {
    await contacts.insertOne({
      ...docFrom(p, businessId, typeId, true),
      contactKind: 'Supplier', contactId: p.contactId,
      createdAt: new Date(), __v: 0,
    });
    report.inserted += 1;
  }
  if (REPLACE && deletable.length) {
    const res = await contacts.deleteMany({ _id: { $in: deletable.map((s) => s._id) } });
    report.extras.deleted = res.deletedCount;
  }

  report.after.total = await contacts.countDocuments({ contactKind: 'Supplier' });
  printCounts();
  writeReport();
  await mongoose.disconnect();
}

/* Only fields the workbook actually carries are written. An empty cell means
   "not supplied", so it is not used to blank out a value that already exists
   on a matched supplier - except on insert, where there is nothing to keep. */
function docFrom(p, businessId, typeId, isNew) {
  const d = { businessName: p.businessName, updatedAt: new Date() };
  const put = (k, v) => { if (v !== '' || isNew) d[k] = v; };

  put('businessType', p.businessType);
  put('gstNo', p.gstNo);
  put('contactType2', p.contactType2);
  put('prefix', p.prefix);
  put('sameAsBilling', p.sameAsBilling === 'Yes');

  /* A person's name goes in the name fields; the COMPANY name never does -
     section 14. The workbook's "Name" column is the contact person. */
  if (p.personName) {
    const parts = p.personName.split(' ').filter(Boolean);
    put('firstName', parts[0] || '');
    put('middleName', parts.length > 2 ? parts.slice(1, -1).join(' ') : '');
    put('lastName', parts.length > 1 ? parts[parts.length - 1] : '');
  } else if (isNew) {
    d.firstName = ''; d.middleName = ''; d.lastName = '';
  }

  ['billingAddressLine1', 'billingAddressLine2', 'billingCity', 'billingState', 'billingCountry',
    'billingZipCode', 'billingMobile', 'billingAlternateContactNumber', 'billingLandline',
    'billingEmail', 'billingEmail2', 'markupPriceCalculation', 'discountType', 'discount',
    'markUpOnCostRsp', 'rspRoundOff', 'markUpOnCostWsp', 'wspRoundOff', 'markUpOnCostDp',
    'dpRoundOff', 'logisticsTerms', 'paymentWithinDays', 'paymentDateType', 'supplierType',
    'openingBalance', 'gstType', 'pan', 'bankAccountName', 'bankName', 'accountNo', 'ifsc',
    'allowProduction', 'remarks'].forEach((k) => put(k, p[k]));

  if (isNew) { d.businessId = businessId; if (typeId) d.typeId = typeId; }
  return d;
}

/* ================================================================ output == */

function printPlan(toUpdate, toInsert, extras, retained, deletable) {
  console.log('\n======================== PLAN =========================');
  console.log(`update in place (keeps _id, keeps every reference) : ${toUpdate.length}`);
  console.log(`insert as new                                      : ${toInsert.length}`);
  toInsert.slice(0, 10).forEach((p) => console.log(`     + ${p.contactId}  ${p.businessName}`));
  console.log(`\nin the database but NOT in the workbook             : ${extras.length}`);
  console.log(`  safe to remove (nothing references them)          : ${deletable.length}`);
  console.log(`  RETAINED - a transaction still points at them     : ${retained.length}`);
  retained.slice(0, 10).forEach((s) => console.log(`     ! ${s.contactId}  ${s.businessName}`));
  if (retained.length > 10) console.log(`     ...and ${retained.length - 10} more`);
  if (!REPLACE && extras.length) {
    console.log('\n  (none will be removed - add --replace to delete the safe ones)');
  }

  console.log(`\nOVERFLOW COLUMNS CLASSIFIED BY VALUE  (${report.overflow.rowsWithDetail} rows carry them)`);
  console.log('  every one is printed so it can be checked by eye:');
  report.overflow.classified.forEach((c) => {
    const bits = [
      c.city && `city=${c.city}`, c.state && `state=${c.state}`, c.zip && `pin=${c.zip}`, c.country && `country=${c.country}`,
      c.mobiles.length && `mobile=${c.mobiles.join(',')}`,
      c.landlines.length && `landline=${c.landlines.join(',')}`,
      c.emails.length && `email=${c.emails.join(',')}`,
      c.addresses.length && `addr=${c.addresses.length}`,
      c.unclassified.length && `UNCLASSIFIED=${c.unclassified.join('|')}`,
    ].filter(Boolean).join('  ');
    console.log(`     ${c.code.padEnd(7)} ${c.name.slice(0, 26).padEnd(26)} ${bits}`);
  });

  if (report.excel.duplicates.length) {
    console.log(`\nDUPLICATE CONTACT IDS IN THE WORKBOOK: ${report.excel.duplicates.length} (first kept)`);
    report.excel.duplicates.slice(0, 6).forEach((d) => console.log(`     row ${d.row}: ${d.code} ${d.name} (first at row ${d.firstSeenRow})`));
  }
  if (report.excel.skipped.length) {
    console.log(`\nSKIPPED ROWS: ${report.excel.skipped.length}`);
    const why = report.excel.skipped.reduce((a, s) => (a[s.reason] = (a[s.reason] || 0) + 1, a), {});
    Object.entries(why).forEach(([r, n]) => console.log(`     ${n} x ${r}`));
  }
  console.log('=======================================================');
}

function printCounts() {
  const R = report;
  console.log('\n=================== IMPORT COMPLETED ==================');
  console.log(`suppliers before      : ${R.before.total}`);
  console.log(`updated in place      : ${R.updated}`);
  console.log(`inserted              : ${R.inserted}`);
  console.log(`removed (unreferenced): ${R.extras.deleted}`);
  console.log(`retained (referenced) : ${R.extras.retained.length}`);
  console.log(`suppliers after       : ${R.after.total}`);
  console.log('=======================================================');
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  const f = path.join(ROOT, 'supplier-import-report.json');
  writeFileSync(f, JSON.stringify(report, null, 2));
  console.log(`\nreport written: ${f}`);
  console.log(`backup       : ${report.backupFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
