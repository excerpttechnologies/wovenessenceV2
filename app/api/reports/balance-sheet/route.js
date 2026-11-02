import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS } from '@/lib/screenPermission';
import { json, scopeOf } from '@/lib/reports';
import { balanceSheetFor } from '@/lib/accounting/books';
import { defaultRange, fyBounds } from '@/lib/accounting/calc';

/* /api/reports/balance-sheet

   Assets, liabilities and equity as at a date, with the current year's result
   added to equity as its own row. The income and expense accounts themselves
   are not on the sheet, so nothing is counted twice.

   `difference` is Assets - (Liabilities + Equity). It is zero when every
   posting balances; when it is not, the report says so instead of forcing the
   figures to agree. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const denied = await screenDenial({
    session,
    screen: SCREENS.ACCOUNTS_BALANCE_SHEET,
    action: ACTIONS.READ,
    businessId: scope.businessId,
    label: 'Accounts',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const range = defaultRange(scope.finYear);
  const bounds = fyBounds(scope.finYear);
  const from = sp.get('fromDate') || range.fromDate
    || (bounds ? bounds.start.toISOString().slice(0, 10) : '');
  const to = sp.get('toDate') || range.toDate || (bounds ? bounds.end.toISOString().slice(0, 10) : '');

  const result = await balanceSheetFor(scope, { from, to });

  return json({
    tiles: {
      totalAssets: result.totalAssets,
      totalLiabilities: result.totalLiabilities,
      totalEquity: result.totalEquity,
      difference: result.difference,
    },
    total: result.sections.reduce((sum, section) => sum + section.rows.length, 0),
    page: 1,
    pages: 1,
    perPage: 500,
    asAt: to,
    netProfit: result.netProfit,
    difference: result.difference,
    sections: result.sections.map((section) => ({
      rows: section.rows.map((row) => ({ ...row, group: section.title })),
      totals: { amount: section.total },
      count: section.rows.length,
    })),
  });
}
