import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import DebitNote from '@/models/DebitNote';
import Upstream from '@/models/Grt';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';
import { FORM } from '@/app/admin/transaction/purchase/debitnote/form';

/* header fields AND the totals rows - the totals card holds real stored
   numbers (taxable value, round off, net value, the editable discounts).
   Leaving them out meant validate() silently dropped them on every save. */
const FIELDS = (FORM.cards || []).flatMap((c) => {
  if (c.type === 'fields') return c.fields || [];
  if (c.type === 'totals') {
    return (c.rows || []).flatMap((r) => [
      ...(r.value ? [{ k: r.value, label: r.label, type: 'number' }] : []),
      ...(r.input ? [{ k: r.input, label: r.label, type: 'number', def: 0 }] : []),
    ]);
  }
  return [];
});

/* /api/purchase-debitnote - list + create. */

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


  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.debitCreadted = { ...(filter.debitCreadted || {}), $gte: new Date(from) };
  if (to) filter.debitCreadted = { ...(filter.debitCreadted || {}), $lte: new Date(to + 'T23:59:59') };

  /* "unconverted" upstream documents: a GRC with no purchase invoice yet, a
     GRT with no debit note yet. $eq: null matches missing AND null - passing
     '' here would be cast against an ObjectId path and throw. */
  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ debitNoteNo: rx }];
  }

  const total = await DebitNote.countDocuments(filter);
  const rows = await DebitNote.find(filter)
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

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;
  if (body.finYear) doc.finYear = body.finYear;

  const sourceIds = Array.isArray(body.data?.sourceIds)
    ? body.data.sourceIds.filter(Boolean)
    : (body.data?.sourceIds ? [body.data.sourceIds] : []);
  const sourceRows = sourceIds.length
    ? await Upstream.find({ _id: { $in: sourceIds } }).select('grtNo supplierId vendorGstNo').lean()
    : [];

  if (Array.isArray(body.data?.items)) {
    doc.items = body.data.items;
    doc.qty = body.data.items.reduce((sum, item) => sum + (Number(item['Return Quantity'] ?? item.qty) || 0), 0);
    doc.value = body.data.items.reduce((sum, item) => sum + (Number(item['Before Tax']) || ((Number(item['Final Rate'] ?? item.finalNet ?? item.purRate) || 0) * (Number(item['Return Quantity'] ?? item.qty) || 0))), 0);
  }
  if (sourceRows.length) {
    doc.grtNo = sourceRows.map((row) => row.grtNo).filter(Boolean).join(', ');
    doc.supplierId = sourceRows[0].supplierId || doc.supplierId;
    doc.vendorGstNo = sourceRows[0].vendorGstNo || doc.vendorGstNo;
  }

  /* document number from the Doc Setup master */
  if (!doc.debitNoteNo) {
    doc.debitNoteNo = await nextDocNumber(DebitNote, 'debitNoteNo', "Debit Note", {
      businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
    });
  }

  const created = await DebitNote.create(doc);

  /* stamp the upstream document so it stops appearing as unconverted */
  if (sourceIds.length) {
    await Upstream.updateMany(
      { _id: { $in: sourceIds.filter(Boolean) } },
      { $set: { debitNoteId: created._id } }
    );
  }

  return json({ ok: true, id: String(created._id) });
}
