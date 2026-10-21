import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import PosInvoice from '@/models/PosInvoice';
import PosCounter from '@/models/PosCounter';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, linesOf, lineNet,
} from '@/lib/reports';

/* /api/reports/pos-summary - read-only.

   Takings per cashier for a window.

   ---------------------------------------------------------------------------
   WHAT "CASHIER" MEANS HERE. PosInvoice carries no cashier or user field - it
   has counterId and nothing else identifying who rang the sale. The only
   record of a person on a till in this project is CashRegister.openedBy, and
   that belongs to the register session rather than to the bill.

   So this groups by POS COUNTER and labels the column Cashier Name, which is
   the closest honest reading of the data. If a cashier field is added to
   PosInvoice later, change the two `counterId` references below and nothing
   else moves.

   It will also report nothing at all until the POS till starts posting -
   PosTill issues only GET requests today, so no PosInvoice is ever written.
   That is why the deployed screen shows "Total Cashiers: 0" too.
   --------------------------------------------------------------------------- */

const taxableOf = (d) => r2(
  num(d.taxableValue) || linesOf(d).reduce((a, l) => a + lineNet(l), 0)
);

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const bills = await PosInvoice.find({
    ...scopeFilter(scope),
    ...dateRange(sp, 'date'),
  }).limit(5000).lean();

  /* the Casher filter is a multi-select of counters, comma-joined */
  const wanted = String(sp.get('counterId') || '')
    .split(',').map((s) => s.trim()).filter((s) => isValidObjectId(s));

  const counterIds = [...new Set(bills.map((b) => b.counterId).filter(Boolean).map(String))];
  const counters = counterIds.length
    ? await PosCounter.find({ _id: { $in: counterIds } }).select('counterName').lean()
    : [];
  const counterName = new Map(counters.map((c) => [String(c._id), c.counterName || '']));

  const acc = new Map();

  bills.forEach((b) => {
    const key = String(b.counterId || '');
    if (wanted.length && !wanted.includes(key)) return;

    if (!acc.has(key)) acc.set(key, { key, subTotal: 0, taxable: 0, net: 0 });
    const row = acc.get(key);

    const net = r2(b.totalAmount);
    const taxable = taxableOf(b);
    row.net += net;
    row.taxable += taxable;
    /* Sub Total is the net of tax figure the deployed screen prints under
       "Sub Total (Net Sales)" - the bill before its tax component */
    row.subTotal += taxable || net;
  });

  const rows = [...acc.values()].map((r) => ({
    _id: r.key || '(no counter)',
    cashierName: counterName.get(r.key) || '(unassigned)',
    subTotal: r2(r.subTotal),
    taxable: r2(r.taxable),
    net: r2(r.net),
  })).sort((a, b) => b.net - a.net);

  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));

  return json({
    tiles: {},
    sections: [{
      rows,
      count: rows.length,
      totals: { subTotal: sum('subTotal'), taxable: sum('taxable'), net: sum('net') },
    }],
    total: rows.length,
    pages: 1,
    page: 1,
  });
}
