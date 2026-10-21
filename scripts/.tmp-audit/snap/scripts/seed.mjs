// /* Seeds the reference data the Settings pages need to be usable:
//    one business, its locations, the label/layout catalogs and a city list.
//    Run: npm run seed */
// import mongoose from 'mongoose';
// import crypto from 'crypto';

// /* same scheme as lib/auth.js - scrypt with a per-user salt */
// function hashPassword(password) {
//   const salt = crypto.randomBytes(16).toString('hex');
//   return salt + ':' + crypto.scryptSync(String(password), salt, 64).toString('hex');
// }

// const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 's@gmail.com';
// const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 's@gmail.com';

// const URI ='mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1';

// const LABELS = [
//   ['TF 50 x 40', 'Sheet Size: 100mm x 40mm, Label Size: 50mm x 40", Labels per sheet: 2', '100 x 40 mm', '50 x 40 mm', 2],
//   ['LL - 50.00mm x 25.00mm - 2Ups', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2],
//   ['KS 50.00mm x 25.00mm - 2Ups', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2],
//   ['MA 38 x 25 mm 1Ups', 'Sheet Size: 38mm x 25mm, Label Size: 38mm x 25", Labels per sheet: 1', '38 x 25 mm', '38 x 25 mm', 1],
//   ['BS1 58*78mm 1Ups', 'Sheet Size: 58mm x 78mm, Label Size: 58mm x 78", Labels per sheet: 2', '58 x 78 mm', '58 x 78 mm', 1],
//   ['BS2 58*78mm 1Ups', 'Sheet Size: 58mm x 77mm, Label Size: 58mm x 78", Labels per sheet: 2', '58 x 78 mm', '58 x 78 mm', 1],
//   ['RT 72 x 116 mm', 'Sheet Size: 72mm x 116mm, Label Size: 0mm x 0", Labels per sheet: 2', '72 x 116 mm', '0 x 0 mm', 2],
//   ['MF 100 x 50 mm', 'Sheet Size: 100mm x 50mm, Label Size: 50mm x 50", Labels per sheet: 2', '100 x 50 mm', '50 x 50 mm', 2],
//   ['MNY 58 X 38', 'Sheet Size: 58mm x 38mm, Label Size: 58mm x 38", Labels per sheet: 1', '58 x 38 mm', '58 x 38 mm', 1],
//   ['BGS 100 X 25 mm', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2],
//   ['SAS 50 x 25mm', 'Sheet Size: 50mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 1', '50 x 25 mm', '50 x 25 mm', 1],
//   ['BGS V2 100 X 25 mm', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2],
//   ['KVC 50 x 25', 'Sheet Size: 50mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 1', '50 x 25 mm', '50 x 25 mm', 1],
// ];

// const LAYOUTS = [
//   'Thermal printer 4 inch', 'Pos A4', 'Pos A4 Template 2', 'Slim 4', 'BS Thermal Print V2',
//   'Pos A4 Sim', 'Thermal printer 3 inch BGS V1', 'SAS A5 POS', 'KVC POS A5', 'BS Thermal Print V3',
// ];

// const CITIES = [
//   ['Bangalore Urban', 'Karnataka'], ['Bangalore Rural', 'Karnataka'], ['Mysuru', 'Karnataka'],
//   ['Mangaluru', 'Karnataka'], ['Hubballi', 'Karnataka'], ['Davangere', 'Karnataka'],
//   ['Chennai', 'Tamil Nadu'], ['Coimbatore', 'Tamil Nadu'], ['Salem', 'Tamil Nadu'],
//   ['Abiramam', 'Tamil Nadu'], ['Hyderabad', 'Telangana'], ['Mumbai', 'Maharashtra'],
//   ['Pune', 'Maharashtra'], ['Ahmedabad', 'Gujarat'], ['Surat', 'Gujarat'],
//   ['Varanasi', 'Uttar Pradesh'], ['New Delhi', 'Delhi'], ['Kochi', 'Kerala'],
// ];

// const LEDGER_GROUPS = [
//   ['Assets', null], ['Bank Accounts', 'Assets'], ['Bank OCC A/c', 'Assets'],
//   ['Cash Accounts', 'Assets'], ['CASH ON HAND', 'Cash Accounts'], ['Current Assets', 'Assets'],
//   ['Deposits', 'Assets'], ['Fixed Assets', 'Assets'], ['Investments', 'Assets'],
//   ['Loans & Advances', 'Assets'], ['Sundry Debtors', 'Assets'], ['Liabilities', null],
//   ['Duties & Taxes', 'Liabilities'], ['Sundry Creditors', 'Liabilities'],
//   ['EXPENSES', null], ['Expenditure', 'EXPENSES'], ['Expenditure Direct', 'EXPENSES'],
//   ['Income(p&l)', 'EXPENSES'],
// ];

// async function main() {
//   await mongoose.connect(URI);
//   const db = mongoose.connection.db;

//   await db.collection('catalogs').deleteMany({});
//   await db.collection('catalogs').insertMany([
//     ...LABELS.map(([name, description, pageSize, labelSize, stickerInRow], i) => ({
//       catalog: 'barcodeLabels', name, description, pageSize, labelSize, stickerInRow, sort: i,
//     })),
//     ...LAYOUTS.map((name, i) => ({ catalog: 'invoiceLayouts', name, description: '', sort: i })),
//   ]);

//   await db.collection('cities').deleteMany({});
//   await db.collection('cities').insertMany(CITIES.map(([name, state]) => ({ name, state, country: 'India' })));

//   let biz = await db.collection('business').findOne({ name: 'Temple Fabrics' });
//   if (!biz) {
//     const r = await db.collection('business').insertOne({
//       name: 'Temple Fabrics', businessPrintName: 'Temple Fabrics',
//       city: 'Bangalore Urban', state: 'Karnataka', country: 'India', zipCode: '560011',
//       gstin: '29ABCDE1234F1Z5', isActive: 'Active', currency: 'INR', timezone: 'Asia/Kolkata',
//       businessId: null, locationId: null, finYear: '', createdAt: new Date(), updatedAt: new Date(),
//     });
//     biz = { _id: r.insertedId };
//   }

//   const locCount = await db.collection('companylocation').countDocuments({ businessId: biz._id });
//   if (!locCount) {
//     await db.collection('companylocation').insertMany([
//       { name: 'Temple Fabrics Warehouse', landmark: 'Temple Fabrics', city: 'Bangalore Urban', state: 'Karnataka', zipCode: '560011', businessId: biz._id, locationId: null, finYear: '', createdAt: new Date(), updatedAt: new Date() },
//       { name: 'Temple Fabrics C2', landmark: 'Temple Fabrics', city: 'Bangalore Urban', state: 'Karnataka', zipCode: '560011', businessId: biz._id, locationId: null, finYear: '', createdAt: new Date(), updatedAt: new Date() },
//     ]);
//   }

//   const lgCount = await db.collection('ledgergroup').countDocuments({ businessId: biz._id });
//   if (!lgCount) {
//     const idByName = {};
//     for (const [groupName, parent] of LEDGER_GROUPS) {
//       const r = await db.collection('ledgergroup').insertOne({
//         groupName, status: 'Active',
//         parentGroupId: parent ? idByName[parent] || null : null,
//         businessId: biz._id, locationId: null, finYear: '', createdAt: new Date(), updatedAt: new Date(),
//       });
//       idByName[groupName] = r.insertedId;
//     }
//   }

//   const existing = await db.collection('user').findOne({ email: ADMIN_EMAIL });
//   if (!existing) {
//     await db.collection('user').insertOne({
//       name: 'SAGAR',
//       email: ADMIN_EMAIL,
//       password: hashPassword(ADMIN_PASSWORD),
//       role: 'Super Admin',
//       isActive: true,
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     });
//     console.log('Admin user created: ' + ADMIN_EMAIL + ' / ' + ADMIN_PASSWORD);
//   } else {
//     console.log('Admin user already exists: ' + ADMIN_EMAIL);
//   }

//   console.log('Seeded: catalogs, cities, business, locations, ledger groups.');
//   await mongoose.disconnect();
// }

// main().catch((e) => { console.error(e); process.exit(1); });













/* Seeds the reference data the Settings pages need to be usable:
   one business, its locations, the label/layout catalogs and a city list.
   Run: npm run seed */
import mongoose from 'mongoose';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/* same scheme as lib/auth.js - scrypt with a per-user salt */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + crypto.scryptSync(String(password), salt, 64).toString('hex');
}

/* `node scripts/seed.mjs` runs outside Next, so nothing has loaded .env yet.
   Next itself reads .env automatically; this tiny parser gives the seed script
   the same variables without adding dotenv as a dependency. Anything already
   set in the real environment wins, so CI/production overrides still work. */
function loadEnv() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const name of ['.env.local', '.env']) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      if (process.env[key] !== undefined) continue;
      process.env[key] = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
}
loadEnv();

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 's@gmail.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 's@gmail.com';

/* Never hardcode this. The connection string carries the database password,
   and this file is tracked in git - the previous literal exposed the Atlas
   credentials to anyone who cloned the repo. */
const URI = process.env.MONGODB_URI;
if (!URI) {
  console.error(
    'MONGODB_URI is not set.\n' +
    'Add it to .env (see .env.example) or pass it inline:\n' +
    '  MONGODB_URI="mongodb+srv://..." npm run seed'
  );
  process.exit(1);
}

const LABELS = [
  ['TF 50 x 40', 'Sheet Size: 100mm x 40mm, Label Size: 50mm x 40", Labels per sheet: 2', '100 x 40 mm', '50 x 40 mm', 2],
  ['LL - 50.00mm x 25.00mm - 2Ups', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2],
  ['KS 50.00mm x 25.00mm - 2Ups', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2],
  ['MA 38 x 25 mm 1Ups', 'Sheet Size: 38mm x 25mm, Label Size: 38mm x 25", Labels per sheet: 1', '38 x 25 mm', '38 x 25 mm', 1],
  ['BS1 58*78mm 1Ups', 'Sheet Size: 58mm x 78mm, Label Size: 58mm x 78", Labels per sheet: 2', '58 x 78 mm', '58 x 78 mm', 1],
  ['BS2 58*78mm 1Ups', 'Sheet Size: 58mm x 77mm, Label Size: 58mm x 78", Labels per sheet: 2', '58 x 78 mm', '58 x 78 mm', 1],
  ['RT 72 x 116 mm', 'Sheet Size: 72mm x 116mm, Label Size: 0mm x 0", Labels per sheet: 2', '72 x 116 mm', '0 x 0 mm', 2],
  ['MF 100 x 50 mm', 'Sheet Size: 100mm x 50mm, Label Size: 50mm x 50", Labels per sheet: 2', '100 x 50 mm', '50 x 50 mm', 2],
  ['MNY 58 X 38', 'Sheet Size: 58mm x 38mm, Label Size: 58mm x 38", Labels per sheet: 1', '58 x 38 mm', '58 x 38 mm', 1],
  ['BGS 100 X 25 mm', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2],
  ['SAS 50 x 25mm', 'Sheet Size: 50mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 1', '50 x 25 mm', '50 x 25 mm', 1],
  ['BGS V2 100 X 25 mm', 'Sheet Size: 100mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 2', '100 x 25 mm', '50 x 25 mm', 2],
  ['KVC 50 x 25', 'Sheet Size: 50mm x 25mm, Label Size: 50mm x 25", Labels per sheet: 1', '50 x 25 mm', '50 x 25 mm', 1],
];

const LAYOUTS = [
  'Thermal printer 4 inch', 'Pos A4', 'Pos A4 Template 2', 'Slim 4', 'BS Thermal Print V2',
  'Pos A4 Sim', 'Thermal printer 3 inch BGS V1', 'SAS A5 POS', 'KVC POS A5', 'BS Thermal Print V3',
];

const CITIES = [
  ['Bangalore Urban', 'Karnataka'], ['Bangalore Rural', 'Karnataka'], ['Mysuru', 'Karnataka'],
  ['Mangaluru', 'Karnataka'], ['Hubballi', 'Karnataka'], ['Davangere', 'Karnataka'],
  ['Chennai', 'Tamil Nadu'], ['Coimbatore', 'Tamil Nadu'], ['Salem', 'Tamil Nadu'],
  ['Abiramam', 'Tamil Nadu'], ['Hyderabad', 'Telangana'], ['Mumbai', 'Maharashtra'],
  ['Pune', 'Maharashtra'], ['Ahmedabad', 'Gujarat'], ['Surat', 'Gujarat'],
  ['Varanasi', 'Uttar Pradesh'], ['New Delhi', 'Delhi'], ['Kochi', 'Kerala'],
];

const LEDGER_GROUPS = [
  ['Assets', null], ['Bank Accounts', 'Assets'], ['Bank OCC A/c', 'Assets'],
  ['Cash Accounts', 'Assets'], ['CASH ON HAND', 'Cash Accounts'], ['Current Assets', 'Assets'],
  ['Deposits', 'Assets'], ['Fixed Assets', 'Assets'], ['Investments', 'Assets'],
  ['Loans & Advances', 'Assets'], ['Sundry Debtors', 'Assets'], ['Liabilities', null],
  ['Duties & Taxes', 'Liabilities'], ['Sundry Creditors', 'Liabilities'],
  ['EXPENSES', null], ['Expenditure', 'EXPENSES'], ['Expenditure Direct', 'EXPENSES'],
  ['Income(p&l)', 'EXPENSES'],
];

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  await db.collection('catalogs').deleteMany({});
  await db.collection('catalogs').insertMany([
    ...LABELS.map(([name, description, pageSize, labelSize, stickerInRow], i) => ({
      catalog: 'barcodeLabels', name, description, pageSize, labelSize, stickerInRow, sort: i,
    })),
    ...LAYOUTS.map((name, i) => ({ catalog: 'invoiceLayouts', name, description: '', sort: i })),
  ]);

  await db.collection('cities').deleteMany({});
  await db.collection('cities').insertMany(CITIES.map(([name, state]) => ({ name, state, country: 'India' })));

  /* The main store. Matched case-insensitively: the seeded row gets renamed
     in the UI (it reads TEMPLE FABRICS on screen, not 'Temple Fabrics'), and
     an exact-match lookup would miss it and insert a duplicate on every run. */
  let biz = await db.collection('business').findOne({
    name: { $regex: '^\\s*Temple Fabrics\\s*$', $options: 'i' },
  });
  if (!biz) {
    const r = await db.collection('business').insertOne({
      name: 'Temple Fabrics', businessPrintName: 'Temple Fabrics',
      city: 'Bangalore Urban', state: 'Karnataka', country: 'India', zipCode: '560011',
      gstin: '29ABCDE1234F1Z5', isActive: 'Active', currency: 'INR', timezone: 'Asia/Kolkata',
      isMainBranch: true, parentBusinessId: null,
      businessId: null, locationId: null, finYear: '', createdAt: new Date(), updatedAt: new Date(),
    });
    biz = { _id: r.insertedId };
  }

  /* Enforce the invariant on every run, so a database that predates this
     field - or one where a second business was flagged by hand - converges:
     exactly one main store, everything else a sub-branch pointing at it. */
  await db.collection('business').updateOne(
    { _id: biz._id },
    { $set: { isMainBranch: true, parentBusinessId: null, updatedAt: new Date() } }
  );
  const demoted = await db.collection('business').updateMany(
    { _id: { $ne: biz._id } },
    { $set: { isMainBranch: false, parentBusinessId: biz._id, updatedAt: new Date() } }
  );
  console.log(
    'Main branch: ' + (biz.name || 'Temple Fabrics') +
    ' (' + demoted.modifiedCount + ' business rows set as sub-branches)'
  );

  const locCount = await db.collection('companylocation').countDocuments({ businessId: biz._id });
  if (!locCount) {
    await db.collection('companylocation').insertMany([
      { name: 'Temple Fabrics Warehouse', landmark: 'Temple Fabrics', city: 'Bangalore Urban', state: 'Karnataka', zipCode: '560011', businessId: biz._id, locationId: null, finYear: '', createdAt: new Date(), updatedAt: new Date() },
      { name: 'Temple Fabrics C2', landmark: 'Temple Fabrics', city: 'Bangalore Urban', state: 'Karnataka', zipCode: '560011', businessId: biz._id, locationId: null, finYear: '', createdAt: new Date(), updatedAt: new Date() },
    ]);
  }

  const lgCount = await db.collection('ledgergroup').countDocuments({ businessId: biz._id });
  if (!lgCount) {
    const idByName = {};
    for (const [groupName, parent] of LEDGER_GROUPS) {
      const r = await db.collection('ledgergroup').insertOne({
        groupName, status: 'Active',
        parentGroupId: parent ? idByName[parent] || null : null,
        businessId: biz._id, locationId: null, finYear: '', createdAt: new Date(), updatedAt: new Date(),
      });
      idByName[groupName] = r.insertedId;
    }
  }

  const existing = await db.collection('user').findOne({ email: ADMIN_EMAIL });
  if (!existing) {
    await db.collection('user').insertOne({
      name: 'SAGAR',
      email: ADMIN_EMAIL,
      password: hashPassword(ADMIN_PASSWORD),
      role: 'Super Admin',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log('Admin user created: ' + ADMIN_EMAIL + ' / ' + ADMIN_PASSWORD);
  } else {
    console.log('Admin user already exists: ' + ADMIN_EMAIL);
  }

  console.log('Seeded: catalogs, cities, business, locations, ledger groups.');
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
