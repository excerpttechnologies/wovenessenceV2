import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS } from '@/lib/screenPermission';
import { json, scopeOf } from '@/lib/reports';
import { trialBalanceFor } from '@/lib/accounting/books';
import { defaultRange, fyBounds } from '@/lib/accounting/calc';

/* /api/reports/trial-balance

   Opening, movement and closing for every account that has any of the three.
   A balanced set of books has identical closing debit and credit totals - the
   difference is shown rather than hidden, because a non-zero one is the
   single most useful thing this report can tell you. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const denied = await screenDenial({
    session,
    screen: SCREENS.ACCOUNTS_TRIAL_BALANCE,
    action: ACTIONS.READ,
    businessId: scope.businessId,
    label: 'Accounts',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const range = defaultRange(scope.finYear);
  const bounds = fyBounds(scope.finYear);
  const from = sp.get('fromDate') || range.fromDate || '';
  const to = sp.get('toDate') || range.toDate || (bounds ? bounds.end.toISOString().slice(0, 10) : '');

  const result = await trialBalanceFor(scope, { from, to });

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Math.max(1, Number(sp.get('perPage') || 25)));

  return json({
    tiles: {
      accounts: result.rows.length,
      closingDebit: result.totals.closingDebit,
      closingCredit: result.totals.closingCredit,
      difference: result.totals.closingDifference,
    },
    total: result.rows.length,
    page,
    pages: Math.max(1, Math.ceil(result.rows.length / perPage)),
    perPage,
    fromDate: from,
    toDate: to,
    sections: [{
      rows: result.rows.slice((page - 1) * perPage, page * perPage),
      totals: {
        openingDebit: result.totals.openingDebit,
        openingCredit: result.totals.openingCredit,
        periodDebit: result.totals.periodDebit,
        periodCredit: result.totals.periodCredit,
        closingDebit: result.totals.closingDebit,
        closingCredit: result.totals.closingCredit,
      },
      count: result.rows.length,
    }],
  });
}
