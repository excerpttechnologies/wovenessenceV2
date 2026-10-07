import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import Voucher from '@/models/Voucher';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
  ledgerBuckets, bucketFor,
} from '@/lib/reports';

/* /api/reports/receipt-voucher-report - read-only.

   Money in. One row per Receipt Voucher, with the amount split across the
   rails it arrived on.

   A voucher line names a LEDGER, not a rail, so the split is derived: each
   non-party line's ledger is classified from its own name and its group
   chain (ledgerBuckets in lib/reports.js). "HDFC Bank" is Bank, "Cash on
   Hand" is Cash, "PhonePe" is UPI.

   Advance Amount is the part of the voucher not yet allocated against an
   invoice. Allocation was never built - Voucher.adjustedAmount is always 0 -
   so today that is the whole voucher and the status column always reads
   "Advance". The three states are computed properly so the column is correct
   the moment allocation lands. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const filter = {
    type: 'Receipt',
    ...scopeFilter(scope),
    ...dateRange(sp, 'voucherDate'),
  };

  const ledgerId = sp.get('ledgerId');
  if (ledgerId && isValidObjectId(ledgerId)) filter.partyLedgerId = ledgerId;

  const vouchers = await Voucher.find(filter)
    .sort({ voucherDate: -1, voucherNo: -1 })
    .limit(5000)
    .lean();

  /* classify every money line's ledger in one pass rather than per voucher */
  const payLedgerIds = vouchers.flatMap((v) =>
    (v.lines || []).filter((l) => l.role !== 'party').map((l) => l.ledgerId));
  const buckets = await ledgerBuckets(payLedgerIds, scope.businessId);

  let mapped = vouchers.map((v) => {
    const split = { bank: 0, cash: 0, upi: 0 };

    (v.lines || []).forEach((l) => {
      /* the party line is the customer being credited, not money received */
      if (l.role === 'party') return;
      const amount = num(l.debit) + num(l.credit);
      const b = buckets.get(String(l.ledgerId)) || bucketFor(l.ledgerName);
      split[b] += amount;
    });

    const total = r2(v.totalAmount);
    const adjusted = r2(v.adjustedAmount);

    return {
      _id: String(v._id),
      voucherNo: v.voucherNo || '',
      date: v.voucherDate || v.createdAt || null,
      partyName: v.partyName || '',
      total,
      bank: r2(split.bank),
      cash: r2(split.cash),
      upi: r2(split.upi),
      open: r2(total - adjusted),
      status: adjusted <= 0
        ? 'Advance'
        : (adjusted >= total ? 'Fully Adjusted' : 'Partly Adjusted'),
    };
  });

  const want = String(sp.get('status') || '').trim();
  if (want === 'open') mapped = mapped.filter((r) => r.open > 0);
  if (want === 'adjusted') mapped = mapped.filter((r) => r.open <= 0);

  const sum = (k) => r2(mapped.reduce((a, r) => a + r[k], 0));
  const p = paged(mapped, page, perPage);

  return json({
    tiles: {},
    sections: [{
      rows: p.rows,
      count: p.total,
      /* totals cover the whole result set, not just the page on screen */
      totals: {
        total: sum('total'),
        bank: sum('bank'),
        cash: sum('cash'),
        upi: sum('upi'),
        open: sum('open'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
