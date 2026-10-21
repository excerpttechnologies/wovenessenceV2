import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { Customer } from '@/lib/contacts';
import PosCounter from '@/models/PosCounter';

/* GET /api/pos-archive  (21-10-2026)

   Archive -> POS Bills: the POS bills deleted from the POS list, read from
   the `posinvoicearchive` collection (see app/api/sell-pos/[id]/archive).
   Newest deletion first. Read-only. Any logged-in user. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;
/* ids may be stored as ObjectId or as a string */
const idMatch = (id) => ({ $in: [id, new Types.ObjectId(id)] });

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();
  const col = mongoose.connection.db.collection('posinvoicearchive');

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = idMatch(b);
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = idMatch(l);
  const y = sp.get('finYear'); if (y) filter.finYear = y;
  const search = (sp.get('search') || '').trim();
  if (search) filter.invoiceNo = { $regex: escapeRegex(search), $options: 'i' };

  /* column-header sort on plain fields; newest deletion first otherwise */
  const SORTABLE = ['date', 'invoiceNo', 'totalAmount', 'archivedAt'];
  const sortBy = sp.get('sortBy');
  const dir = sp.get('sortDir') === 'desc' ? -1 : sp.get('sortDir') === 'asc' ? 1 : 0;
  const sort = SORTABLE.includes(sortBy) && dir ? { [sortBy]: dir, _id: 1 } : { archivedAt: -1, _id: -1 };

  const total = await col.countDocuments(filter);
  const rows = await col.find(filter).sort(sort).skip((page - 1) * perPage).limit(perPage).toArray();

  const ids = (k) => [...new Set(rows.map((r) => r[k]).filter(Boolean).map(String))];
  const [customers, counters] = await Promise.all([
    ids('customerId').length ? Customer.find({ _id: { $in: ids('customerId') } }).select('_id businessName firstName middleName lastName').lean() : [],
    ids('counterId').length ? PosCounter.find({ _id: { $in: ids('counterId') } }).select('_id counterName').lean() : [],
  ]);
  const customerById = new Map(customers.map((c) => [String(c._id), c]));
  const counterById = new Map(counters.map((c) => [String(c._id), c.counterName || '']));
  const nameOf = (c) => (c ? c.businessName || [c.firstName, c.middleName, c.lastName].filter(Boolean).join(' ') : '');

  return json({
    rows: rows.map((r) => ({
      _id: String(r._id),
      date: r.date || null,
      createdAt: r.createdAt || null,
      invoiceNo: r.invoiceNo || '',
      counterName: counterById.get(String(r.counterId)) || '',
      customerName: nameOf(customerById.get(String(r.customerId))) || nameOf(r.customerSnapshot) || 'Walk-in Customer',
      customerContact: r.customerContact || '',
      totalAmount: Number(r.totalAmount) || 0,
      paymentStatus: r.paymentStatus || '',
      totalItems: (r.items || []).length,
      archivedAt: r.archivedAt || null,
      archivedByName: r.archivedBy?.name || r.archivedBy?.email || '',
    })),
    labels: {},
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}
