/* Unit tests for the Accounts module's arithmetic and posting rules - run
   against the real modules, not a copy. No database, no server.

     npm run test:accounting

   What is covered here is everything that decides a NUMBER or refuses a
   journal before a database write: rounding, the balance sign convention, the
   running ledger balance, trial-balance totals, the P&L and balance-sheet
   results, the GST split (down to the paisa), and the Dr / Cr lines a
   Purchase GRC makes under each GST mode. */

import {
  r2, toPaise, fromPaise, balanceType, splitBalance, ledgerRows,
  trialBalanceRows, trialBalanceTotals, profitAndLossSections,
  balanceSheetSections, journalTotals, journalProblems, reversalLines,
  fyBounds, isInFinYear,
} from '@/lib/accounting/calc';
import { normaliseLines, finYearOf, allocate } from '@/lib/accounting/journal';
import { gstSplit, requiredPostingKeys, accountFor } from '@/lib/accounting/settings';
import { grcJournalLines } from '@/lib/accounting/posting';
import { STANDARD_CHART } from '@/lib/accounting/setup';
import { MAPPING_KEYS } from '@/models/AccountingSettings';

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const id = (n) => String(n).repeat(24).slice(0, 24);

console.log('\nMONEY');

ok('0.1 + 0.2 rounds to 0.3', r2(0.1 + 0.2) === 0.3, String(r2(0.1 + 0.2)));
ok('paise of 10000.10 equals paise of 10000.1', toPaise(10000.10) === toPaise(10000.1));
ok('fromPaise(round trip)', fromPaise(toPaise(1234.56)) === 1234.56);
ok('balanceType Dr / Cr / Nil', balanceType(5) === 'Dr' && balanceType(-5) === 'Cr' && balanceType(0) === 'Nil');
ok('splitBalance splits by sign', same(splitBalance(-25), { debit: 0, credit: 25 }));

console.log('\nJOURNALS');

const balanced = [
  { accountId: id('a'), debit: 100, credit: 0 },
  { accountId: id('b'), debit: 0, credit: 100 },
];
const totals = journalTotals(balanced);
ok('balanced totals', totals.totalDebit === 100 && totals.totalCredit === 100 && totals.differencePaise === 0);
ok('balanced journal has no problems', same(journalProblems(balanced), []), JSON.stringify(journalProblems(balanced)));

const unbalanced = journalProblems([
  { accountId: id('a'), debit: 0.1, credit: 0 },
  { accountId: id('b'), debit: 0.2, credit: 0 },
  { accountId: id('c'), debit: 0, credit: 0.3 },
]);
ok('float drift does not unbalance a journal', same(unbalanced, []), JSON.stringify(unbalanced));

const off = journalProblems([
  { accountId: id('a'), debit: 100, credit: 0 },
  { accountId: id('b'), debit: 0, credit: 90 },
]);
ok('a real difference is refused', off.some((p) => /must equal total credit/.test(p)), JSON.stringify(off));

ok('one line cannot be both', journalProblems([
  { accountId: id('a'), debit: 10, credit: 10 },
  { accountId: id('b'), debit: 0, credit: 0 },
]).some((p) => /both a debit and a credit/.test(p)));

ok('a single line is refused', journalProblems([{ accountId: id('a'), debit: 10 }])
  .some((p) => /at least two lines/.test(p)));

ok('a missing account is refused', journalProblems([
  { accountId: '', debit: 10 },
  { accountId: id('b'), debit: 0, credit: 10 },
]).some((p) => /choose an account/.test(p)));

const reversed = reversalLines(balanced);
ok('reversal swaps the sides', reversed[0].debit === 0 && reversed[0].credit === 100
  && reversed[1].debit === 100 && reversed[1].credit === 0);
ok('reversal still balances', journalTotals(reversed).differencePaise === 0);

const norm = normaliseLines([
  { accountId: id('a'), debit: '100.005', credit: '' },
  { accountId: '', debit: '', credit: '' },
  { accountId: id('b'), debit: 0, credit: '100.01' },
]);
ok('blank trailing line dropped', norm.length === 2);
ok('money rounded to paisa', norm[0].debit === 100.01, String(norm[0].debit));

console.log('\nFINANCIAL YEAR');

const bounds = fyBounds('2026-2027');
ok('FY starts 1 April and ends 31 March', bounds.start.getMonth() === 3
  && bounds.start.getDate() === 1 && bounds.end.getMonth() === 2 && bounds.end.getDate() === 31);
ok('1 April 2026 is in FY 2026-2027', isInFinYear(new Date(2026, 3, 1), '2026-2027'));
ok('31 March 2026 is NOT in FY 2026-2027', !isInFinYear(new Date(2026, 2, 31), '2026-2027'));
ok('finYearOf an April date', finYearOf(new Date(2026, 3, 1)) === '2026-2027');
ok('finYearOf a March date belongs to the year before', finYearOf(new Date(2026, 2, 31)) === '2025-2026');
ok('a bad label resolves to no bounds', fyBounds('2026-2028') === null);

console.log('\nLEDGER');

const ledger = ledgerRows({
  opening: 100,
  rows: [
    { id: '1', debit: 50, credit: 0 },
    { id: '2', debit: 0, credit: 20 },
    { id: '3', debit: 0, credit: 200 },
  ],
});
ok('running balance carries row to row', same(ledger.transactions.map((r) => r.balance), [150, 130, -70]),
  JSON.stringify(ledger.transactions.map((r) => r.balance)));
ok('closing balance is the last running balance', ledger.closingBalance === -70);
ok('closing side is Cr', ledger.closingBalanceType === 'Cr');
ok('ledger totals', ledger.totalDebit === 50 && ledger.totalCredit === 220);
ok('ledger page continuity: page 2 opening is page 1 closing', (() => {
  const first = ledgerRows({ opening: 100, rows: [{ debit: 50, credit: 0 }] });
  const second = ledgerRows({ opening: first.closingBalance, rows: [{ debit: 0, credit: 20 }] });
  return second.transactions[0].balance === 130;
})());

console.log('\nTRIAL BALANCE');

const accounts = [
  { _id: 'a', accountCode: '1000', accountName: 'Cash', accountType: 'Asset', openingBalance: 500 },
  { _id: 'b', accountCode: '2000', accountName: 'Payable', accountType: 'Liability', openingBalance: -500 },
];
const tb = trialBalanceRows({
  accounts,
  openingByAccount: { a: 500, b: -500 },
  movementByAccount: { a: { debit: 200, credit: 50 }, b: { debit: 50, credit: 200 } },
});
ok('opening Dr / Cr columns follow the sign', tb[0].openingDebit === 500 && tb[1].openingCredit === 500);
ok('closing is opening + movement', tb[0].closingDebit === 650 && tb[1].closingCredit === 650);
const tbTotals = trialBalanceTotals(tb);
ok('trial balance totals balance', tbTotals.closingDifference === 0, JSON.stringify(tbTotals));
ok('period totals equal', tbTotals.periodDebit === 250 && tbTotals.periodCredit === 250);

console.log('\nPROFIT & LOSS');

const pnl = profitAndLossSections({
  accounts: [
    { _id: 'i', accountCode: '4000', accountName: 'Sales', accountType: 'Income' },
    { _id: 'e', accountCode: '5000', accountName: 'Rent', accountType: 'Expense' },
  ],
  movementByAccount: {
    i: { debit: 100, credit: 1000 },
    e: { debit: 400, credit: 50 },
  },
});
ok('income is credit net of debits', pnl.totalIncome === 900, String(pnl.totalIncome));
ok('expenses are debit net of credits', pnl.totalExpenses === 350, String(pnl.totalExpenses));
ok('net profit is income - expenses', pnl.netProfit === 550 && pnl.netLoss === 0);
const loss = profitAndLossSections({
  accounts: [{ _id: 'e', accountName: 'Rent', accountType: 'Expense' }],
  movementByAccount: { e: { debit: 100, credit: 0 } },
});
ok('a loss is reported as a loss, not negative profit', loss.netLoss === 100 && loss.netProfit === 0);

console.log('\nBALANCE SHEET');

const sheet = balanceSheetSections({
  accounts: [
    { _id: 'a', accountName: 'Cash', accountType: 'Asset' },
    { _id: 'l', accountName: 'Payable', accountType: 'Liability' },
    { _id: 'q', accountName: 'Capital', accountType: 'Equity' },
  ],
  balanceByAccount: { a: 1000, l: -400, q: -100 },
  netProfit: 500,
});
ok('liabilities read as positive credits', sheet.sections[1].rows[0].amount === 400);
ok('equity reads as positive credits', sheet.sections[2].rows[0].amount === 100);
ok('the page balances', sheet.difference === 0, String(sheet.difference));
const unbalancedSheet = balanceSheetSections({
  accounts: [{ _id: 'a', accountName: 'Cash', accountType: 'Asset' }],
  balanceByAccount: { a: 1000 },
  netProfit: 0,
});
ok('a difference is reported, not forced away', unbalancedSheet.difference === 1000);

console.log('\nGST SPLIT');

const halfSplit = gstSplit('input-cgst-sgst', 100.01);
ok('CGST + SGST add back to the GST to the paisa',
  toPaise(halfSplit[0].amount) + toPaise(halfSplit[1].amount) === toPaise(100.01),
  JSON.stringify(halfSplit));
ok('an odd paisa lands in SGST', halfSplit[0].amount === 50 && halfSplit[1].amount === 50.01,
  JSON.stringify(halfSplit));
ok('IGST mode puts it all in IGST', same(gstSplit('input-igst', 18), [{ key: 'inputIgst', amount: 18 }]));
ok('inclusive mode uses no tax account', same(gstSplit('inclusive', 18), []));
ok('required keys per mode', same(requiredPostingKeys('inclusive'), ['inventory', 'accountsPayable'])
  && same(requiredPostingKeys('input-igst'), ['inventory', 'accountsPayable', 'inputIgst'])
  && same(requiredPostingKeys('input-cgst-sgst'), ['inventory', 'accountsPayable', 'inputCgst', 'inputSgst']));

console.log('\nGRC POSTING LINES');

const settings = (mode) => ({
  gstPostingMode: mode,
  mappings: {
    inventory: { accountId: id('1'), accountName: 'Inventory', accountCode: '1001' },
    accountsPayable: { accountId: id('2'), accountName: 'Accounts Payable', accountCode: '2001' },
    inputIgst: { accountId: id('3'), accountName: 'Input IGST', accountCode: '1201' },
    inputCgst: { accountId: id('4'), accountName: 'Input CGST', accountCode: '1202' },
    inputSgst: { accountId: id('5'), accountName: 'Input SGST', accountCode: '1203' },
  },
});

const money = { taxable: 1000, gst: 180, netAmount: 1180 };

const inclusive = grcJournalLines(money, settings('inclusive'));
ok('inclusive: two lines', inclusive.length === 2);
ok('inclusive: inventory debited the whole invoice', inclusive[0].debit === 1180 && inclusive[0].credit === 0);
ok('inclusive: payable credited the invoice', inclusive[1].credit === 1180 && inclusive[1].debit === 0);
ok('inclusive: journal balances', journalTotals(inclusive).differencePaise === 0);

const igst = grcJournalLines(money, settings('input-igst'));
ok('IGST: three lines', igst.length === 3, String(igst.length));
ok('IGST: inventory is the taxable value', igst[0].debit === 1000);
ok('IGST: tax goes to Input IGST', igst[1].debit === 180 && igst[1].accountName === 'Input IGST');
ok('IGST: payable is the invoice total', igst[2].credit === 1180);
ok('IGST: journal balances', journalTotals(igst).differencePaise === 0);

const split = grcJournalLines(money, settings('input-cgst-sgst'));
ok('CGST/SGST: four lines', split.length === 4, String(split.length));
ok('CGST/SGST: 90 + 90', split[1].debit === 90 && split[2].debit === 90);
ok('CGST/SGST: journal balances', journalTotals(split).differencePaise === 0);

ok('a missing mapping throws rather than guessing', (() => {
  try {
    accountFor({ mappings: {} }, 'inventory');
    return false;
  } catch (error) {
    return /No account mapped/.test(error.message);
  }
})());

console.log('\nALLOCATION');

const allocated = allocate(100, [33.33, 33.33]);
ok('allocate makes the parts add to the total', toPaise(allocated[0]) + toPaise(allocated[1]) === toPaise(100),
  JSON.stringify(allocated));

console.log('\nSTANDARD CHART');

ok('account codes are unique', new Set(STANDARD_CHART.map((a) => a.code)).size === STANDARD_CHART.length);
ok('account names are unique',
  new Set(STANDARD_CHART.map((a) => a.name.toLowerCase())).size === STANDARD_CHART.length);
ok('every code is a plain number', STANDARD_CHART.every((a) => /^\d{4}$/.test(a.code)));
ok('every type is a real account type', STANDARD_CHART.every((a) =>
  ['Asset', 'Liability', 'Equity', 'Income', 'Expense'].includes(a.type)));
ok('every mapping role points at a real settings key',
  STANDARD_CHART.filter((a) => a.map).every((a) => MAPPING_KEYS.includes(a.map)));
ok('the chart covers every settings key',
  MAPPING_KEYS.every((key) => STANDARD_CHART.some((a) => a.map === key)),
  JSON.stringify(MAPPING_KEYS.filter((key) => !STANDARD_CHART.some((a) => a.map === key))));
ok('the chart covers every role a posting needs',
  ['inclusive', 'input-igst', 'input-cgst-sgst'].every((mode) =>
    requiredPostingKeys(mode).every((key) => STANDARD_CHART.some((a) => a.map === key))));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
