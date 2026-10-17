import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { allowedDestinations } from '@/lib/icRouting';
import { screenDenialAny, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/ic-destinations?business=<the branch I am standing in>

   The branches this one may send inter company goods to, shaped like
   /api/options so a form can drop `options` straight into a <select>.

   Every other branch, directly - nothing mediates the transfer and nothing
   approves it. The hub/mediator fields this route used to return
   (lockedLocation, hubLocations, hubBusinessId, isStandingInHub, mediator,
   notes) are gone with that behaviour; see lib/icRouting.js. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const business = sp.get('business');
  if (!business || !isValidObjectId(business)) return json({ options: [] });

  await dbConnect();

  /* the companies a challan / IC invoice screen can pick (17-10-2026) -
     the challan form uses it while creating or editing, the Sales Invoice
     filter while reading, so Read, Create OR Update on either screen lets it
     through; refused only when every one is withheld */
  let denied = null;
  for (const action of [PERM.READ, PERM.CREATE, PERM.UPDATE]) {
    denied = await screenDenialAny({
      session,
      screens: [SCREENS.IC_DELIVERY_CHALLAN, SCREENS.IC_ITEM_INVOICE],
      action,
      businessId: business,
      label: 'inter company destinations',
    });
    if (!denied) break;
  }
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { options } = await allowedDestinations(business);
  return json({ options });
}
