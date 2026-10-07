import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import IcSalesReturn from '@/models/IcSalesReturn';
import IcAutoPurchaseReturn from '@/models/IcAutoPurchaseReturn';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { escapeRegex } from '@/lib/validate';
import { nextSeriesNumber } from '@/lib/docnumber';

/* /api/ic-sales-return

   GET  - the returns this branch has already accepted.
   POST - accept a pending Auto Purchase Return raised by another branch.

   Accepting does NOT create a GRC. The goods are coming back into the branch
   that originally shipped them, and the accounting entry for that is a Credit
   Note, which lives in the Sell module. This route records the acceptance and
   claims the other side's document; raising the Credit Note is a separate
   decision - see the note on the Sales Return page. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ returnCode: rx }, { refNo: rx }];
  }

  const total = await IcSalesReturn.countDocuments(filter);
  const rows = await IcSalesReturn.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels: await resolveRefLabels(rows),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json();
  await dbConnect();

  const returnId = body.icAutoPurchaseReturnId;
  if (!returnId || !isValidObjectId(returnId)) {
    return json({ error: 'Pick a return to accept.' }, 422);
  }

  const businessId = isValidObjectId(body.business) ? body.business : null;
  const locationId = isValidObjectId(body.location) ? body.location : null;
  const finYear = body.finYear || '';
  if (!businessId) return json({ error: 'No business selected.' }, 422);

  const src = await IcAutoPurchaseReturn.findById(returnId).lean();
  if (!src) return json({ error: 'Return not found' }, 404);
  if (src.icSalesReturnId) return json({ error: 'This return has already been accepted.' }, 409);

  if (String(src.toBusinessId) !== String(businessId)) {
    return json({ error: 'This return is not addressed to the selected business.' }, 403);
  }

  const [start] = String(finYear).split('-');
  const yy = (start || String(new Date().getFullYear())).slice(2);

  const created = await IcSalesReturn.create({
    businessId,
    locationId,
    finYear,
    returnCode: await nextSeriesNumber(IcSalesReturn, 'returnCode', 'ICSR/' + yy + '/', {
      scope: { businessId, finYear },
    }),
    date: new Date(),
    icAutoPurchaseReturnId: src._id,
    refNo: src.returnNo || '',
    fromBusinessId: src.businessId,
    fromLocationId: src.locationId,
    totalQty: src.totalQty || 0,
    netValue: src.netValue || 0,
    items: Array.isArray(src.items) ? src.items : [],
  });

  const claim = await IcAutoPurchaseReturn.updateMany(
    { _id: src._id, $or: [{ icSalesReturnId: null }, { icSalesReturnId: { $exists: false } }] },
    { $set: { icSalesReturnId: created._id } }
  );

  if (claim.modifiedCount !== 1) {
    await IcSalesReturn.findByIdAndDelete(created._id);
    return json({ error: 'This return was accepted by someone else. Refresh and try again.' }, 409);
  }

  return json({ ok: true, id: String(created._id), returnCode: created.returnCode });
}
