import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { requireSession } from '@/lib/session';
import { reverseGrcPosting } from '@/lib/accounting/posting';
import { checkGrcDependencies } from '@/lib/grcDependencies';

/* /api/purchase-grc/<id>/cancel - CANCEL a non-latest GRC */

const json = (d, s = 200) => Response.json(d, { status: s });

/* Roles & Permissions: judged against the record's own business.
   Cancel requires DELETE permission since it's a destructive operation. */
async function grcDenied(session, id, actions) {
  const rec = isValidObjectId(id) ? await Grc.findById(id).select('businessId').lean() : null;
  if (!rec) return null;
  const denied = await screenDenialAnyAction({ 
    session, 
    screens: [SCREENS.GRC], 
    actions, 
    businessId: rec.businessId, 
    label: 'GRC' 
  });
  return denied ? json({ error: denied.message, code: denied.code }, 403) : null;
}

export async function POST(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const no = await grcDenied(session, id, [PERM.DELETE]);
  if (no) return no;

  const grc = await Grc.findById(id);
  if (!grc) return json({ error: 'GRC not found' }, 404);

  /* ---- Already cancelled check ------------------------------------------ */
  if (grc.accountingStatus === 'reversed') {
    return json({
      error: 'This GRC has already been cancelled.',
      code: 'ALREADY_CANCELLED'
    }, 422);
  }

  /* ---- Purchase Invoice check -------------------------------------------
   
     A GRC that has been converted to a Purchase Invoice cannot be cancelled.
     The invoice must be handled separately before cancelling the GRC. */
  if (grc.purchaseInvoiceId) {
    return json({
      error: 'Cannot cancel a GRC that has been converted to a Purchase Invoice. Please handle the invoice first.',
      code: 'HAS_PURCHASE_INVOICE'
    }, 422);
  }

  /* ---- Dependency check: refuse if stock has moved downstream ------------
   
     A GRC can only be cancelled if NONE of its stock has been transferred to
     any other location. This is the MOST IMPORTANT check per requirements. */
  const { hasTransfers, transfers } = await checkGrcDependencies(id, grc.grcNumber);
  if (hasTransfers) {
    const transferList = transfers
      .slice(0, 5)
      .map(t => `${t.type}: ${t.refNo}`)
      .join(', ');
    
    return json({
      error: 'Cannot cancel this GRC because stock from this GRC has already been transferred. Please check the related stock transfer transactions.',
      details: transferList + (transfers.length > 5 ? ` and ${transfers.length - 5} more` : ''),
      transfers: transfers.slice(0, 10),
      code: 'HAS_TRANSFERS'
    }, 422);
  }

  /* ---- Cancel the GRC: reverse accounting and mark as cancelled ---------
   
     Cancellation reverses the stock receipt journal entry but keeps the GRC
     document for audit trail. The accountingStatus is set to 'reversed' to
     indicate cancellation. The document itself is NOT deleted. */
  await reverseGrcPosting(id, { reason: 'GRC cancelled by user' });

  grc.accountingStatus = 'reversed';
  grc.updatedBy = session.user?.email || '';
  await grc.save();

  return json({ 
    ok: true, 
    message: 'GRC cancelled successfully. Stock and accounting entries have been reversed.',
    grcNumber: grc.grcNumber 
  });
}
