import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS } from '@/lib/screenPermission';
import { json, scopeOf } from '@/lib/reports';
import { profitAndLossFor } from '@/lib/accounting/books';
import { defaultRange, fyBounds } from '@/lib/accounting/calc';

/* /api/reports/profit-loss

   Income less expenses over a window. Income is credit-positive and expense
   debit-positive, so a refund that turns an expense account negative stays
   negative rather than being clamped - clamping it would make the total
   disagree with the ledger it came from. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const denied = await screenDenial({
    session,
    screen: SCREENS.ACCOUNTS_PROFIT_LOSS,
    action: ACTIONS.READ,
    businessId: scope.businessId,
    label: 'Accounts',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const range = defaultRange(scope.finYear);
  const bounds = fyBounds(scope.finYear);
  const from = sp.get('fromDate') || range.fromDate || '';
  const to = sp.get('toDate') || range.toDate || (bounds ? bounds.end.toISOString().slice(0, 10) : '');

  const result = await profitAndLossFor(scope, { from, to });

  return json({
    tiles: {
      totalIncome: result.totalIncome,
      totalExpenses: result.totalExpenses,
      netProfit: result.netProfit,
      netLoss: result.netLoss,
    },
    total: result.sections.reduce((sum, section) => sum + section.rows.length, 0),
    page: 1,
    pages: 1,
    perPage: 500,
    fromDate: from,
    toDate: to,
    netProfit: result.netProfit,
    netLoss: result.netLoss,
    net: result.net,
    sections: result.sections.map((section) => ({
      rows: section.rows.map((row) => ({ ...row, group: section.title })),
      totals: { amount: section.total },
      count: section.rows.length,
    })),
  });
}
