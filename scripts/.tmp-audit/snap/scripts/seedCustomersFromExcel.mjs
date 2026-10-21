/* Seeds the Customer master from customers.xlsx.

   Follows scripts/replaceSuppliersFromExcel.mjs's shape (dry run by default,
   raw driver writes, --apply to commit) but is a plain IMPORT, not a
   diff/replace: the Customer contactKind was cleared to zero immediately
   before this was written (see the customer-only cleanup that preceded it),
   so there is nothing existing to reconcile against and no historical
   ObjectId references to preserve. This still upserts by contactId rather
   than blindly inserting, so a second run - or a run after a partial one -
   is safe and does not create duplicates.

   THE WORKBOOK

   56,803 rows, six columns: Business Name, Contact ID, Name, Mobile, Email,
   Address. Contact ID is 100% populated and 100% unique - it is the same
   kind of business-assigned code Suppliers carry as a G-code (see
   lib/contactId.js), so it is kept EXACTLY AS GIVEN rather than
   regenerated.

   Contact ID prefixes were checked against the ContactType master
   (contacttype collection, scoped to TEMPLE FABRICS): PO, JNR, IC and W
   each match an existing Customer/Supplier type by prefix, but 56,099 of
   56,803 rows (98.8%) carry an "R" prefix that matches NO ContactType in
   this database. Guessing a type for those would misclassify nearly the
   whole file, so typeId is left null for every row - the same state
   several pre-existing Contact documents in this database are already in
   (see the Edit Customer form, which already tolerates a blank Customer
   Type).

   Email and Address are blank on every row in this file - stored blank,
   not guessed.

   businessId is resolved from the ContactType prefixes matching TEMPLE
   FABRICS, not hard-coded, so this still points at the right company if
   the workbook is ever regenerated for a different install.

   Safe by default - reports and exits:

     npm run customers:import          dry run
     npm run customers:import:apply    writes
*/

import path from 'path';
import { existsSync } from 'fs';
import mongoose from 'mongoose';
import XLSX from 'xlsx';

const APPLY = process.argv.includes('--apply');
const ROOT = process.cwd();
const EXCEL_PATH = process.env.CUSTOMER_EXCEL_PATH || path.join(ROOT, 'customers.xlsx');

const URI = process.env.MONGODB_URI;
if (!URI) { console.error('MONGODB_URI is not set. Run with --env-file=.env'); process.exit(1); }

const T = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
const cleanMobile = (v) => String(v ?? '').trim().replace(/[^\d]/g, '');

/* The full field shape a Contact created through the Add Customer form
   would carry (models/Contact.js), so a seeded row edits and displays
   identically to one entered by hand. Only the fields the workbook
   actually supplies are overridden per row. */
function contactDefaults() {
  return {
    typeId: null,
    businessType: '',
    gstNo: '',
    contactType2: 'Individual',
    businessName: '',
    shortName: '',
    prefix: 'Mr.',
    firstName: '',
    middleName: '',
    lastName: '',
    dob: null,
    gender: '',
    allowLogin: false,
    userName: '',
    password: '',
    billingAddressLine1: '',
    billingAddressLine2: '',
    billingCity: '',
    billingState: '',
    billingCountry: '',
    billingDistrict: '',
    billingTaluk: '',
    billingZipCode: '',
    billingMobile: '',
    billingAlternateContactNumber: '',
    billingLandline: '',
    billingFax: '',
    billingEmail: '',
    billingEmail2: '',
    billingWebsiteUrl: '',
    shippingAddressLine1: '',
    shippingAddressLine2: '',
    shippingCity: '',
    shippingState: '',
    shippingCountry: '',
    shippingDistrict: '',
    shippingZipCode: '',
    shippingMobile: '',
    shippingAlternateContactNumber: '',
    shippingLandline: '',
    shippingFax: '',
    shippingEmail: '',
    shippingEmail2: '',
    shippingWebsiteUrl: '',
    sameAsBilling: false,
    markupPriceCalculation: 'Purchase Rate',
    discountType: '',
    discount: null,
    markUpOnCostRsp: null,
    rspRoundOff: null,
    markUpOnCostWsp: null,
    wspRoundOff: null,
    markUpOnCostDp: null,
    dpRoundOff: null,
    agentId: null,
    commissionPercent: null,
    paymentLedgerId: null,
    orderDeliveryEstimatedDays: null,
    orderAcceptedDelaysDays: null,
    orderAdvanceLimit: null,
    paymentWithinDays: null,
    paymentDateType: '',
    entryDate: null,
    documentDate: null,
    discountAllowWithinPercent: null,
    discountAllowInDays: null,
    purchaseTermsId: null,
    logisticsTerms: '',
    supplierType: '',
    openingBalance: 0,
    purchasesLedgerId: null,
    purchasesReturnLedgerId: null,
    consignmentPurchases: '',
    pan: '',
    cin: '',
    gstType: '',
    gstRegDate: null,
    ssiNo: '',
    ssiRegDate: null,
    msmeNo: '',
    msmeRegDate: null,
    tdsLedgerId: null,
    tdsPercent: null,
    tdsName: '',
    tdsSection: '',
    bankAccountName: '',
    bankName: '',
    accountNo: '',
    ifsc: '',
    swiftCode: '',
    allowProduction: '',
    allowToStockPoint: '',
    maximumOverDueDays: null,
    priceList: 'ON RSP',
    saleDueDate: null,
    interestChargedIfDelay: null,
    graceDays: null,
    invoiceCreditLimit: null,
    overdues: null,
    overduesDaysLock: null,
    logisticsApplicable: '',
    salesTermId: null,
    transporterId: null,
    remarks: '',
    customerType: '',
  };
}

await mongoose.connect(URI);
const db = mongoose.connection.db;

const biz = await db.collection('business').findOne({ isMainBranch: true })
  || await db.collection('business').findOne({});
if (!biz) { console.error('No business found - cannot assign new customers to a company.'); process.exit(1); }
console.log('Target business:', biz.businessName || biz.name, `(${biz._id})`);

if (!existsSync(EXCEL_PATH)) {
  console.error('Workbook not found:', EXCEL_PATH);
  process.exit(1);
}

const wb = XLSX.readFile(EXCEL_PATH);
const sheetName = wb.SheetNames[0];
const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: '', raw: false });
console.log('Workbook:', EXCEL_PATH, '| sheet:', sheetName, '| rows:', rows.length);

const contact = db.collection('contact');

console.log('\n=== BEFORE ===');
const before = {
  Customer: await contact.countDocuments({ contactKind: 'Customer' }),
  Supplier: await contact.countDocuments({ contactKind: 'Supplier' }),
  Agent: await contact.countDocuments({ contactKind: 'Agent' }),
};
console.log('contact collection by contactKind:', JSON.stringify(before));

/* contactId already present for this business, so a second run of this
   script - or a rerun after an interrupted first one - skips rows it has
   already written instead of duplicating them. */
const existingIds = new Set(
  (await contact.find({ businessId: biz._id, contactKind: 'Customer' }).project({ contactId: 1 }).toArray())
    .map((r) => r.contactId)
);

const seenInFile = new Set();
const skipped = [];
const docs = [];
const now = new Date();

for (let i = 0; i < rows.length; i += 1) {
  const r = rows[i];
  const contactId = T(r['Contact ID']);
  const businessName = T(r['Business Name']);
  const name = T(r['Name']);
  const mobile = cleanMobile(r['Mobile']);
  const email = T(r['Email']);
  const address = T(r['Address']);

  if (!contactId) { skipped.push({ row: i + 2, reason: 'no Contact ID', businessName, name }); continue; }
  if (!businessName && !name) { skipped.push({ row: i + 2, reason: 'no name at all', contactId }); continue; }
  if (seenInFile.has(contactId)) { skipped.push({ row: i + 2, reason: 'duplicate Contact ID within the workbook', contactId }); continue; }
  seenInFile.add(contactId);
  if (existingIds.has(contactId)) { skipped.push({ row: i + 2, reason: 'already imported (Contact ID already exists for this business)', contactId }); continue; }

  docs.push({
    ...contactDefaults(),
    businessId: biz._id,
    contactKind: 'Customer',
    contactId,
    businessName: businessName || name,
    firstName: name || businessName,
    billingMobile: mobile,
    billingEmail: email,
    billingAddressLine1: address,
    createdAt: now,
    updatedAt: now,
    __v: 0,
  });
}

console.log('\n=== VALIDATION ===');
console.log('rows in workbook:      ', rows.length);
console.log('valid, to be inserted: ', docs.length);
console.log('skipped:               ', skipped.length);
if (skipped.length) {
  const byReason = {};
  skipped.forEach((s) => { byReason[s.reason] = (byReason[s.reason] || 0) + 1; });
  console.log('skip reasons:', JSON.stringify(byReason));
  console.log('first 10 skipped rows:', JSON.stringify(skipped.slice(0, 10)));
}

if (!APPLY) {
  console.log('\nDry run only - nothing written. Re-run with --apply to insert.');
  await mongoose.disconnect();
  process.exit(0);
}

console.log('\n=== INSERTING ===');
let inserted = 0;
const BATCH = 2000;
for (let i = 0; i < docs.length; i += BATCH) {
  const batch = docs.slice(i, i + BATCH);
  const res = await contact.insertMany(batch, { ordered: false });
  inserted += res.insertedCount ?? Object.keys(res.insertedIds || {}).length;
  console.log('  inserted', Math.min(i + BATCH, docs.length), '/', docs.length);
}
console.log('total inserted:', inserted);

console.log('\n=== AFTER ===');
const after = {
  Customer: await contact.countDocuments({ contactKind: 'Customer' }),
  Supplier: await contact.countDocuments({ contactKind: 'Supplier' }),
  Agent: await contact.countDocuments({ contactKind: 'Agent' }),
};
console.log('contact collection by contactKind:', JSON.stringify(after));

console.log('\n=== VERIFY ===');
const supplierOk = before.Supplier === after.Supplier;
const agentOk = before.Agent === after.Agent;
const countOk = after.Customer === before.Customer + inserted;
console.log('Suppliers unchanged:', supplierOk, `(${before.Supplier} -> ${after.Supplier})`);
console.log('Agents unchanged:   ', agentOk, `(${before.Agent} -> ${after.Agent})`);
console.log('Customer count matches before + inserted:', countOk, `(${before.Customer} + ${inserted} = ${before.Customer + inserted}, actual ${after.Customer})`);

if (!supplierOk || !agentOk || !countOk) {
  console.log('\n*** VERIFICATION FAILED - investigate before trusting this run ***');
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed.');
}

await mongoose.disconnect();
