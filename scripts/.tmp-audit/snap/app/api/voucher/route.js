import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Voucher from '@/models/Voucher';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { nextSeriesNumber } from '@/lib/docnumber';
import { SPECS, ROLE_SIDE, totalsOf, num, r2 } from '@/app/admin/voucher/fields';

/* /api/voucher?type=Receipt - list + create.

   One route for all three voucher types; `type` selects the spec, which
   carries the numbering prefix and which side each role posts to.

   The sides are NOT taken from the request. A receipt credits the customer
   and debits the bank because that is what a receipt is - letting the client
   nominate a side would let a crafted body post a voucher that balances but
   means the opposite thing. The form sends one amount per line; the server
   decides where it lands. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const type = sp.get('type');
  if (!type || !SPECS[type]) return json({ error: 'Unknown voucher type' }, 400);

  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const filter = { type };
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  const no = (sp.get('voucherNo') || '').trim();
  if (no) filter.voucherNo = { $regex: escapeRegex(no), $options: 'i' };

  const party = (sp.get('party') || '').trim();
  if (party) filter.partyName = { $regex: escapeRegex(party), $options: 'i' };

  /* open = nothing allocated against invoices yet; adjusted = fully applied */
  const status = sp.get('status');
  if (status === 'open') filter.$expr = { $lt: ['$adjustedAmount', '$totalAmount'] };
  if (status === 'adjusted') filter.$expr = { $gte: ['$adjustedAmount', '$totalAmount'] };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [
      { voucherNo: rx }, { partyName: rx }, { remark: rx },
      { toName: rx }, { fromName: rx },
    ];
  }

  const total = await Voucher.countDocuments(filter);
  const rows = await Voucher.find(filter)
    .sort({ voucherDate: -1, createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({
      ...r,
      _id: String(r._id),
      /* the unallocated part, under whichever heading this type uses */
      advance: r2(num(r.totalAmount) - num(r.adjustedAmount)),
      settlement: r2(num(r.totalAmount) - num(r.adjustedAmount)),
    })),
    labels: {},
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
  const type = body.type;
  const spec = SPECS[type];
  if (!spec) return json({ error: 'Unknown voucher type' }, 400);

  await dbConnect();

  const businessId = isValidObjectId(body.business) ? body.business : null;
  const locationId = isValidObjectId(body.location) ? body.location : null;
  const finYear = body.finYear || '';
  if (!businessId) return json({ error: 'No business selected.' }, 422);

  const incoming = Array.isArray(body.lines) ? body.lines : [];
  if (incoming.length < 2) {
    return json({ error: 'A voucher needs at least two lines.' }, 422);
  }

  const sides = ROLE_SIDE[type] || {};
  const errors = {};
  const lines = [];

  incoming.forEach((l, i) => {
    if (!isValidObjectId(l.ledgerId)) {
      errors['line' + i] = 'Pick a ledger on every row.';
      return;
    }
    const side = sides[l.role];
    if (!side) {
      errors['line' + i] = 'Unknown row type.';
      return;
    }
    const amount = r2(l.amount);
    if (amount <= 0) {
      errors['line' + i] = 'Enter an amount greater than zero.';
      return;
    }
    lines.push({
      ledgerId: l.ledgerId,
      ledgerName: String(l.ledgerName || ''),
      role: l.role,
      /* the side comes from the spec, never from the request */
      debit: side === 'debit' ? amount : 0,
      credit: side === 'credit' ? amount : 0,
      remark: String(l.remark || ''),
    });
  });

  if (Object.keys(errors).length) return json({ errors }, 422);

  const t = totalsOf(lines);
  if (!t.balanced) {
    return json({
      error: t.totalDebit === 0
        ? 'Enter an amount before submitting.'
        : 'Debit and credit must match. Currently ' + t.totalDebit.toFixed(2)
          + ' vs ' + t.totalCredit.toFixed(2) + '.',
    }, 422);
  }

  const byRole = (role) => lines.find((l) => l.role === role);

  const doc = {
    businessId,
    locationId,
    finYear,
    type,
    voucherDate: body.voucherDate ? new Date(body.voucherDate) : new Date(),
    remark: String(body.remark || ''),
    lines,
    totalDebit: t.totalDebit,
    totalCredit: t.totalCredit,
    totalAmount: t.totalAmount,
    adjustedAmount: 0,
    createdBy: session.name || session.email || '',
    /* copied at save time so a ledger rename never rewrites an issued
       voucher - same reasoning as the inter company documents */
    partyLedgerId: byRole('party')?.ledgerId || null,
    partyName: byRole('party')?.ledgerName || '',
    toName: byRole('to')?.ledgerName || '',
    fromName: byRole('from')?.ledgerName || '',
  };

  const [start] = String(finYear).split('-');
  const yy = (start || String(new Date().getFullYear())).slice(2);
  doc.voucherNo = await nextSeriesNumber(
    Voucher, 'voucherNo', spec.prefix + '/' + yy + '/',
    { scope: { businessId, finYear, type }, pad: 5 }
  );

  const created = await Voucher.create(doc);
  return json({ ok: true, id: String(created._id), voucherNo: created.voucherNo });
}
