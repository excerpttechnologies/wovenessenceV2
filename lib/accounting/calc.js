/* ==========================================================================
   THE ACCOUNTING CALCULATION ENGINE - pure functions, no database.

   Every figure the Accounts module shows comes through here: the ledger's
   running balance, the trial balance columns, the profit & loss result, the
   balance sheet totals. The routes fetch rows and delegate the arithmetic to
   this file, so one rule cannot be applied two different ways on two screens.

   MONEY. Two decimals, and every comparison is made in integer PAISE. Adding
   rupees as floats is how a journal of 0.1 + 0.2 fails to balance against
   0.3; comparing Math.round(x * 100) cannot. Formatting never happens here -
   nothing that leaves this file is a currency string, which is what keeps
   formatted text out of the database and out of the sums.

   SIGN CONVENTION (the whole module depends on it):
     positive = Dr, negative = Cr, zero = Nil
   An account's stored openingBalance already follows it, and it is never
   normalised on read.
   ========================================================================== */

export const FIN_YEAR_RE = /^\d{4}-\d{4}$/;

const num = (value) => {
  const parsed = typeof value === 'number' ? value : parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* two decimals, the ERP's monetary rounding */
export function r2(value) {
  return Math.round((num(value) + Number.EPSILON) * 100) / 100;
}

/* rupees -> integer paise. The only safe basis for a money comparison. */
export function toPaise(value) {
  return Math.round(Number(num(value).toFixed(2)) * 100);
}

export function fromPaise(paise) {
  return Math.round(num(paise)) / 100;
}

/* Dr / Cr / Nil for a signed balance */
export function balanceType(balance) {
  const paise = toPaise(balance);
  if (paise > 0) return 'Dr';
  if (paise < 0) return 'Cr';
  return 'Nil';
}

/* A signed balance split into the two columns a report prints. */
export function splitBalance(balance) {
  const value = r2(balance);
  return {
    debit: value > 0 ? value : 0,
    credit: value < 0 ? Math.abs(value) : 0,
  };
}

/* Balance as a person writes it: "₹1,25,000.00 Dr". */
export function inr(value) {
  const amount = r2(value);
  const body = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount));
  return (amount < 0 ? '-' : '') + '\u20B9' + body;
}

export function balanceText(balance) {
  const type = balanceType(balance);
  if (type === 'Nil') return inr(0) + ' Nil';
  return inr(Math.abs(r2(balance))) + ' ' + type;
}

/* ---- financial year ------------------------------------------------------
   The label the top bar holds is "2026-2027": 1 April 2026 to 31 March 2027,
   inclusive at both ends. Nothing below hardcodes a year. */

export function fyBounds(finYear) {
  const label = String(finYear || '');
  if (!FIN_YEAR_RE.test(label)) return null;
  const startYear = Number(label.slice(0, 4));
  const endYear = Number(label.slice(5, 9));
  if (!(endYear === startYear + 1)) return null;
  const start = new Date(startYear, 3, 1, 0, 0, 0, 0); // 1 April
  const end = new Date(endYear, 2, 31, 23, 59, 59, 999); // 31 March
  return { label, startYear, endYear, start, end };
}

export function isInFinYear(date, finYear) {
  const bounds = fyBounds(finYear);
  if (!bounds) return false;
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return false;
  return d >= bounds.start && d <= bounds.end;
}

/* yyyy-mm-dd for an <input type="date"> */
export function isoDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* The window a report opens on: the whole financial year to date, never
   outside it. */
export function defaultRange(finYear) {
  const bounds = fyBounds(finYear);
  if (!bounds) return { fromDate: '', toDate: '' };
  const today = new Date();
  const to = today < bounds.start ? bounds.start : (today > bounds.end ? bounds.end : today);
  return { fromDate: isoDate(bounds.start), toDate: isoDate(to) };
}

/* ---- journals ----------------------------------------------------------- */

/* Debit and credit totals, computed independently (never totalCredit =
   totalDebit). Returned in rupees, with the difference in paise. */
export function journalTotals(lines = []) {
  let debitPaise = 0;
  let creditPaise = 0;
  (Array.isArray(lines) ? lines : []).forEach((line) => {
    debitPaise += toPaise(line?.debit);
    creditPaise += toPaise(line?.credit);
  });
  return {
    totalDebit: fromPaise(debitPaise),
    totalCredit: fromPaise(creditPaise),
    differencePaise: debitPaise - creditPaise,
    totalDebitPaise: debitPaise,
    totalCreditPaise: creditPaise,
  };
}

/* The rules a journal must satisfy before it may be written. `lines` are the
   request's lines (account ids are checked against the database elsewhere).

   Returns a list of problems, empty when the journal is good. */
export function journalProblems(lines) {
  const list = Array.isArray(lines) ? lines : [];
  const problems = [];

  if (list.length < 2) problems.push('A journal needs at least two lines.');

  let hasDebit = false;
  let hasCredit = false;

  list.forEach((line, index) => {
    const where = 'Line ' + (index + 1);
    if (!line || !String(line.accountId || '').trim()) {
      problems.push(where + ': choose an account.');
    }
    const debit = num(line?.debit);
    const credit = num(line?.credit);
    if (debit < 0 || credit < 0) problems.push(where + ': debit and credit cannot be negative.');
    if (debit > 0 && credit > 0) problems.push(where + ': a line cannot carry both a debit and a credit.');
    if (toPaise(debit) === 0 && toPaise(credit) === 0) {
      problems.push(where + ': enter a debit or a credit.');
    }
    if (toPaise(debit) > 0) hasDebit = true;
    if (toPaise(credit) > 0) hasCredit = true;
  });

  if (list.length >= 2 && !hasDebit) problems.push('A journal needs at least one debit line.');
  if (list.length >= 2 && !hasCredit) problems.push('A journal needs at least one credit line.');

  const totals = journalTotals(list);
  if (totals.differencePaise !== 0) {
    problems.push(
      'Total debit (' + totals.totalDebit.toFixed(2) + ') must equal total credit ('
      + totals.totalCredit.toFixed(2) + ').'
    );
  }

  return problems;
}

/* A reversal is the same journal with both sides swapped. Built here so a
   reversal can never be an approximation of its original. */
export function reversalLines(lines = []) {
  return (Array.isArray(lines) ? lines : []).map((line) => ({
    accountId: line.accountId,
    accountName: line.accountName || '',
    debit: r2(line.credit),
    credit: r2(line.debit),
    narration: line.narration || '',
  }));
}

/* ---- ledger -------------------------------------------------------------

   `opening` is the brought-forward balance (already includes the account's
   own opening balance). Each row's balance is the one before it plus this
   row's debit minus its credit - never restarted at zero, which is what makes
   page two of a ledger continue page one instead of repeating it. */

export function ledgerRows({ opening = 0, rows = [] }) {
  let runningPaise = toPaise(opening);
  let debitPaise = 0;
  let creditPaise = 0;

  const transactions = (Array.isArray(rows) ? rows : []).map((row, index) => {
    const debit = r2(row.debit);
    const credit = r2(row.credit);
    debitPaise += toPaise(debit);
    creditPaise += toPaise(credit);
    runningPaise += toPaise(debit) - toPaise(credit);
    return {
      ...row,
      /* a stable key for React even when one journal carries the account twice */
      rowKey: String(row.id || row._id || '') + ':' + index,
      debit,
      credit,
      balance: fromPaise(runningPaise),
      balanceType: balanceType(fromPaise(runningPaise)),
    };
  });

  const closing = fromPaise(runningPaise);
  return {
    transactions,
    totalDebit: fromPaise(debitPaise),
    totalCredit: fromPaise(creditPaise),
    closingBalance: closing,
    closingBalanceType: balanceType(closing),
  };
}

/* ---- trial balance ------------------------------------------------------ */

export function trialBalanceRows({ accounts = [], openingByAccount = {}, movementByAccount = {} }) {
  return accounts.map((account) => {
    const key = String(account._id || account.accountId);
    const opening = r2(openingByAccount[key] ?? account.openingBalance ?? 0);
    const movement = movementByAccount[key] || { debit: 0, credit: 0 };
    const periodDebit = r2(movement.debit);
    const periodCredit = r2(movement.credit);
    const closing = fromPaise(toPaise(opening) + toPaise(periodDebit) - toPaise(periodCredit));
    const openSplit = splitBalance(opening);
    const closeSplit = splitBalance(closing);

    return {
      _id: key,
      accountId: key,
      accountCode: account.accountCode || '',
      accountName: account.accountName || '',
      accountType: account.accountType || '',
      openingDebit: openSplit.debit,
      openingCredit: openSplit.credit,
      periodDebit,
      periodCredit,
      closingDebit: closeSplit.debit,
      closingCredit: closeSplit.credit,
    };
  });
}

export function trialBalanceTotals(rows = []) {
  const add = (key) => rows.reduce((sum, row) => sum + toPaise(row[key]), 0);
  const totals = {
    openingDebit: fromPaise(add('openingDebit')),
    openingCredit: fromPaise(add('openingCredit')),
    periodDebit: fromPaise(add('periodDebit')),
    periodCredit: fromPaise(add('periodCredit')),
    closingDebit: fromPaise(add('closingDebit')),
    closingCredit: fromPaise(add('closingCredit')),
  };
  totals.closingDifference = fromPaise(
    toPaise(totals.closingDebit) - toPaise(totals.closingCredit)
  );
  totals.periodDifference = fromPaise(
    toPaise(totals.periodDebit) - toPaise(totals.periodCredit)
  );
  return totals;
}

/* ---- profit & loss ------------------------------------------------------

   Income is Cr-positive, expense is Dr-positive: an income account with
   5000 of credits and 500 of debits contributes 4500, an expense account
   with 3000 of debits and 200 of credits contributes 2800. A negative result
   is left as it is rather than clamped - a supplier refund that turns an
   expense account negative is real, and hiding it would make the total
   disagree with the ledger. */

export function profitAndLossSections({ accounts = [], movementByAccount = {} }) {
  const income = [];
  const expenses = [];

  accounts.forEach((account) => {
    const key = String(account._id);
    const movement = movementByAccount[key] || { debit: 0, credit: 0 };
    const type = account.accountType;

    if (type === 'Income') {
      income.push({
        _id: key,
        accountId: key,
        accountCode: account.accountCode || '',
        accountName: account.accountName || '',
        group: account.group || 'Other Income',
        amount: fromPaise(toPaise(movement.credit) - toPaise(movement.debit)),
      });
    } else if (type === 'Expense') {
      expenses.push({
        _id: key,
        accountId: key,
        accountCode: account.accountCode || '',
        accountName: account.accountName || '',
        group: account.group || 'Other Expenses',
        amount: fromPaise(toPaise(movement.debit) - toPaise(movement.credit)),
      });
    }
  });

  const sum = (rows) => fromPaise(rows.reduce((total, row) => total + toPaise(row.amount), 0));
  const totalIncome = sum(income);
  const totalExpenses = sum(expenses);
  const netPaise = toPaise(totalIncome) - toPaise(totalExpenses);

  return {
    sections: [
      { key: 'income', title: 'Income', rows: income, total: totalIncome },
      { key: 'expenses', title: 'Expenses', rows: expenses, total: totalExpenses },
    ],
    totalIncome,
    totalExpenses,
    netProfit: netPaise > 0 ? fromPaise(netPaise) : 0,
    netLoss: netPaise < 0 ? fromPaise(-netPaise) : 0,
    net: fromPaise(netPaise),
  };
}

/* ---- balance sheet ------------------------------------------------------

   Assets read Dr-positive, liabilities and equity Cr-positive (so a credit
   balance is shown as a positive figure rather than a negative one).

   The current year's profit is added to equity as its own line. The income
   and expense accounts themselves are NOT in the balance sheet, so nothing
   is counted twice - the profit row is the whole of their effect, and any
   retained-earnings account a business maps is a separate balance of its
   own. */

export function balanceSheetSections({ accounts = [], balanceByAccount = {}, netProfit = 0 }) {
  const assets = [];
  const liabilities = [];
  const equity = [];

  accounts.forEach((account) => {
    const key = String(account._id);
    const balance = r2(balanceByAccount[key] ?? account.openingBalance ?? 0);
    const target = account.accountType === 'Asset' ? assets
      : account.accountType === 'Liability' ? liabilities
        : account.accountType === 'Equity' ? equity : null;
    if (!target) return;

    /* Dr-positive for assets, Cr-positive for the other two */
    const amount = account.accountType === 'Asset' ? balance : -balance;
    target.push({
      _id: key,
      accountId: key,
      accountCode: account.accountCode || '',
      accountName: account.accountName || '',
      group: account.group || account.accountType,
      amount,
    });
  });

  const netPaise = toPaise(netProfit);
  if (netPaise !== 0) {
    equity.push({
      _id: 'current-year-result',
      accountCode: '',
      accountName: netPaise > 0 ? 'Profit for the year' : 'Loss for the year',
      group: 'Current Year Profit / Loss',
      amount: netPaise > 0 ? fromPaise(netPaise) : fromPaise(-netPaise) * (netPaise < 0 ? 1 : 1),
      isResult: true,
      /* a loss reduces equity, so it is carried as a negative amount */
      signedAmount: fromPaise(netPaise),
    });
    const row = equity[equity.length - 1];
    row.amount = fromPaise(netPaise);
  }

  const sum = (rows) => fromPaise(rows.reduce((total, row) => total + toPaise(row.amount), 0));
  const totalAssets = sum(assets);
  const totalLiabilities = sum(liabilities);
  const totalEquity = sum(equity);
  const totalLiabilitiesAndEquity = fromPaise(toPaise(totalLiabilities) + toPaise(totalEquity));

  return {
    sections: [
      { key: 'assets', title: 'Assets', rows: assets, total: totalAssets },
      { key: 'liabilities', title: 'Liabilities', rows: liabilities, total: totalLiabilities },
      { key: 'equity', title: 'Equity', rows: equity, total: totalEquity },
    ],
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity,
    difference: fromPaise(toPaise(totalAssets) - toPaise(totalLiabilitiesAndEquity)),
  };
}

/* Groups rows under their chart parent, for an expandable report. Rows keep
   their own identity; the group is a heading, not a substitute for them. */
export function groupRows(rows = []) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = String(row.group || 'Other');
    if (!groups.has(key)) groups.set(key, { key, title: key, rows: [], total: 0, totalPaise: 0 });
    const group = groups.get(key);
    group.rows.push(row);
    group.totalPaise += toPaise(row.amount);
  });
  return [...groups.values()].map((group) => ({
    key: group.key,
    title: group.title,
    rows: group.rows,
    total: fromPaise(group.totalPaise),
  }));
}
