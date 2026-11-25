import dbConnect from '@/lib/db';
import Voucher from '@/models/Voucher';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { assertDocumentLocationAccess } from '@/lib/locationAccess';

const VOUCHER_SCREENS = {
  Receipt: SCREENS.RECEIPT_VOUCHER,
  Contra: SCREENS.CONTRA_VOUCHER,
  Payment: SCREENS.PAYMENT_VOUCHER,
};

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
  const locDenied = await assertDocumentLocationAccess(session, doc);
  if (locDenied) return locDenied;
  const screen = VOUCHER_SCREENS[doc.type];
  if (screen) {
    const denied = await screenDenial({ session, screen, action: PERM.READ, businessId: doc.businessId, label: `${doc.type} vouchers` });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);
  }
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await Voucher.findById(id).select('adjustedAmount type businessId locationId').lean();
  if (!existing) return json({ ok: true });

  const locDenied = await assertDocumentLocationAccess(session, existing);
  if (locDenied) return locDenied;

  const screen = VOUCHER_SCREENS[existing.type];
  if (screen) {
    const denied = await screenDenial({ session, screen, action: PERM.DELETE, businessId: existing.businessId, label: `${existing.type} vouchers` });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);
  }

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
