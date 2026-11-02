import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS } from '@/lib/screenPermission';
import { json, scopeOf } from '@/lib/reports';
import { gstLedgerFor } from '@/lib/accounting/books';
import { defaultRange, fyBounds } from '@/lib/accounting/calc';

/* /api/reports/gst-ledger

   The tax accounts' movement over a window: input GST debited (claimable) and
   output GST credited (payable), with the difference between them.

   WHICH ACCOUNTS COUNT. The accounts mapped on Accounting Settings come
   first; a business that never mapped them still sees its tax accounts, found
   by name. That name match is a READ allowance only - it never decides where
   a posting goes (lib/accounting/posting.js refuses an unmapped role). */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const denied = await screenDenial({
    session,
    screen: SCREENS.ACCOUNTS_GST_LEDGER,
    action: ACTIONS.READ,
    businessId: scope.businessId,
    label: 'Accounts',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const range = defaultRange(scope.finYear);
  const bounds = fyBounds(scope.finYear);
  const from = sp.get('fromDate') || range.fromDate || '';
  const to = sp.get('toDate') || range.toDate || (bounds ? bounds.end.toISOString().slice(0, 10) : '');

  const result = await gstLedgerFor(scope, { from, to });

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Math.max(1, Number(sp.get('perPage') || 25)));

  const input = result.rows.filter((row) => row.role === 'Input');
  const output = result.rows.filter((row) => row.role === 'Output');
  const sum = (rows, key) => Math.round(rows.reduce((total, row) => total + Math.round(Number(row[key]) * 100), 0)) / 100;

  return json({
    tiles: {
      inputDebit: sum(input, 'debit'),
      outputCredit: sum(output, 'credit'),
      net: Math.round((sum(output, 'credit') - sum(input, 'debit')) * 100) / 100,
      accounts: result.rows.length,
    },
    total: result.rows.length,
    page,
    pages: Math.max(1, Math.ceil(result.rows.length / perPage)),
    perPage,
    fromDate: from,
    toDate: to,
    mode: result.mode,
    note: result.mapped
      ? ''
      : 'No tax accounts are mapped on Accounting Settings, so this report found them by name. '
        + 'Map them to be sure the list is complete.',
    sections: [{
      rows: result.rows.slice((page - 1) * perPage, page * perPage),
      totals: {
        debit: result.totals.debit,
        credit: result.totals.credit,
        closing: result.totals.closing,
      },
      count: result.rows.length,
    }],
  });
}
