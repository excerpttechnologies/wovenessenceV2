import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { allowedDestinations } from '@/lib/icRouting';

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

  const { options } = await allowedDestinations(business);
  return json({ options });
}
