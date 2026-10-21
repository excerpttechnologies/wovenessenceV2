import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import CashRegister, { OPEN } from '@/models/CashRegister';
import { requireSession } from '@/lib/session';

/* /api/cash-register - list + open a register.

   Only one register can be open at a time for a business + location. That is
   enforced here rather than in the form, and with a guarded insert rather
   than a read-then-write, so two people pressing ADD at the same moment
   cannot both succeed. Same pattern the claim/release routes use. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function scopeOf(sp) {
  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  const y = sp.get('finYear'); if (y) filter.finYear = y;
  return filter;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const filter = scopeOf(sp);

  /* ?status=Open backs the /cashregister/open screen */
  const status = sp.get('status');
  if (status) filter.status = status;

  const total = await CashRegister.countDocuments(filter);
  const rows = await CashRegister.find(filter)
    .sort({ openedAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  /* the list needs to know whether ADD should be offered at all */
  const openCount = await CashRegister.countDocuments({ ...scopeOf(sp), status: OPEN });

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels: {},
    hasOpen: openCount > 0,
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

  const businessId = isValidObjectId(body.business) ? body.business : null;
  const locationId = isValidObjectId(body.location) ? body.location : null;
  const finYear = body.finYear || '';

  if (!businessId) return json({ error: 'No business selected.' }, 422);
  if (!locationId) return json({ error: 'No location selected.' }, 422);

  const already = await CashRegister.findOne({
    businessId, locationId, status: OPEN,
  }).select('_id').lean();
  if (already) {
    return json({
      error: 'A register is already open for this location. Close it before opening another.',
      id: String(already._id),
    }, 409);
  }

  const created = await CashRegister.create({
    businessId,
    locationId,
    finYear,
    status: OPEN,
    openedAt: new Date(),
    openingBalance: num(body.openingBalance),
    openedBy: session.name || session.email || '',
    note: String(body.note || ''),
    ...(isValidObjectId(body.posCounterId) ? { posCounterId: body.posCounterId } : {}),
  });

  /* Re-check after the insert. Two simultaneous opens both pass the check
     above; the loser is removed rather than left as a second open register. */
  const open = await CashRegister.find({ businessId, locationId, status: OPEN })
    .sort({ createdAt: 1 }).select('_id').lean();
  if (open.length > 1 && String(open[0]._id) !== String(created._id)) {
    await CashRegister.findByIdAndDelete(created._id);
    return json({
      error: 'Another register was opened at the same moment. Refresh and try again.',
    }, 409);
  }

  return json({ ok: true, id: String(created._id) });
}
