import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS } from '@/lib/screenPermission';
import { json, scopeOf } from '@/lib/reports';
import { bankCashFor } from '@/lib/accounting/books';
import { defaultRange, fyBounds } from '@/lib/accounting/calc';

/* /api/reports/bank-cash

   One table per cash / bank account, each with its own opening balance and
   running balance - the way a cash book is kept. Money IN is a debit, money
   OUT a credit, and the balance carries from the account's opening position.

   The accounts come from Accounting Settings, with a name fallback so an
   unconfigured business still sees something rather than an empty screen. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const denied = await screenDenial({
    session,
    screen: SCREENS.ACCOUNTS_BANK_CASH,
    action: ACTIONS.READ,
    businessId: scope.businessId,
    label: 'Accounts',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const range = defaultRange(scope.finYear);
  const bounds = fyBounds(scope.finYear);
  const from = sp.get('fromDate') || range.fromDate || '';
  const to = sp.get('toDate') || range.toDate || (bounds ? bounds.end.toISOString().slice(0, 10) : '');

  const result = await bankCashFor(scope, { from, to });

  const totalOf = (kind, key) => Math.round(result.sections
    .filter((section) => !kind || section.kind === kind)
    .reduce((sum, section) => sum + Math.round(Number(section.totals[key] || 0) * 100), 0)) / 100;

  return json({
    tiles: {
      cash: totalOf('Cash', 'closing'),
      bank: totalOf('Bank', 'closing'),
      receipts: totalOf(null, 'debit'),
      payments: totalOf(null, 'credit'),
    },
    total: result.sections.reduce((sum, section) => sum + section.rows.length, 0),
    page: 1,
    pages: 1,
    perPage: 500,
    fromDate: from,
    toDate: to,
    note: result.sections.length ? '' : 'No cash or bank account is mapped on Accounting Settings.',
    sections: result.sections.map((section) => ({
      title: section.title,
      rows: section.rows.map((row) => ({ ...row, account: section.accountName })),
      totals: section.totals,
      count: section.rows.length,
    })),
  });
}
