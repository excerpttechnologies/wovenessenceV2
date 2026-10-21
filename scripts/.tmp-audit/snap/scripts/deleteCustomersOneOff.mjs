/* Customer-only master data cleanup.

   Scope, confirmed with the user before running:
     - contact collection is SHARED across Supplier/Agent/Customer via
       contactKind. Only contactKind: 'Customer' rows are removed.
     - Supplier (798) and Agent (8) rows in the same collection are untouched.
     - The 5 Customer rows with no businessId are included (per user).
     - The separate "customers" collection (ecommerce/portal login accounts -
       googleId/passwordHash, not ERP Customer master data) is NOT touched.
     - No other collection is touched: items, transactions (SalesInvoice,
       POS, DeliveryChallan, CreditNote, SalesReturn, B2bInvoice, Delivery/LR,
       GRC, etc.), ledger, docsetup, users, settings, business, locations all
       stay exactly as they are. customerId fields on those transactional
       documents are left as-is (dangling), matching the same behavior a
       single manual delete via DELETE /api/customer/[id] already has.
     - No backup export: explicitly declined by the user.
*/

import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const contact = db.collection('contact');

console.log('=== BEFORE ===');
const before = {
  Customer: await contact.countDocuments({ contactKind: 'Customer' }),
  Supplier: await contact.countDocuments({ contactKind: 'Supplier' }),
  Agent: await contact.countDocuments({ contactKind: 'Agent' }),
};
console.log('contact collection by contactKind:', JSON.stringify(before));
console.log('Customer records found:', before.Customer);

const otherBefore = {
  items: await db.collection('item').countDocuments({}),
  business: await db.collection('business').countDocuments({}),
  branches: await db.collection('branches').countDocuments({}),
  delivery: await db.collection('delivery').countDocuments({}),
  salesinvoice: await db.collection('salesinvoice').countDocuments({}),
  adminusers: await db.collection('adminusers').countDocuments({}),
  docsetup: await db.collection('docsetup').countDocuments({}),
  portalCustomers: await db.collection('customers').countDocuments({}),
};
console.log('unrelated collections (must stay unchanged):', JSON.stringify(otherBefore));

console.log('\n=== DELETING ===');
const result = await contact.deleteMany({ contactKind: 'Customer' });
console.log('deleted:', result.deletedCount);

console.log('\n=== AFTER ===');
const after = {
  Customer: await contact.countDocuments({ contactKind: 'Customer' }),
  Supplier: await contact.countDocuments({ contactKind: 'Supplier' }),
  Agent: await contact.countDocuments({ contactKind: 'Agent' }),
};
console.log('contact collection by contactKind:', JSON.stringify(after));
console.log('Customer records remaining:', after.Customer);

const otherAfter = {
  items: await db.collection('item').countDocuments({}),
  business: await db.collection('business').countDocuments({}),
  branches: await db.collection('branches').countDocuments({}),
  delivery: await db.collection('delivery').countDocuments({}),
  salesinvoice: await db.collection('salesinvoice').countDocuments({}),
  adminusers: await db.collection('adminusers').countDocuments({}),
  docsetup: await db.collection('docsetup').countDocuments({}),
  portalCustomers: await db.collection('customers').countDocuments({}),
};
console.log('unrelated collections after:', JSON.stringify(otherAfter));

console.log('\n=== VERIFY ===');
const supplierOk = before.Supplier === after.Supplier;
const agentOk = before.Agent === after.Agent;
const unrelatedOk = JSON.stringify(otherBefore) === JSON.stringify(otherAfter);
console.log('Suppliers unchanged:', supplierOk, `(${before.Supplier} -> ${after.Supplier})`);
console.log('Agents unchanged:   ', agentOk, `(${before.Agent} -> ${after.Agent})`);
console.log('Unrelated collections unchanged:', unrelatedOk);
console.log('Customer count = 0:', after.Customer === 0);

if (!supplierOk || !agentOk || !unrelatedOk || after.Customer !== 0) {
  console.log('\n*** VERIFICATION FAILED - investigate before trusting this run ***');
  process.exitCode = 1;
} else {
  console.log('\nAll checks passed.');
}

await mongoose.disconnect();
