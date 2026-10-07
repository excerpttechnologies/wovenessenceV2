import dbConnect from '@/lib/db';
import CashRegister, { OPEN, CLOSED } from '@/models/CashRegister';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import { requireSession } from '@/lib/session';

/* /api/cash-register/<id> - read one, close, delete.

   PUT closes the register. The expected balance is worked out HERE, from the
   POS taken between openedAt and now, and then stored - see the note on the
   model for why a close is frozen rather than recomputed on read. */

const json = (d, s = 200) => Response.json(d, { status: s });
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (v) => Math.round(num(v) * 100) / 100;

async function sumInWindow(Model, scope, from, to, field) {
  const r = await Model.aggregate([
    {
      $match: {
        ...scope,
        /* POS carries its own `date`; fall back to createdAt for rows saved
           before that field was being set */
        $or: [
          { date: { $gte: from, $lte: to } },
          { date: null, createdAt: { $gte: from, $lte: to } },
        ],
      },
    },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$' + field, 0] } } } },
  ]);
  return r.length ? r[0].total : 0;
}

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await CashRegister.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const reg = await CashRegister.findById(id).lean();
  if (!reg) return json({ error: 'Register not found' }, 404);
  if (reg.status === CLOSED) {
    return json({ error: 'This register is already closed.' }, 409);
  }

  const from = reg.openedAt ? new Date(reg.openedAt) : new Date(0);
  const to = new Date();

  const scope = {
    ...(reg.businessId ? { businessId: reg.businessId } : {}),
    ...(reg.locationId ? { locationId: reg.locationId } : {}),
  };

  const [cashSales, cashReturns] = await Promise.all([
    sumInWindow(PosInvoice, scope, from, to, 'totalAmount'),
    sumInWindow(PosReturn, scope, from, to, 'totalAmount'),
  ]);

  const expected = r2(num(reg.openingBalance) + cashSales - cashReturns);
  const closing = r2(body.closingBalance);

  /* guarded so two people closing at once cannot both write a close */
  const claim = await CashRegister.updateOne(
    { _id: reg._id, status: OPEN },
    {
      $set: {
        status: CLOSED,
        closedAt: to,
        closingBalance: closing,
        expectedBalance: expected,
        differenceBalance: r2(closing - expected),
        cashSales: r2(cashSales),
        cashReturns: r2(cashReturns),
        closedBy: session.name || session.email || '',
        ...(body.note !== undefined ? { note: String(body.note) } : {}),
      },
    }
  );

  if (claim.modifiedCount !== 1) {
    return json({ error: 'This register was closed by someone else. Refresh and try again.' }, 409);
  }

  return json({
    ok: true,
    id,
    expectedBalance: expected,
    closingBalance: closing,
    differenceBalance: r2(closing - expected),
  });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const reg = await CashRegister.findById(id).select('status').lean();
  if (!reg) return json({ ok: true });
  /* a closed register is a signed-off count - removing it would erase the
     record of an over or short */
  if (reg.status === CLOSED) {
    return json({ error: 'A closed register cannot be deleted.' }, 409);
  }

  await CashRegister.findByIdAndDelete(id);
  return json({ ok: true });
}
