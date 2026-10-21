import dbConnect from '@/lib/db';
import Voucher from '@/models/Voucher';
import { requireSession } from '@/lib/session';

/* /api/voucher/<id> - read one, delete.

   There is no PUT. A voucher is a posted entry: it is reversed by deleting
   it, not amended in place. Editing the amounts on a posted voucher would
   silently move a ledger balance that somebody has already reconciled
   against - the same reason the Inter Company Sales Invoice has no PUT. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await Voucher.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await Voucher.findById(id).select('adjustedAmount').lean();
  if (!existing) return json({ ok: true });

  /* Once part of a voucher has been allocated against an invoice, deleting
     it would leave that invoice pointing at money that no longer exists.
     Allocation is not built yet, so this cannot trigger today - it is here
     so the guard exists before the feature that needs it. */
  if (Number(existing.adjustedAmount) > 0) {
    return json({
      error: 'This voucher has been adjusted against invoices. Reverse the adjustment first.',
    }, 409);
  }

  await Voucher.findByIdAndDelete(id);
  return json({ ok: true });
}
