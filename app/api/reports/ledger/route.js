import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import AccountsMaster from '@/models/AccountsMaster';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS } from '@/lib/screenPermission';
import { json, scopeOf } from '@/lib/reports';
import { ledgerFor } from '@/lib/accounting/books';
import { defaultRange, r2, fyBounds } from '@/lib/accounting/calc';

/* /api/reports/ledger - one account's book for a date range.

   The running balance starts at the account's opening balance plus everything
   posted before the range, and continues across pages (the page is sliced
   after the balances are computed) - so page two is the continuation of page
   one, not a second statement starting from zero. */

const PER_PAGE = 25;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const denied = await screenDenial({
    session,
    screen: SCREENS.ACCOUNTS_LEDGER,
    action: ACTIONS.READ,
    businessId: scope.businessId,
    label: 'Accounts',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const accountId = sp.get('accountId');
  if (!accountId) return json({ error: 'Choose an account to see its ledger.' }, 422);
  if (!isValidObjectId(accountId)) return json({ error: 'That account reference is not valid.' }, 422);

  const filter = { _id: accountId };
  if (scope.businessId) filter.businessId = scope.businessId;
  if (scope.locationId) {
    filter.$or = [{ locationId: scope.locationId }, { locationId: null }, { locationId: { $exists: false } }];
  }
  const account = await AccountsMaster.findOne(filter)
    .select('accountCode accountName accountType openingBalance')
    .lean();
  if (!account) return json({ error: 'That account is not in this business.' }, 404);

  const range = defaultRange(scope.finYear);
  const bounds = fyBounds(scope.finYear);
  const from = sp.get('fromDate') || range.fromDate || '';
  const to = sp.get('toDate') || range.toDate || (bounds ? bounds.end.toISOString().slice(0, 10) : '');

  const result = await ledgerFor(scope, account, { from, to });

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Math.max(1, Number(sp.get('perPage') || PER_PAGE)));
  const rows = result.transactions.slice((page - 1) * perPage, page * perPage);

  return json({
    tiles: {
      opening: result.opening,
      debit: result.totalDebit,
      credit: result.totalCredit,
      closing: result.closingBalance,
    },
    total: result.transactions.length,
    page,
    pages: Math.max(1, Math.ceil(result.transactions.length / perPage)),
    perPage,
    account: {
      accountCode: account.accountCode || '',
      accountName: account.accountName || '',
      accountType: account.accountType || '',
      openingBalance: r2(account.openingBalance),
    },
    openingBalance: result.opening,
    closingBalance: result.closingBalance,
    closingBalanceType: result.closingBalanceType,
    sections: [{
      rows,
      totals: { debit: result.totalDebit, credit: result.totalCredit },
      count: result.transactions.length,
    }],
  });
}
