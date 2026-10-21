import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import PosReturn from '@/models/PosReturn';
import CompanyLocation from '@/models/CompanyLocation';
import {
  json, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
} from '@/lib/reports';

/* /api/reports/pos-credit-note - read-only.

   Credit notes raised against POS bills. One row per PosReturn.

   The lightest report in the module: PosReturn already stores everything the
   four columns need, so nothing is derived. Dates are optional here, matching
   the deployed screen - it opens on the whole financial year rather than a
   month.

   It reports nothing today only because the POS till never posts, so no
   PosReturn is ever created. The deployed screen shows "No Data.." for the
   same reason. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);

  const returns = await PosReturn.find({
    ...scopeFilter(scope),
    ...dateRange(sp, 'date'),
  }).sort({ date: -1 }).limit(5000).lean();

  const locIds = [...new Set(returns.map((r) => r.locationId).filter(Boolean).map(String))];
  const locs = locIds.length
    ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean()
    : [];
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));

  const rows = returns.map((r) => ({
    _id: String(r._id),
    location: locName.get(String(r.locationId)) || '',
    creditNo: r.invoiceNo || '',
    date: r.date || r.createdAt || null,
    finalTotal: r2(r.totalAmount),
  }));

  const p = paged(rows, page, perPage);

  return json({
    tiles: {},
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: { finalTotal: r2(rows.reduce((a, r) => a + r.finalTotal, 0)) },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
