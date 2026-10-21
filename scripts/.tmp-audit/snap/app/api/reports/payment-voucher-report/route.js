import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import Voucher from '@/models/Voucher';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
  ledgerBuckets, bucketFor,
} from '@/lib/reports';

/* /api/reports/payment-voucher-report - read-only.

   Money out. The mirror of the receipt report, with two differences the
   deployed screen makes:

     - the third money column is Discount rather than UPI. That is the "Add
       Discount" row on the payment form: a write-off credited to a discount
       ledger so the supplier's account still clears in full. It is money the
       supplier forgave, not money that left the bank, so it is counted
       separately from the rails and never folded into Bank or Cash.
     - the unallocated column is called On Account rather than Advance.

   Same allocation caveat as the receipt report: Voucher.adjustedAmount is
   always 0, so Settlement Status reads "On Account" for every voucher until
   invoice allocation is built. */

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
    type: 'Payment',
    ...scopeFilter(scope),
    ...dateRange(sp, 'voucherDate'),
  };

  const ledgerId = sp.get('ledgerId');
  if (ledgerId && isValidObjectId(ledgerId)) filter.partyLedgerId = ledgerId;

  const vouchers = await Voucher.find(filter)
    .sort({ voucherDate: -1, voucherNo: -1 })
    .limit(5000)
    .lean();

  /* only the rail lines need classifying - the party is the supplier and the
     discount row has its own column */
  const payLedgerIds = vouchers.flatMap((v) =>
    (v.lines || [])
      .filter((l) => l.role !== 'party' && l.role !== 'discount')
      .map((l) => l.ledgerId));
  const buckets = await ledgerBuckets(payLedgerIds, scope.businessId);

  let mapped = vouchers.map((v) => {
    const split = { bank: 0, cash: 0, upi: 0 };
    let discount = 0;

    (v.lines || []).forEach((l) => {
      if (l.role === 'party') return;
      const amount = num(l.debit) + num(l.credit);
      if (l.role === 'discount') { discount += amount; return; }
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
      /* UPI has no column on this report, so a UPI payment reads as bank -
         which is what it is from the supplier's point of view */
      bank: r2(split.bank + split.upi),
      cash: r2(split.cash),
      discount: r2(discount),
      open: r2(total - adjusted),
      status: adjusted <= 0
        ? 'On Account'
        : (adjusted >= total ? 'Fully Settled' : 'Partly Settled'),
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
      totals: {
        total: sum('total'),
        bank: sum('bank'),
        cash: sum('cash'),
        discount: sum('discount'),
        open: sum('open'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
