/* End-to-end check of the Accounts module against a RUNNING server.

   Writes to a DISPOSABLE database, and refuses to run against any other one:
   it drops and recreates the database it is pointed at, so pointing it at the
   real books would be catastrophic. It will only proceed when the URI's
   database name contains "accounting_verify".

     MONGODB_URI="mongodb+srv://.../orbit_accounting_verify" npx next start -p 3112
     MONGODB_URI="..." npm run test:accounting:flow

   What it proves, over HTTP, the way the screens use it:

     - the chart of accounts creates, rejects a duplicate code, and lists
     - Accounting Settings saves the mappings a GRC posting needs
     - a manual journal posts only when its debits equal its credits
     - a GRC posts itself, posts ONCE when asked twice, and re-posts by
       reversing the old journal when its value changes
     - deleting the GRC reverses its journal rather than erasing it
     - the six reports answer in the shape their screens expect, and the
       trial balance and balance sheet BALANCE */

import mongoose from 'mongoose';
import crypto from 'crypto';

const BASE = process.env.ACCOUNTING_BASE || 'http://127.0.0.1:3112';
const URI = process.env.MONGODB_URI || '';

if (!/accounting_verify/.test(URI)) {
  console.error('Refusing to run: MONGODB_URI must name a database containing "accounting_verify".');
  console.error('It drops that database. Got: ' + (URI ? URI.replace(/\/\/[^@]*@/, '//***@') : '(unset)'));
  process.exit(1);
}

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};
const money = (value) => Math.round(Number(value || 0) * 100);

let cookie = '';
const call = async (path, options = {}) => {
  const headers = { ...(options.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (options.body) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { ...options, headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
};

async function main() {
  await mongoose.connect(URI, { serverSelectionTimeoutMS: 15000 });
  const db = mongoose.connection.db;
  await db.dropDatabase();

  const businessId = new mongoose.Types.ObjectId().toString();
  const locationId = new mongoose.Types.ObjectId().toString();
  const finYear = '2026-2027';
  const scope = 'business=' + businessId + '&location=' + locationId + '&finYear=' + finYear;

  /* ---- sign in ------------------------------------------------------- */
  const salt = crypto.randomBytes(16).toString('hex');
  const password = 'Accounts-' + crypto.randomBytes(6).toString('hex');
  const email = 'accounting-flow@example.invalid';
  await db.collection('user').insertOne({
    name: 'Accounting Flow',
    email,
    password: salt + ':' + crypto.scryptSync(password, salt, 64).toString('hex'),
    role: 'Super Admin',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const login = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  if (!cookie) { console.error('Could not sign in - is the server running on ' + BASE + '?'); process.exit(1); }

  console.log('\nAUTHORISATION');
  const anon = await fetch(BASE + '/api/accounting/accounts?' + scope);
  ok('an unauthenticated request is refused', anon.status === 401, String(anon.status));

  console.log('\nCHART OF ACCOUNTS');
  const makeAccount = async (name, type, code) => call('/api/accounting/accounts?' + scope, {
    method: 'POST',
    body: JSON.stringify({
      data: { accountName: name, accountType: type, accountCode: code || '' },
      business: businessId,
      location: locationId,
      finYear,
    }),
  });

  const inventory = await makeAccount('Inventory', 'Asset', '1001');
  const payable = await makeAccount('Accounts Payable', 'Liability', '2001');
  const igst = await makeAccount('Input IGST', 'Asset', '1201');
  const cash = await makeAccount('Cash', 'Asset', '1000');
  const capital = await makeAccount('Capital', 'Equity', '3001');
  const sales = await makeAccount('Sales', 'Income', '4001');
  const rent = await makeAccount('Rent', 'Expense', '5001');

  ok('an account is created', inventory.status === 200 && Boolean(inventory.body?.id), JSON.stringify(inventory.body));
  ok('inventory AP and IGST exist', Boolean(payable.body?.id && igst.body?.id));
  ok('accounts of every type exist', Boolean(cash.body?.id && capital.body?.id && sales.body?.id && rent.body?.id));

  const duplicate = await makeAccount('Inventory again', 'Asset', '1001');
  ok('a duplicate account code is refused', duplicate.status === 422 && duplicate.body?.errors?.accountCode,
    JSON.stringify(duplicate.body));

  const autoCode = await makeAccount('Accruals', 'Liability', '');
  ok('a blank code takes the next free number', autoCode.status === 200, JSON.stringify(autoCode.body));

  const list = await call('/api/accounting/accounts?' + scope + '&perPage=50');
  ok('the chart lists what was created', list.status === 200 && list.body?.total >= 8, String(list.body?.total));
  ok('the list has the shape its screen expects',
    Array.isArray(list.body?.rows) && Number.isFinite(list.body?.pages) && Boolean(list.body?.labels));

  console.log('\nACCOUNTING SETTINGS');
  const settingsSave = await call('/api/accounting/settings', {
    method: 'PUT',
    body: JSON.stringify({
      data: {
        gstPostingMode: 'input-igst',
        mappings: {
          inventory: { accountId: inventory.body.id },
          accountsPayable: { accountId: payable.body.id },
          inputIgst: { accountId: igst.body.id },
          cash: { accountId: cash.body.id },
          bank: { accountId: cash.body.id },
          sales: { accountId: sales.body.id },
          retainedEarnings: { accountId: capital.body.id },
        },
      },
      business: businessId,
      location: locationId,
      finYear,
    }),
  });
  ok('the mappings save', settingsSave.status === 200 && settingsSave.body?.ok, JSON.stringify(settingsSave.body));
  ok('nothing required is still missing', (settingsSave.body?.warnings || []).length === 0,
    JSON.stringify(settingsSave.body?.warnings));

  const settingsRead = await call('/api/accounting/settings?' + scope);
  ok('the settings read back', settingsRead.status === 200
    && settingsRead.body?.settings?.gstPostingMode === 'input-igst'
    && settingsRead.body?.settings?.mappings?.inventory?.accountId === inventory.body.id,
  JSON.stringify(settingsRead.body?.settings?.mappings?.inventory));

  const settingsBad = await call('/api/accounting/settings', {
    method: 'PUT',
    body: JSON.stringify({
      data: { mappings: { inventory: { accountId: new mongoose.Types.ObjectId().toString() } } },
      business: businessId,
      location: locationId,
      finYear,
    }),
  });
  ok('a mapping to an account outside the business is refused', settingsBad.status === 422,
    JSON.stringify(settingsBad.body));

  console.log('\nMANUAL JOURNAL');
  const postJournal = (lines) => call('/api/accounting/journals', {
    method: 'POST',
    body: JSON.stringify({
      data: { journalDate: new Date().toISOString().slice(0, 10), referenceNo: 'JV/26/T1', narration: 'Flow test', lines },
      business: businessId,
      location: locationId,
      finYear,
    }),
  });

  const unbalanced = await postJournal([
    { accountId: rent.body.id, debit: 300, credit: 0 },
    { accountId: cash.body.id, debit: 0, credit: 200 },
  ]);
  ok('an unbalanced journal is refused', unbalanced.status === 422 && Boolean(unbalanced.body?.error),
    JSON.stringify(unbalanced.body));

  const bothSides = await postJournal([
    { accountId: rent.body.id, debit: 100, credit: 100 },
    { accountId: cash.body.id, debit: 0, credit: 0 },
  ]);
  ok('a line with both sides is refused', bothSides.status === 422);

  const expenseJournal = await postJournal([
    { accountId: rent.body.id, debit: 300, credit: 0 },
    { accountId: cash.body.id, debit: 0, credit: 300 },
  ]);
  ok('a balanced journal posts', expenseJournal.status === 200 && Boolean(expenseJournal.body?.id),
    JSON.stringify(expenseJournal.body));

  const incomeJournal = await postJournal([
    { accountId: cash.body.id, debit: 500, credit: 0 },
    { accountId: sales.body.id, debit: 0, credit: 500 },
  ]);
  ok('a second balanced journal posts', incomeJournal.status === 200);

  const journalList = await call('/api/accounting/journals?' + scope);
  ok('the register lists both journals', journalList.status === 200 && journalList.body?.total === 2,
    String(journalList.body?.total));
  ok('each journal carries its lines and totals', journalList.body?.rows?.[0]?.lines?.length === 2
    && money(journalList.body?.rows?.[0]?.totalDebit) === money(journalList.body?.rows?.[0]?.totalCredit));

  console.log('\nGRC POSTING');
  const grcId = new mongoose.Types.ObjectId();
  await db.collection('grc').insertOne({
    _id: grcId,
    businessId: new mongoose.Types.ObjectId(businessId),
    locationId: new mongoose.Types.ObjectId(locationId),
    finYear,
    grcNumber: 'GRC/26/T001',
    grcDate: new Date(),
    supplierId: new mongoose.Types.ObjectId(),
    taxable: 1000,
    gst: 180,
    netAmount: 1180,
    items: [],
    voucherRows: [],
    accountingStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const post = await call('/api/accounting/post-source', {
    method: 'POST',
    body: JSON.stringify({ source: 'purchase', id: String(grcId) }),
  });
  ok('a GRC posts to the books', post.status === 200 && post.body?.status === 'posted',
    JSON.stringify(post.body));

  let grc = await db.collection('grc').findOne({ _id: grcId });
  ok('the GRC records that it posted', grc?.accountingStatus === 'posted' && Boolean(grc?.accountingJournalId));

  const postedJournals = await db.collection('journalentry')
    .find({ source: 'purchase', sourceRefId: grcId }).toArray();
  ok('exactly one purchase journal exists', postedJournals.length === 1, String(postedJournals.length));

  const purchaseLines = postedJournals[0]?.lines || [];
  const lineOf = (accountId) => purchaseLines.find((l) => String(l.accountId) === String(accountId));
  ok('inventory is debited the taxable value', money(lineOf(inventory.body.id)?.debit) === 100000,
    JSON.stringify(lineOf(inventory.body.id)));
  ok('input IGST is debited the tax', money(lineOf(igst.body.id)?.debit) === 18000);
  ok('accounts payable is credited the invoice', money(lineOf(payable.body.id)?.credit) === 118000);
  ok('the purchase journal balances',
    money(postedJournals[0].totalDebit) === money(postedJournals[0].totalCredit));

  const postAgain = await call('/api/accounting/post-source', {
    method: 'POST',
    body: JSON.stringify({ source: 'purchase', id: String(grcId) }),
  });
  const afterTwice = await db.collection('journalentry').find({ source: 'purchase', sourceRefId: grcId }).toArray();
  ok('posting twice does not post twice', postAgain.status === 200
    && postAgain.body?.status === 'posted' && afterTwice.length === 1, String(afterTwice.length));

  /* the GRC's value changes: the old journal is reversed, a new one written */
  await db.collection('grc').updateOne({ _id: grcId }, { $set: { gst: 270, netAmount: 1270 } });
  const repost = await call('/api/accounting/post-source', {
    method: 'POST',
    body: JSON.stringify({ source: 'purchase', id: String(grcId) }),
  });
  const afterChange = await db.collection('journalentry')
    .find({ source: 'purchase', sourceRefId: grcId }).sort({ postingSeq: 1 }).toArray();
  const entries = afterChange.filter((j) => j.kind === 'entry');
  const reversals = afterChange.filter((j) => j.kind === 'reversal');
  ok('a changed GRC re-posts', repost.body?.status === 'posted');
  ok('the old journal is reversed, not edited', entries.length === 2 && reversals.length === 1,
    JSON.stringify(afterChange.map((j) => j.kind + ':' + j.postingSeq)));
  ok('the original is marked reversed', entries[0]?.status === 'reversed');
  ok('the new entry carries the new value', money(entries[1]?.totalDebit) === 127000,
    String(entries[1]?.totalDebit));

  console.log('\nREPORTS');
  const ledger = await call('/api/reports/ledger?' + scope + '&accountId=' + inventory.body.id);
  ok('the ledger answers', ledger.status === 200, JSON.stringify(ledger.body?.error));
  ok('the ledger has one section and a closing balance',
    ledger.body?.sections?.length === 1 && ledger.body?.closingBalance !== undefined);
  ok('inventory is debited 1000 in the current posting', money(ledger.body?.tiles?.debit) === 100000,
    String(ledger.body?.tiles?.debit));
  ok('the ledger running balance equals its closing balance',
    money(ledger.body?.sections?.[0]?.rows?.slice(-1)[0]?.balance) === money(ledger.body?.closingBalance));

  const trial = await call('/api/reports/trial-balance?' + scope);
  ok('the trial balance answers', trial.status === 200, JSON.stringify(trial.body?.error));
  ok('the trial balance balances',
    money(trial.body?.tiles?.difference) === 0
    && money(trial.body?.tiles?.closingDebit) === money(trial.body?.tiles?.closingCredit),
  JSON.stringify(trial.body?.tiles));

  const pnl = await call('/api/reports/profit-loss?' + scope);
  ok('P&L answers with its two tables', pnl.status === 200 && pnl.body?.sections?.length === 2);
  ok('income and expenses net to the profit', money(pnl.body?.tiles?.totalIncome) === 50000
    && money(pnl.body?.tiles?.totalExpenses) === 30000
    && money(pnl.body?.tiles?.netProfit) === 20000,
  JSON.stringify(pnl.body?.tiles));

  const sheet = await call('/api/reports/balance-sheet?' + scope);
  ok('the balance sheet answers with its three tables', sheet.status === 200 && sheet.body?.sections?.length === 3);
  ok('the balance sheet balances', money(sheet.body?.tiles?.difference) === 0,
    JSON.stringify(sheet.body?.tiles));
  ok('the year result is in equity', (sheet.body?.sections?.[2]?.rows || [])
    .some((row) => /Profit for the year/.test(row.accountName)));

  const gst = await call('/api/reports/gst-ledger?' + scope);
  ok('the GST ledger answers', gst.status === 200, JSON.stringify(gst.body?.error));
  /* 180 was posted, reversed in full when the GRC changed, and re-posted at
     270 - so the tax account's net debit over the window is 270. */
  ok('it reads the mapped tax account', money(gst.body?.tiles?.inputDebit) === 27000,
    JSON.stringify(gst.body?.tiles));

  const bank = await call('/api/reports/bank-cash?' + scope);
  ok('bank & cash answers', bank.status === 200, JSON.stringify(bank.body?.error));
  ok('it produces a section per account', Array.isArray(bank.body?.sections) && bank.body.sections.length >= 1,
    String(bank.body?.sections?.length));
  ok('cash movement is there', money(bank.body?.tiles?.receipts) === 50000
    && money(bank.body?.tiles?.payments) === 30000,
  JSON.stringify(bank.body?.tiles));
  ok('an account mapped as both cash and bank appears once',
    bank.body?.sections?.length === 1, String(bank.body?.sections?.length));

  console.log('\nREADING, EDITING AND REVERSING');

  const readCash = await call('/api/accounting/accounts/' + cash.body.id + '?' + scope);
  ok('an account reads back', readCash.status === 200 && readCash.body?.doc?.accountCode === '1000',
    JSON.stringify(readCash.body?.doc));
  ok('its status reads the way the form writes it', readCash.body?.doc?.isActive === 'Active',
    JSON.stringify(readCash.body?.doc?.isActive));

  const rename = await call('/api/accounting/accounts/' + cash.body.id + '?' + scope, {
    method: 'PUT',
    body: JSON.stringify({
      data: { ...readCash.body.doc, accountName: 'Cash in Hand' },
      business: businessId,
      location: locationId,
      finYear,
    }),
  });
  ok('an account is renamed', rename.status === 200 && rename.body?.ok, JSON.stringify(rename.body));
  const renamed = await call('/api/accounting/accounts/' + cash.body.id + '?' + scope);
  ok('the rename is stored', renamed.body?.doc?.accountName === 'Cash in Hand',
    JSON.stringify(renamed.body?.doc?.accountName));

  const moveBranch = await call('/api/accounting/accounts/' + cash.body.id + '?' + scope, {
    method: 'PUT',
    body: JSON.stringify({
      data: { ...renamed.body.doc, accountCode: '1001' },
      business: businessId,
      location: locationId,
      finYear,
    }),
  });
  ok('taking another account\'s code is refused', moveBranch.status === 422
    && Boolean(moveBranch.body?.errors?.accountCode), JSON.stringify(moveBranch.body));

  const deleteUsed = await call('/api/accounting/accounts/' + cash.body.id + '?' + scope, { method: 'DELETE' });
  ok('an account with postings cannot be deleted', deleteUsed.status === 422
    && /postings|line/.test(deleteUsed.body?.error || ''), JSON.stringify(deleteUsed.body));

  const accruals = list.body.rows.find((row) => row.accountName === 'Accruals');
  const deleteIdle = await call('/api/accounting/accounts/' + accruals._id + '?' + scope, { method: 'DELETE' });
  ok('an unused account deletes', deleteIdle.status === 200 && deleteIdle.body?.ok,
    JSON.stringify(deleteIdle.body));

  const rentJournalId = journalList.body.rows.find((row) => row.referenceNo === 'JV/26/T1')?._id;
  const readJournal = await call('/api/accounting/journals/' + rentJournalId + '?' + scope);
  ok('a journal reads back with its lines', readJournal.status === 200
    && readJournal.body?.doc?.lines?.length === 2, JSON.stringify(readJournal.body?.doc?.lines?.length));

  const reverse = await call('/api/accounting/journals/' + rentJournalId + '/reverse?' + scope, { method: 'POST' });
  ok('a manual journal reverses', reverse.status === 200 && Boolean(reverse.body?.id),
    JSON.stringify(reverse.body));

  const reversedEntry = await db.collection('journalentry').findOne({ _id: new mongoose.Types.ObjectId(rentJournalId) });
  ok('the original is marked reversed', reversedEntry?.status === 'reversed'
    && Boolean(reversedEntry?.reversedBy), JSON.stringify({
      status: reversedEntry?.status, reversedBy: Boolean(reversedEntry?.reversedBy),
    }));

  const secondReverse = await call('/api/accounting/journals/' + rentJournalId + '/reverse?' + scope, { method: 'POST' });
  ok('the same journal cannot be reversed twice', secondReverse.status === 422,
    JSON.stringify(secondReverse.body));

  const deleteReversed = await call('/api/accounting/journals/' + rentJournalId + '?' + scope, { method: 'DELETE' });
  ok('a reversed journal is kept, not deleted', deleteReversed.status === 422,
    JSON.stringify(deleteReversed.body));

  /* A manual entry that was NEVER reversed may still be removed outright -
     an operator entering a journal twice should be able to take the second
     one back out, while anything already corrected stays on the record. */
  const scratchJournal = await postJournal([
    { accountId: capital.body.id, debit: 25, credit: 0 },
    { accountId: cash.body.id, debit: 0, credit: 25 },
  ]);
  const deleteScratch = await call('/api/accounting/journals/' + scratchJournal.body.id + '?' + scope,
    { method: 'DELETE' });
  ok('an untouched manual journal can be removed', deleteScratch.status === 200 && deleteScratch.body?.ok,
    JSON.stringify(deleteScratch.body));

  const missingAccount = await call('/api/accounting/accounts/' + new mongoose.Types.ObjectId() + '?' + scope);
  ok('an unknown account is 404, not an empty page', missingAccount.status === 404,
    String(missingAccount.status));

  console.log('\nONE-CLICK SETUP (a branch that has nothing)');

  const business2 = new mongoose.Types.ObjectId().toString();
  const location2 = new mongoose.Types.ObjectId().toString();
  const setupUrl = {
    method: 'POST',
    body: JSON.stringify({
      data: { gstPostingMode: 'inclusive' },
      business: business2,
      location: location2,
      finYear,
    }),
  };

  const setup1 = await call('/api/accounting/settings/setup', setupUrl);
  ok('the setup runs', setup1.status === 200 && setup1.body?.ok, JSON.stringify(setup1.body));
  ok('the standard chart is created', setup1.body?.createdCount >= 20, String(setup1.body?.createdCount));
  ok('Inventory and Accounts Payable are mapped',
    (setup1.body?.filled || []).includes('Inventory')
    && (setup1.body?.filled || []).includes('Accounts Payable'),
  JSON.stringify(setup1.body?.filled));
  ok('nothing required is left missing', (setup1.body?.problems || []).length === 0,
    JSON.stringify(setup1.body?.problems));
  ok('a default mode is chosen', setup1.body?.gstPostingMode === 'inclusive');

  const setup2 = await call('/api/accounting/settings/setup', setupUrl);
  ok('pressing it again changes nothing', setup2.status === 200
    && setup2.body?.createdCount === 0 && (setup2.body?.filled || []).length === 0,
  JSON.stringify({ created: setup2.body?.createdCount, filled: setup2.body?.filled }));

  const setupRead = await call('/api/accounting/settings?business=' + business2
    + '&location=' + location2 + '&finYear=' + finYear);
  ok('the mappings read back for the new branch', setupRead.status === 200
    && Boolean(setupRead.body?.settings?.mappings?.inventory?.accountId),
  JSON.stringify(setupRead.body?.settings?.mappings?.inventory));

  /* the whole point: a branch that has never seen Accounting Settings can
     still have its receipt posted */
  const grcId2 = new mongoose.Types.ObjectId();
  await db.collection('grc').insertOne({
    _id: grcId2,
    businessId: new mongoose.Types.ObjectId(business2),
    locationId: new mongoose.Types.ObjectId(location2),
    finYear,
    grcNumber: 'GRC/26/T002',
    grcDate: new Date(),
    supplierId: new mongoose.Types.ObjectId(),
    taxable: 1000,
    gst: 180,
    netAmount: 1180,
    items: [],
    voucherRows: [],
    accountingStatus: 'pending',
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  const post2 = await call('/api/accounting/post-source', {
    method: 'POST',
    body: JSON.stringify({ source: 'purchase', id: String(grcId2) }),
  });
  ok('a GRC posts on the freshly set-up branch', post2.body?.status === 'posted', JSON.stringify(post2.body));

  const setupJournals = await db.collection('journalentry')
    .find({ source: 'purchase', sourceRefId: grcId2 }).toArray();
  ok('inclusive mode posts two lines', setupJournals.length === 1 && setupJournals[0].lines.length === 2,
    JSON.stringify(setupJournals.map((j) => j.lines.length)));
  ok('its journal balances at the invoice total',
    money(setupJournals[0].totalDebit) === 118000
    && money(setupJournals[0].totalDebit) === money(setupJournals[0].totalCredit),
  JSON.stringify({ d: setupJournals[0].totalDebit, c: setupJournals[0].totalCredit }));

  console.log('\nCANCELLING A GRC');
  const remove = await call('/api/purchase-grc/' + String(grcId) + '?' + scope, { method: 'DELETE' });
  ok('the GRC deletes', remove.status === 200, JSON.stringify(remove.body));

  const finalEntries = await db.collection('journalentry')
    .find({ source: 'purchase', sourceRefId: grcId }).toArray();
  ok('its journal is reversed, not deleted', finalEntries.filter((j) => j.kind === 'reversal').length === 2,
    String(finalEntries.filter((j) => j.kind === 'reversal').length));
  ok('no posted purchase journal is left', finalEntries.filter((j) => j.status === 'posted' && j.kind === 'entry').length === 0);
  ok('the GRC document is gone', (await db.collection('grc').countDocuments({ _id: grcId })) === 0);

  const trialAfter = await call('/api/reports/trial-balance?' + scope);
  ok('the books still balance after the cancellation', money(trialAfter.body?.tiles?.difference) === 0,
    JSON.stringify(trialAfter.body?.tiles));

  await db.dropDatabase();
  await mongoose.disconnect();

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  try { await mongoose.disconnect(); } catch { /* nothing left to close */ }
  process.exit(1);
});
