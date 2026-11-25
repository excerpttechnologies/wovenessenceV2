import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import PosCounter from '@/models/PosCounter';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/poscounter/fields';
import { sortedPage } from '@/lib/listSort';
import {
  screenDenial, screenDenialAny, SCREENS, ACTIONS as PERM, COUNTER_PICKER_SCREENS,
} from '@/lib/screenPermission';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';

/* Permission gate for this screen.

   READING THE LIST IS ALSO THE TILL'S COUNTER PICKER. PosTill.jsx fetches
   this route directly rather than /api/options, so the list answers to POS
   read as well as to this master - see COUNTER_PICKER_SCREENS. Writing a
   counter still needs this screen's own permission. */
const POS_COUNTER = { screen: SCREENS.POS_COUNTER, label: 'cash counters' };

/* /api/pos-counter - list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = await resolveAuthorizedScope(session, {
    businessId: sp.get('business'),
    locationId: sp.get('location'),
  });
  if (!scope.ok) return scopeErrorResponse(scope);

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  /* This master, or the till that has to pick a counter. */
  const denied = await screenDenialAny({
    session, screens: COUNTER_PICKER_SCREENS, action: PERM.READ,
    businessId: scope.businessId || sp.get('business'), label: 'cash counters',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const filter = {};
  if (scope.businessFilter) filter.businessId = scope.businessFilter;
  if (scope.locationFilter) filter.locationId = scope.locationFilter;

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ counterName: rx }];
  }

  const total = await PosCounter.countDocuments(filter);
  /* column-header sort (lib/listSort.js); without ?sortBy= the query
     below runs exactly as before */
  const rows = (await sortedPage(PosCounter, filter, sp, {
    page,
    perPage,
    keys: ['counterName', 'invoiceLayout', 'status', 'repeatInvoice'],
    refs: ['businessId', 'locationId'],
  })) ?? await PosCounter.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  /* resolve ObjectId columns to their display labels */
  const labels = await resolveRefLabels(rows);

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels,
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

  const scope = await resolveAuthorizedScope(session, {
    businessId: body.business,
    locationId: body.location,
  });
  if (!scope.ok) return scopeErrorResponse(scope);
  if (!scope.access.unrestricted && !scope.locationId) {
    return json({ error: 'Please select an authorized location.', code: 'LOCATION_REQUIRED' }, 422);
  }

  /* Ahead of validate(), and on this master alone - being allowed to work a
     till is not being allowed to create one. */
  const denied = await screenDenial({
    session, ...POS_COUNTER, action: PERM.CREATE, businessId: scope.businessId || body.business,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  if (scope.businessId) doc.businessId = scope.businessId;
  if (scope.locationId) doc.locationId = scope.locationId;

  const created = await PosCounter.create(doc);
  return json({ ok: true, id: String(created._id) });
}

