import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { requireSession } from '@/lib/session';
import { checkGrcDependencies } from '@/lib/grcDependencies';
import { assertDocumentLocationAccess } from '@/lib/locationAccess';

/* /api/purchase-grc/<id>/cancel/check - CHECK if GRC can be cancelled
   
   This endpoint ONLY checks dependencies without performing any action.
   Used in the UI flow: check first → show modal → then cancel if confirmed.
*/

const json = (d, s = 200) => Response.json(d, { status: s });

async function grcDenied(session, id, actions) {
  const rec = isValidObjectId(id) ? await Grc.findById(id).select('businessId locationId').lean() : null;
  if (!rec) return null;
  const locDenied = await assertDocumentLocationAccess(session, rec);
  if (locDenied) return locDenied;
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

  const grc = await Grc.findById(id).lean();
  if (!grc) return json({ error: 'GRC not found' }, 404);

  /* ---- Dependency check: check if stock has moved downstream ------------
   
     This is a read-only check that returns the result without modifying
     anything. The actual cancel endpoint will re-check before execution. */
  const { hasTransfers, transfers } = await checkGrcDependencies(id, grc.grcNumber);
  
  if (hasTransfers) {
    const transferList = transfers
      .slice(0, 5)
      .map(t => `${t.type}: ${t.refNo}`)
      .join(', ');
    
    return json({
      error: 'Cannot cancel this GRC because stock from this GRC has already been transferred.',
      details: transferList + (transfers.length > 5 ? ` and ${transfers.length - 5} more` : ''),
      transfers: transfers.slice(0, 20), // Return up to 20 for display
      code: 'HAS_TRANSFERS',
      canCancel: false
    }, 422);
  }

  // Safe to cancel
  return json({ 
    canCancel: true,
    message: 'GRC can be safely cancelled',
    grc: {
      _id: grc._id,
      grcNumber: grc.grcNumber,
      supplierName: grc.supplierName,
      grcDate: grc.grcDate,
      totalQuantity: grc.totalQuantity
    }
  });
}
