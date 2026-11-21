import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import DocSetup from '@/models/DocSetup';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/docsetup/fields';
import { buildSample, validateSetup } from '@/lib/docSetup';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

const DOC_SETUP = { screen: SCREENS.DOC_SETUP, label: 'document setups' };

/* /api/doc-setup/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await DocSetup.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);

  /* Scoped to the setup's own business, not to whichever business the screen
     happens to be switched to. */
  const denied = await screenDenial({
    session, ...DOC_SETUP, action: PERM.READ, businessId: doc.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return json({
    doc: {
      ...doc,
      _id: String(doc._id),
      businessId: doc.businessId ? String(doc.businessId) : '',
      companyId: doc.companyId ? String(doc.companyId) : (doc.businessId ? String(doc.businessId) : ''),
      locationId: doc.locationId ? String(doc.locationId) : '',
    },
  });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  /* Before validate() and before the clash check, and scoped on the STORED
     row rather than on the body - otherwise the caller could name a business
     it may edit and save over a series it may not. */
  const target = await DocSetup.findById(id).select('businessId companyId locationId').lean();
  if (!target) return json({ error: 'Not found' }, 404);

  const denied = await screenDenial({
    session, ...DOC_SETUP, action: PERM.UPDATE, businessId: target.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  const businessParam = body.business || body.businessId || body.companyId;
  const locationParam = body.location || body.locationId;

  if (businessParam && isValidObjectId(businessParam)) {
    doc.businessId = businessParam;
    doc.companyId = businessParam;
  } else if (target.businessId) {
    doc.businessId = target.businessId;
    doc.companyId = target.companyId || target.businessId;
  }

  if (locationParam && isValidObjectId(locationParam)) {
    doc.locationId = locationParam;
  } else if (target.locationId) {
    doc.locationId = target.locationId;
  }

  const bad = validateSetup(doc);
  if (bad) return json({ errors: bad }, 422);

  /* The same one-per-location-type-year rule as create, excluding this row */
  const clashFilter = {
    _id: { $ne: id },
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

  /* Recomputed on every save */
  doc.sample = buildSample(doc);

  const updated = await DocSetup.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const target = await DocSetup.findById(id).select('businessId locationId').lean();
  if (!target) return json({ ok: true });

  const denied = await screenDenial({
    session, ...DOC_SETUP, action: PERM.DELETE, businessId: target.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  /* Deletes only the selected location's record */
  await DocSetup.findByIdAndDelete(id);
  return json({ ok: true });
}
