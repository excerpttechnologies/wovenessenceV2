import mongoose from 'mongoose';
import JournalEntry from '@/models/JournalEntry';
import AccountsMaster from '@/models/AccountsMaster';
import { loadSettings, mappedIds, MAPPING_LABELS } from './settings';
import {
  r2, toPaise, fromPaise, balanceType, splitBalance, ledgerRows,
  trialBalanceRows, trialBalanceTotals, profitAndLossSections,
  balanceSheetSections, groupRows,
} from './calc';

/* ==========================================================================
   READING THE BOOKS.

   Every accounting report is built from two reads and one rounding rule:

     1. the CHART (AccountsMaster rows in scope)
     2. the POSTINGS (journal lines, POSTED only) before `from` and between
        `from` and `to`

   A reversed journal is excluded by its own status, while its reversal is a
   posted journal that offsets it - so a cancelled document nets to zero
   without any arithmetic being special-cased here.

   Balances are signed (positive = Dr, negative = Cr) all the way through,
   and only split into Dr / Cr columns at the edge, by lib/accounting/calc.js.
   ========================================================================== */

const isId = (value) => mongoose.isValidObjectId(String(value || ''));
const objectId = (value) => new mongoose.Types.ObjectId(String(value));

/* The match every report starts from. A location narrows to that location's
   postings; an unscoped report reads the whole business. */
export function journalMatch(scope) {
  const match = { status: 'posted' };
  if (isId(scope.businessId)) match.businessId = objectId(scope.businessId);
  if (isId(scope.locationId)) match.locationId = objectId(scope.locationId);
  return match;
}

export function dateWindow(from, to) {
  const window = {};
  if (from) window.$gte = new Date(from);
  if (to) window.$lte = new Date(String(to).length <= 10 ? to + 'T23:59:59.999' : to);
  return window;
}

export async function chart(scope, { types = [], activeOnly = false } = {}) {
  const filter = {};
  if (isId(scope.businessId)) filter.businessId = scope.businessId;
  if (isId(scope.locationId)) {
    filter.$or = [{ locationId: scope.locationId }, { locationId: null }, { locationId: { $exists: false } }];
  }
  if (types.length) filter.accountType = { $in: types };
  if (activeOnly) filter.isActive = { $ne: false };

  return AccountsMaster.find(filter)
    .select('accountCode accountName accountType parentAccountId openingBalance isActive')
    .sort({ accountType: 1, accountCode: 1, accountName: 1 })
    .lean();
}

/* Debit / credit sums per account for a date window. */
export async function sumsByAccount(scope, window = {}) {
  const match = journalMatch(scope);
  if (Object.keys(window).length) match.journalDate = window;

  const rows = await JournalEntry.aggregate([
    { $match: match },
    { $unwind: '$lines' },
    {
      $group: {
        _id: '$lines.accountId',
        debit: { $sum: '$lines.debit' },
        credit: { $sum: '$lines.credit' },
      },
    },
  ]);

  const map = new Map();
  rows.forEach((row) => {
    map.set(String(row._id), { debit: r2(row.debit), credit: r2(row.credit) });
  });
  return map;
}

/* Opening + movement for a report window, keyed by account id.

   `opening` is everything posted BEFORE fromDate plus the account's own
   stored opening balance; `movement` is the window itself. Both are
   { debit, credit } - a signed balance is derived, never stored. */
export async function balancesFor(scope, { from, to }) {
  const [before, within] = await Promise.all([
    from ? sumsByAccount(scope, { $lt: new Date(from) }) : Promise.resolve(new Map()),
    sumsByAccount(scope, dateWindow(from, to)),
  ]);
  return { before, within };
}

/* The signed opening balance for one account: stored opening + everything
   posted before the window. */
export function openingOf(account, before) {
  const key = String(account._id);
  const prior = before.get(key) || { debit: 0, credit: 0 };
  return fromPaise(toPaise(account.openingBalance) + toPaise(prior.debit) - toPaise(prior.credit));
}

export function closingOf(account, before, within) {
  const key = String(account._id);
  const move = within.get(key) || { debit: 0, credit: 0 };
  return fromPaise(toPaise(openingOf(account, before)) + toPaise(move.debit) - toPaise(move.credit));
}

/* ---- ledger ------------------------------------------------------------- */

/* One account's postings, with the running balance that continues across
   pages. `rows` is every matching line; the route paginates the result. */
export async function ledgerFor(scope, account, { from, to }) {
  const match = journalMatch(scope);
  match['lines.accountId'] = objectId(account._id);
  const window = dateWindow(from, to);
  if (Object.keys(window).length) match.journalDate = window;

  const journals = await JournalEntry.find(match)
    .sort({ journalDate: 1, createdAt: 1 })
    .limit(10000)
    .select('journalDate referenceNo narration lines source sourceRefNo kind')
    .lean();

  const rows = [];
  journals.forEach((journal) => {
    (journal.lines || [])
      .filter((line) => String(line.accountId) === String(account._id))
      .forEach((line, index) => {
        rows.push({
          id: String(journal._id) + ':' + index,
          date: journal.journalDate,
          reference: journal.referenceNo || journal.sourceRefNo || '',
          narration: line.narration || journal.narration || '',
          source: journal.source,
          kind: journal.kind,
          debit: r2(line.debit),
          credit: r2(line.credit),
        });
      });
  });

  const before = from ? await sumsByAccount(scope, { $lt: new Date(from) }) : new Map();
  const opening = openingOf(account, before);
  return { opening, ...ledgerRows({ opening, rows }) };
}

/* ---- trial balance ------------------------------------------------------ */

export async function trialBalanceFor(scope, { from, to }) {
  const [accounts, { before, within }] = await Promise.all([
    chart(scope, { activeOnly: false }),
    balancesFor(scope, { from, to }),
  ]);

  const openingByAccount = {};
  accounts.forEach((account) => {
    openingByAccount[String(account._id)] = openingOf(account, before);
  });

  const movementByAccount = {};
  within.forEach((value, key) => { movementByAccount[key] = value; });

  const rows = trialBalanceRows({ accounts, openingByAccount, movementByAccount })
    /* An account that has never moved and carries no opening is noise on a
       trial balance; it stays in the chart, not in the report. */
    .filter((row) => toPaise(row.openingDebit) || toPaise(row.openingCredit)
      || toPaise(row.periodDebit) || toPaise(row.periodCredit));

  return { rows, totals: trialBalanceTotals(rows) };
}

/* ---- profit & loss ------------------------------------------------------ */

export async function profitAndLossFor(scope, { from, to }) {
  const [accounts, within] = await Promise.all([
    chart(scope, { types: ['Income', 'Expense'], activeOnly: false }),
    sumsByAccount(scope, dateWindow(from, to)),
  ]);

  const movementByAccount = {};
  within.forEach((value, key) => { movementByAccount[key] = value; });

  /* A chart has no group column; the account's TYPE is the only honest
     heading, so income and expense rows are grouped beneath it. */
  const result = profitAndLossSections({ accounts, movementByAccount });
  return {
    ...result,
    sections: result.sections.map((section) => ({
      ...section,
      groups: groupRows(section.rows),
    })),
  };
}

/* ---- balance sheet ------------------------------------------------------ */

export async function balanceSheetFor(scope, { from, to }) {
  const [accounts, { before, within }] = await Promise.all([
    chart(scope, { types: ['Asset', 'Liability', 'Equity'], activeOnly: false }),
    balancesFor(scope, { from, to }),
  ]);

  const balanceByAccount = {};
  accounts.forEach((account) => {
    balanceByAccount[String(account._id)] = closingOf(account, before, within);
  });

  /* The year's result comes from the SAME window as the balance sheet, so the
     sheet balances at the date it is printed for. */
  const pnl = await profitAndLossFor(scope, { from, to });
  const net = fromPaise(toPaise(pnl.totalIncome) - toPaise(pnl.totalExpenses));

  const result = balanceSheetSections({ accounts, balanceByAccount, netProfit: net });
  return {
    ...result,
    netProfit: net,
    sections: result.sections.map((section) => ({
      ...section,
      groups: groupRows(section.rows),
    })),
  };
}

/* ---- GST ledger --------------------------------------------------------- */

/* Which accounts are treated as tax accounts: the ones mapped on Accounting
   Settings, and - for a business that never mapped them - any account whose
   own name says CGST / SGST / IGST. The second is a READ allowance only; it
   never decides where a posting goes. */
export async function taxAccounts(scope, settings) {
  const ids = mappedIds(settings);
  const mapped = ['inputCgst', 'inputSgst', 'inputIgst', 'outputCgst', 'outputSgst', 'outputIgst']
    .filter((key) => ids[key])
    .map((key) => ({ key, accountId: ids[key], role: key.startsWith('input') ? 'Input' : 'Output' }));

  const accounts = await chart(scope, { activeOnly: false });
  const byId = new Map(accounts.map((a) => [String(a._id), a]));

  const rows = [];
  const seen = new Set();
  mapped.forEach((entry) => {
    const account = byId.get(entry.accountId);
    /* one row per ACCOUNT: a business that maps the same account as two
       roles gets one line, not the same movement listed twice */
    if (!account || seen.has(entry.accountId)) return;
    seen.add(entry.accountId);
    rows.push({ account, role: entry.role, mapped: true });
  });

  accounts.forEach((account) => {
    if (seen.has(String(account._id))) return;
    if (!/cgst|sgst|igst|gst/i.test(String(account.accountName || ''))) return;
    rows.push({
      account,
      role: /output/i.test(account.accountName) ? 'Output' : 'Input',
      mapped: false,
    });
  });

  return rows;
}

export async function gstLedgerFor(scope, { from, to }) {
  const [settings, within, before] = await Promise.all([
    loadSettings(scope),
    sumsByAccount(scope, dateWindow(from, to)),
    from ? sumsByAccount(scope, { $lt: new Date(from) }) : Promise.resolve(new Map()),
  ]);

  const accounts = await taxAccounts(scope, settings);
  const rows = accounts.map(({ account, role, mapped }) => {
    const key = String(account._id);
    const move = within.get(key) || { debit: 0, credit: 0 };
    return {
      _id: key,
      accountId: key,
      accountCode: account.accountCode || '',
      accountName: account.accountName || '',
      role,
      mapped: mapped ? 'Mapped' : 'Name match',
      opening: openingOf(account, before),
      debit: r2(move.debit),
      credit: r2(move.credit),
      closing: closingOf(account, before, within),
    };
  });

  const sum = (key) => fromPaise(rows.reduce((total, row) => total + toPaise(row[key]), 0));
  return {
    rows,
    totals: {
      debit: sum('debit'),
      credit: sum('credit'),
      closing: sum('closing'),
    },
    mode: settings?.gstPostingMode || 'inclusive',
    mapped: accounts.some((entry) => entry.mapped),
  };
}

/* ---- bank & cash -------------------------------------------------------- */

/* The accounts a bank / cash book reads: the mapped Cash and Bank accounts,
   plus any account whose name says cash or bank when nothing is mapped. A
   posting is never routed by this list - see the note in taxAccounts. */
export async function moneyAccounts(scope, settings) {
  const ids = mappedIds(settings);
  const accounts = await chart(scope, { activeOnly: false });
  const byId = new Map(accounts.map((a) => [String(a._id), a]));
  const out = [];
  const seen = new Set();

  [['cash', 'Cash'], ['bank', 'Bank']].forEach(([key, kind]) => {
    const account = ids[key] ? byId.get(ids[key]) : null;
    /* An account mapped as BOTH cash and bank is one account: two sections
       and a receipt counted twice would both be wrong. */
    if (!account || seen.has(String(account._id))) return;
    seen.add(String(account._id));
    out.push({ account, kind });
  });

  accounts.forEach((account) => {
    if (seen.has(String(account._id))) return;
    if (account.accountType !== 'Asset') return;
    if (!/\bcash\b|\bbank\b/i.test(String(account.accountName || ''))) return;
    out.push({ account, kind: /\bcash\b/i.test(account.accountName) ? 'Cash' : 'Bank' });
  });

  return out;
}

export async function bankCashFor(scope, { from, to }) {
  const settings = await loadSettings(scope);
  const accounts = await moneyAccounts(scope, settings);
  const before = from ? await sumsByAccount(scope, { $lt: new Date(from) }) : new Map();

  const sections = [];
  for (const { account, kind } of accounts) {
    // eslint-disable-next-line no-await-in-loop
    const ledger = await ledgerFor(scope, account, { from, to });
    sections.push({
      kind,
      accountId: String(account._id),
      accountName: account.accountName || '',
      title: kind + ' - ' + (account.accountName || ''),
      rows: ledger.transactions,
      totals: {
        opening: openingOf(account, before),
        debit: ledger.totalDebit,
        credit: ledger.totalCredit,
        closing: ledger.closingBalance,
      },
      count: ledger.transactions.length,
    });
  }

  return { sections, accounts: accounts.map((a) => ({ ...a.account, kind: a.kind })) };
}

export { balanceType, splitBalance, MAPPING_LABELS };
