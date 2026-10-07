/* Replace the agent master from agent_full_scrape.xlsx.

   AGENTS LIVE IN THE `contact` COLLECTION, keyed by contactKind: 'Agent' -
   the same collection as suppliers and customers. Every query here filters on
   that, because an unfiltered write would reach 15,440 customers and 442
   suppliers.

   THE "Type (n)" COLUMNS ARE RAGGED, AND THE NAME COLUMN IS THE ANSWER.

   The scrape dumped each agent's optional fields into unnamed overflow
   columns, and the sequence differs per row:

     AGENT8   Mr. | K R AGENCY | K R AGENCY | Karnataka | India | mobile
     AGENT7   Mr. | RATHAN | BANDHU | SURAT | Male | Karnataka | ... | India
     AGENT6   M/s | Mr. | SARV | SUBH | Male | Karnataka | ...

   So values are classified by WHAT THEY ARE - a known state is a state,
   Male/Female is a gender, ten digits is a mobile, Mr./M-s is a prefix - and
   whatever remains, in order, is the person's name.

   THAT CLASSIFICATION IS THEN CHECKED, not trusted: the leftover name parts
   are joined and compared against the workbook's own "Name" column. If they
   do not match, the row is reported rather than imported, because a name
   split wrongly puts a surname in the middle-name field and nobody notices.

   LINKING THE GRCs. 89 imported GRCs carry an agent NAME as text (the earlier
   GRC import had no agent master to point at). Where that text matches an
   imported agent exactly, grc.agentId is set - which is what fills the Agent
   column on the GRC list. Only exact matches, only where agentId is null.
   Pass --no-link to skip it.

   SAFE BY DEFAULT - reports and exits.

     npm run agents:import           dry run
     npm run agents:import:apply     upsert only, deletes nothing
     npm run agents:replace          dry run of the destructive form
     npm run agents:replace:apply    upsert AND remove agents not in the workbook

   Every run backs up the existing agents first. The workbook is only read.
*/

import path from 'path';
import { existsSync, writeFileSync, mkdirSync } from 'fs';
import mongoose from 'mongoose';
import XLSX from 'xlsx';

const APPLY = process.argv.includes('--apply');
const REPLACE = process.argv.includes('--replace');
const NO_LINK = process.argv.includes('--no-link');
const ROOT = process.cwd();
const EXCEL_PATH = process.env.AGENT_EXCEL_PATH
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads', 'agent_full_scrape.xlsx');
const BACKUP_DIR = path.join(ROOT, 'backups');

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI is not set. Run with --env-file=.env'); process.exit(1); }

const T = (v) => (v === null || v === undefined ? '' : String(v).trim().replace(/\s+/g, ' '));
const NULLISH = new Set(['', '-', '--', 'n/a', 'na', 'null', 'undefined', 'nil', 'none']);
const clean = (v) => { const s = T(v); return NULLISH.has(s.toLowerCase()) ? '' : s; };

const report = {
  startedAt: new Date().toISOString(),
  mode: APPLY ? (REPLACE ? 'apply+replace' : 'apply') : (REPLACE ? 'dry-run(replace)' : 'dry-run'),
  excel: { rows: 0, valid: 0, skipped: [], duplicates: [] },
  before: 0, inserted: 0, updated: 0,
  extras: { total: 0, deletable: 0, retained: [], deleted: 0 },
  nameCheck: { checked: 0, agreed: 0, mismatched: [] },
  parsed: [],
  grcLinked: 0, grcLinkable: [],
  after: 0, backupFile: '',
  errors: [], warnings: [],
};

const INDIAN_STATES = ['andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh',
  'goa', 'gujarat', 'haryana', 'himachal pradesh', 'jharkhand', 'karnataka', 'kerala',
  'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya', 'mizoram', 'nagaland', 'odisha',
  'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura', 'uttar pradesh',
  'uttarakhand', 'west bengal', 'delhi', 'jammu and kashmir', 'ladakh', 'puducherry', 'chandigarh'];

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPin = (s) => /^\d{6}$/.test(s);
const isPhone = (s) => /^\d{7,12}$/.test(s.replace(/[\s-]/g, ''));
const isPrefix = (s) => /^(mr|mrs|ms|dr|m\/s|m-s)\.?$/i.test(s);
const isGender = (s) => /^(male|female|other)$/i.test(s);
const isCountry = (s) => /^(india|bharat)$/i.test(s);
const isState = (s) => INDIAN_STATES.includes(s.toLowerCase());
const isYesNo = (s) => /^(yes|no|allow|deny|not allow)$/i.test(s);

/* Sorts the ragged overflow into fields by value. Anything left over, in the
   order it appeared, is the person's name - which is then verified against
   the workbook's Name column by the caller. */
function classify(values) {
  const out = { prefixes: [], gender: '', state: '', country: '', zip: '', phones: [], emails: [], flags: [], nameParts: [] };
  for (const raw of values) {
    const v = clean(raw);
    if (!v) continue;
    if (isPrefix(v)) { out.prefixes.push(v); continue; }
    if (isGender(v)) { out.gender = out.gender || v; continue; }
    if (isEmail(v)) { out.emails.push(v); continue; }
    if (isCountry(v)) { out.country = out.country || v; continue; }
    if (isState(v)) { out.state = out.state || v; continue; }
    if (isPin(v)) { out.zip = out.zip || v; continue; }
    if (isPhone(v)) { out.phones.push(v.replace(/[\s-]/g, '')); continue; }
    if (isYesNo(v)) { out.flags.push(v); continue; }
    /* everything else is part of the name, in order */
    out.nameParts.push(v);
  }
  return out;
}

/* 1 part -> first. 2 -> first + last. 3+ -> first + middle(rest) + last.
   Mirrors how the agent list renders a name (firstName + lastName), so what
   is stored reads back the way the workbook shows it. */
function splitName(parts) {
  if (!parts.length) return { firstName: '', middleName: '', lastName: '' };
  if (parts.length === 1) return { firstName: parts[0], middleName: '', lastName: '' };
  if (parts.length === 2) return { firstName: parts[0], middleName: '', lastName: parts[1] };
  return { firstName: parts[0], middleName: parts.slice(1, -1).join(' '), lastName: parts[parts.length - 1] };
}

/* ================================================================== main == */

async function main() {
  console.log(APPLY
    ? (REPLACE ? '=== APPLYING (upsert + remove agents not in the workbook) ===' : '=== APPLYING (upsert only) ===')
    : (REPLACE ? '=== DRY RUN - REPLACE MODE (pass --apply to write) ===' : '=== DRY RUN (pass --apply to write) ==='));

  if (!existsSync(EXCEL_PATH)) { console.error('Workbook not found: ' + EXCEL_PATH); process.exit(1); }
  console.log('workbook :', EXCEL_PATH);

  const wb = XLSX.readFile(EXCEL_PATH, { raw: true });
  const sheet = wb.SheetNames.find((n) => /agent/i.test(n)) || wb.SheetNames[0];
  const grid = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, raw: true, defval: null });
  const header = grid[0].map((h) => T(h));
  const rows = grid.slice(1);
  report.excel.rows = rows.length;
  console.log(`sheet    : "${sheet}"  ${rows.length} data rows`);

  const col = {};
  header.forEach((h, i) => { if (h && col[h] === undefined) col[h] = i; });
  const at = (r, name) => (col[name] === undefined ? '' : clean(r[col[name]]));
  const overflowIdx = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^(Basic Information - Type|Financial Details - Consignment)/.test(h))
    .map(({ i }) => i);

  /* --------------------------------------------------------- parse ----- */
  const parsed = [];
  const seen = new Map();

  rows.forEach((r, i) => {
    const rowNo = i + 2;
    const code = at(r, 'Contact ID (resolved)') || at(r, 'Contact ID');
    const fullName = at(r, 'Name');

    if (!code && !fullName) { report.excel.skipped.push({ row: rowNo, reason: 'blank row' }); return; }
    if (!code) { report.excel.skipped.push({ row: rowNo, name: fullName, reason: 'no Contact ID - cannot key the record' }); return; }
    if (seen.has(code)) {
      report.excel.duplicates.push({ row: rowNo, code, firstSeenRow: seen.get(code) });
      return;
    }
    seen.set(code, rowNo);

    const ov = classify(overflowIdx.map((ix) => r[ix]));
    const name = splitName(ov.nameParts);

    /* THE CHECK: does the name we pulled out of the overflow reproduce the
       workbook's own Name column? If not, the classification is wrong for
       this row and it must not be imported silently. */
    const rebuilt = ov.nameParts.join(' ');
    report.nameCheck.checked += 1;
    const agrees = rebuilt.toLowerCase() === fullName.toLowerCase();
    if (agrees) report.nameCheck.agreed += 1;
    else report.nameCheck.mismatched.push({ row: rowNo, code, workbook: fullName, rebuilt });

    const mobile = at(r, 'Mobile') || ov.phones[0] || '';

    parsed.push({
      rowNo, code, fullName, agrees,
      /* the last prefix is the one next to the name; an earlier "M/s" is a
         firm marker and is kept in shortName rather than thrown away */
      prefix: ov.prefixes.length ? ov.prefixes[ov.prefixes.length - 1] : 'Mr.',
      shortName: ov.prefixes.length > 1 ? ov.prefixes[0] : '',
      ...name,
      gender: ov.gender,
      billingState: ov.state,
      billingCountry: ov.country,
      billingZipCode: ov.zip,
      billingMobile: mobile,
      billingAlternateContactNumber: ov.phones.find((p) => p !== mobile) || '',
      billingEmail: at(r, 'Email') || ov.emails[0] || '',
      billingAddressLine1: at(r, 'Address'),
      sameAsBilling: at(r, 'Basic Information - Same as Billing Address') === 'Yes',
      openingBalance: at(r, 'Financial Details - Opening Balance'),
      consignmentPurchases: at(r, 'Financial Details - Consignment Purchases'),
    });
  });

  report.excel.valid = parsed.length;
  report.parsed = parsed.map((p) => ({ code: p.code, name: p.fullName, first: p.firstName, middle: p.middleName, last: p.lastName, mobile: p.billingMobile, state: p.billingState }));
  console.log(`parsed   : ${parsed.length} valid, ${report.excel.skipped.length} skipped, ${report.excel.duplicates.length} duplicate codes`);

  /* ------------------------------------------------------- database ---- */
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const contacts = db.collection('contact');

  const existing = await contacts.find({ contactKind: 'Agent' }).toArray();
  report.before = existing.length;
  const byCode = new Map(existing.map((a) => [T(a.contactId).toUpperCase(), a]));
  console.log(`database : ${existing.length} existing agents`);

  /* reuse the scope and contact type the existing agents already use, rather
     than choosing one */
  const businessId = existing.find((a) => a.businessId)?.businessId
    || (await db.collection('business').findOne({ isMainBranch: true }))?._id;
  const typeId = existing.find((a) => a.typeId)?.typeId
    || (await db.collection('contacttype').findOne({ contactType: 'Agent' }))?._id
    || null;

  /* ------------------------------------------------------ references --- */
  const referenced = new Set();
  for (const c of (await db.listCollections().toArray()).map((x) => x.name)) {
    for (const f of ['agentId', 'salesPersonId']) {
      try {
        (await db.collection(c).distinct(f, { [f]: { $nin: [null, ''] } })).forEach((v) => referenced.add(String(v)));
      } catch { /* not applicable */ }
    }
  }

  /* --------------------------------------------------------- backup ---- */
  mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(BACKUP_DIR, `agents-before-${stamp}.json`);
  writeFileSync(backupFile, JSON.stringify(existing, null, 2));
  report.backupFile = backupFile;
  console.log(`backup   : ${existing.length} agents -> ${backupFile}`);

  /* ----------------------------------------------------------- plan ---- */
  const toUpdate = [];
  const toInsert = [];
  parsed.forEach((p) => {
    const hit = byCode.get(p.code.toUpperCase());
    if (hit) toUpdate.push({ p, existing: hit }); else toInsert.push(p);
  });

  const excelCodes = new Set(parsed.map((p) => p.code.toUpperCase()));
  const extras = existing.filter((a) => !excelCodes.has(T(a.contactId).toUpperCase()));
  const retained = extras.filter((a) => referenced.has(String(a._id)));
  const deletable = extras.filter((a) => !retained.includes(a));
  report.extras = { total: extras.length, deletable: deletable.length, deleted: 0,
    retained: retained.map((a) => ({ contactId: a.contactId, name: a.businessName || a.firstName })) };

  /* which GRCs could be linked, by exact agent name */
  if (!NO_LINK) {
    const agentNames = await db.collection('grc').aggregate([
      { $match: { 'importMeta.agent': { $nin: [null, ''] }, agentId: null } },
      { $group: { _id: '$importMeta.agent', n: { $sum: 1 } } },
    ]).toArray();
    agentNames.forEach((a) => {
      const hit = parsed.find((p) => p.fullName.toLowerCase() === T(a._id).toLowerCase());
      report.grcLinkable.push({ name: a._id, grcs: a.n, agent: hit ? hit.code : null });
    });
  }

  printPlan(parsed, toUpdate, toInsert, extras, retained, deletable);

  if (report.nameCheck.mismatched.length) {
    console.log('\nREFUSING TO IMPORT the rows above whose name does not reconcile.');
  }

  if (!APPLY) {
    report.after = existing.length;
    writeReport();
    console.log('\nDry run complete - nothing was written.');
    await mongoose.disconnect();
    return;
  }

  /* ---------------------------------------------------------- write ---- */
  for (const { p, existing: hit } of toUpdate) {
    if (!p.agrees) { report.warnings.push(`${p.code}: name mismatch - skipped`); continue; }
    await contacts.updateOne({ _id: hit._id }, { $set: docFrom(p, businessId, typeId, false) });
    report.updated += 1;
  }
  for (const p of toInsert) {
    if (!p.agrees) { report.warnings.push(`${p.code}: name mismatch - skipped`); continue; }
    await contacts.insertOne({
      ...docFrom(p, businessId, typeId, true),
      contactKind: 'Agent', contactId: p.code,
      createdAt: new Date(), __v: 0,
    });
    report.inserted += 1;
  }
  if (REPLACE && deletable.length) {
    const res = await contacts.deleteMany({ _id: { $in: deletable.map((a) => a._id) } });
    report.extras.deleted = res.deletedCount;
  }

  /* ------------------------------------------------- link the GRCs ----- */
  if (!NO_LINK) {
    for (const link of report.grcLinkable.filter((l) => l.agent)) {
      const agent = await contacts.findOne({ contactKind: 'Agent', contactId: link.agent });
      if (!agent) continue;
      const res = await db.collection('grc').updateMany(
        { 'importMeta.agent': link.name, agentId: null },
        { $set: { agentId: agent._id } }
      );
      report.grcLinked += res.modifiedCount;
    }
  }

  report.after = await contacts.countDocuments({ contactKind: 'Agent' });
  printCounts();
  writeReport();
  await mongoose.disconnect();
}

function docFrom(p, businessId, typeId, isNew) {
  const d = { updatedAt: new Date() };
  const put = (k, v) => { if (v !== '' || isNew) d[k] = v; };
  ['prefix', 'shortName', 'firstName', 'middleName', 'lastName', 'gender',
    'billingAddressLine1', 'billingState', 'billingCountry', 'billingZipCode',
    'billingMobile', 'billingAlternateContactNumber', 'billingEmail',
    'openingBalance', 'consignmentPurchases'].forEach((k) => put(k, p[k]));
  d.sameAsBilling = p.sameAsBilling;
  /* The agent form has no Business Name field, and the list falls back to the
     person's name - so a company name is never forced into businessName, and
     never into firstName either (section 12). */
  if (isNew) { d.businessName = ''; d.businessId = businessId; if (typeId) d.typeId = typeId; }
  return d;
}

/* ================================================================ output == */

function printPlan(parsed, toUpdate, toInsert, extras, retained, deletable) {
  console.log('\n======================== PLAN =========================');
  console.log('PARSED AGENTS  (name rebuilt from the ragged overflow, then checked)');
  console.log('code     prefix  first / middle / last                    mobile        state      name check');
  parsed.forEach((p) => {
    console.log(`${p.code.padEnd(8)} ${p.prefix.padEnd(7)} ${[p.firstName, p.middleName, p.lastName].filter(Boolean).join(' / ').slice(0, 38).padEnd(40)} ${(p.billingMobile || '-').padEnd(13)} ${(p.billingState || '-').padEnd(10)} ${p.agrees ? 'OK' : 'MISMATCH'}`);
  });
  console.log(`\nname check: ${report.nameCheck.agreed}/${report.nameCheck.checked} rebuild exactly to the workbook's Name column`);
  report.nameCheck.mismatched.forEach((m) => console.log(`   row ${m.row} ${m.code}: workbook "${m.workbook}" vs rebuilt "${m.rebuilt}"`));

  console.log(`\nupdate in place : ${toUpdate.length}`);
  console.log(`insert as new   : ${toInsert.length}`);
  console.log(`\nin the database but NOT in the workbook : ${extras.length}`);
  extras.forEach((a) => console.log(`     - ${a.contactId}  ${a.businessName || [a.firstName, a.lastName].filter(Boolean).join(' ') || '(no name)'}  ${retained.includes(a) ? '[RETAINED - referenced]' : '[unreferenced]'}`));
  if (!REPLACE && deletable.length) console.log(`\n  (add --replace to remove the ${deletable.length} unreferenced one(s))`);

  if (report.grcLinkable.length) {
    console.log('\nGRC AGENT LINKING  (89 GRCs carry an agent name as text)');
    report.grcLinkable.forEach((l) => console.log(`     ${String(l.grcs).padStart(3)} GRCs  "${l.name}"  ->  ${l.agent || 'NO MATCHING AGENT'}`));
  }

  if (report.excel.skipped.length) {
    console.log(`\nSKIPPED ROWS: ${report.excel.skipped.length}`);
    report.excel.skipped.forEach((s) => console.log(`     row ${s.row}: ${s.reason}`));
  }
  console.log('=======================================================');
}

function printCounts() {
  const R = report;
  console.log('\n=================== IMPORT COMPLETED ==================');
  console.log(`agents before        : ${R.before}`);
  console.log(`updated in place     : ${R.updated}`);
  console.log(`inserted             : ${R.inserted}`);
  console.log(`removed              : ${R.extras.deleted}`);
  console.log(`retained (referenced): ${R.extras.retained.length}`);
  console.log(`agents after         : ${R.after}`);
  console.log(`GRCs linked to agents: ${R.grcLinked}`);
  console.log('=======================================================');
}

function writeReport() {
  report.finishedAt = new Date().toISOString();
  const f = path.join(ROOT, 'agent-import-report.json');
  writeFileSync(f, JSON.stringify(report, null, 2));
  console.log(`\nreport written: ${f}`);
  console.log(`backup       : ${report.backupFile}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
