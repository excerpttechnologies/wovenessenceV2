import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import DocSetup from '@/models/DocSetup';
import { requireSession } from '@/lib/session';
import { validate, escapeRegex } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/docsetup/fields';
import { buildSample, validateSetup } from '@/lib/docSetup';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { sortedPage } from '@/lib/listSort';

/* Permission gate for this screen.

   DOCUMENT NUMBERING IS NOT AFFECTED. Every number in the app comes from
   nextDocNumber() in lib/docnumber.js, which reads the DocSetup model
   DIRECTLY on the server - it never calls this route. So a role refused
   here still raises GRCs, invoices and challans with their proper prefixes;
   what it loses is the screen that configures them.

   Nothing else reads this route either: the ref dropdown uses
   /api/options?ref=docsetup. */
const DOC_SETUP = { screen: SCREENS.DOC_SETUP, label: 'document setups' };

/* /api/doc-setup - list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  const businessParam = sp.get('business') || sp.get('companyId');
  const locationParam = sp.get('location') || sp.get('locationId');

  /* Only refuses when this role has a saved permission matrix that
     withholds it - see lib/screenPermission.js. */
  const denied = await screenDenial({
    session, ...DOC_SETUP, action: PERM.READ, businessId: businessParam,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const filter = {};
  if (businessParam && isValidObjectId(businessParam)) {
    filter.$or = [{ businessId: businessParam }, { companyId: businessParam }];
  }
  if (locationParam && isValidObjectId(locationParam)) {
    filter.locationId = locationParam;
  }
  const y = sp.get('finYear');
  if (y) filter.finYear = y;

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    const searchConditions = [
      { documentName: rx },
      { documentType: rx },
      { description: rx },
      { prefix: rx },
      { suffix: rx },
      { sample: rx },
      { finYear: rx },
    ];
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, { $or: searchConditions }];
      delete filter.$or;
    } else {
      filter.$or = searchConditions;
    }
  }

  const total = await DocSetup.countDocuments(filter);
  /* column-header sort (lib/listSort.js); without ?sortBy= the query
     below runs exactly as before */
  const rows = (await sortedPage(DocSetup, filter, sp, {
    page,
    perPage,
    keys: ['documentName', 'documentType', 'prefix', 'startFrom', 'validity', 'finYear'],
  })) ?? await DocSetup.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  /* resolve ObjectId columns to their display labels */
  const labels = {};

  return json({
    rows: rows.map((r) => ({
      ...r,
      _id: String(r._id),
      businessId: r.businessId ? String(r.businessId) : '',
      companyId: r.companyId ? String(r.companyId) : (r.businessId ? String(r.businessId) : ''),
      locationId: r.locationId ? String(r.locationId) : '',
    })),
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

  const businessParam = body.business || body.businessId || body.companyId;
  const locationParam = body.location || body.locationId;

  /* Ahead of validate() and of the clash check, so a refused
     setup reads as 403 "not allowed" rather than as a complaint about the
     form or about a series that is already configured. */
  const denied = await screenDenial({
    session, ...DOC_SETUP, action: PERM.CREATE, businessId: businessParam,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  if (businessParam && isValidObjectId(businessParam)) {
    doc.businessId = businessParam;
    doc.companyId = businessParam;
  }
  if (locationParam && isValidObjectId(locationParam)) {
    doc.locationId = locationParam;
  }
  if (body.finYear) doc.finYear = body.finYear;

  const bad = validateSetup(doc);
  if (bad) return json({ errors: bad }, 422);

  /* One setup per business + location + type + year.
     Prevents duplicates within the same location. */
  const clashFilter = {
    documentType: doc.documentType,
    ...(doc.businessId ? { $or: [{ businessId: doc.businessId }, { companyId: doc.businessId }] } : {}),
    ...(doc.locationId ? { locationId: doc.locationId } : { locationId: null }),
    ...(doc.finYear ? { finYear: doc.finYear } : {}),
  };
  const clash = await DocSetup.findOne(clashFilter).select('documentName').lean();
  if (clash) {
    return json({
      errors: {
        documentType: `"${doc.documentType}" is already configured for this location and year (${clash.documentName}).`,
      },
    }, 422);
  }

  doc.sample = buildSample(doc);
  const created = await DocSetup.create(doc);
  return json({ ok: true, id: String(created._id) });
}
