import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import PosInvoice from '@/models/PosInvoice';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';

const POS = { screen: SCREENS.POS, label: 'POS bills' };

/* GET /api/sell-pos/last?business=&location=&finYear=  (21-10-2026)

   The number of the newest POS bill for the till's business / location /
   year - shown as the "Last Bill" label beside Main Reports on the till.
   Read-only. Same gate as /api/sell-pos/recent: read OR create, so a role
   allowed to bill but not to browse still sees it. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const b = sp.get('business');
  const l = sp.get('location');
  const y = sp.get('finYear');

  await dbConnect();

  const scope = await resolveAuthorizedScope(session, { businessId: b, locationId: l });
  if (!scope.ok) return scopeErrorResponse(scope);
  if (!scope.businessFilter && !b) return json({ invoiceNo: '' });

  let gate = await screenDenial({ session, ...POS, action: PERM.READ, businessId: scope.businessId || b });
  if (gate) gate = await screenDenial({ session, ...POS, action: PERM.CREATE, businessId: scope.businessId || b });
  if (gate) return json({ error: gate.message, code: gate.code }, 403);

  const filter = {};
  if (scope.businessFilter) filter.businessId = scope.businessFilter;
  if (scope.locationFilter) filter.locationId = scope.locationFilter;
  if (y) filter.finYear = y;

  const last = await PosInvoice.findOne(filter)
    .sort({ createdAt: -1, _id: -1 })
    .select('invoiceNo')
    .lean();

  return json({ invoiceNo: last?.invoiceNo || '' });
}
