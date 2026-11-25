import dbConnect from '@/lib/db';
import CompanyLocation from '@/models/CompanyLocation';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/companylocations/fields';
import {
  screenDenial, screenDenialAny, SCREENS, ACTIONS as PERM, LOCATION_HEADER_SCREENS,
} from '@/lib/screenPermission';
import { assertDocumentLocationAccess } from '@/lib/locationAccess';

const LOCATION = { screen: SCREENS.COMPANY_LOCATION, label: 'company locations' };

/* /api/company-location/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const doc = await CompanyLocation.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);

  if (sp.get('transferTarget') === '1') {
    const denied = await screenDenialAny({
      session, screens: LOCATION_HEADER_SCREENS, action: PERM.READ,
      businessId: doc.businessId, label: 'company locations',
    });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);
    return json({
      doc: {
        _id: String(doc._id),
        name: doc.name,
        businessId: doc.businessId ? String(doc.businessId) : '',
        gstin: doc.gstin || '',
        addressLine1: doc.addressLine1 || '',
        addressLine2: doc.addressLine2 || '',
        city: doc.city || '',
        stateCode: doc.stateCode || '',
      },
    });
  }

  const locDenied = await assertDocumentLocationAccess(session, {
    locationId: doc._id,
    businessId: doc.businessId,
  });
  if (locDenied) return locDenied;

  /* READING ONE LOCATION IS ALSO A DOCUMENT HEADER. The stock-transfer packet
     and location forms fetch the branch by id to print its address, so this
     answers to those screens as well as to the master - see
     LOCATION_HEADER_SCREENS. Scoped to the location's own business, not to
     whichever business the screen happens to be switched to. */
  const denied = await screenDenialAny({
    session, screens: LOCATION_HEADER_SCREENS, action: PERM.READ,
    businessId: doc.businessId, label: 'company locations',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  /* Before validate(), and scoped on the stored record rather than on the
     body, so the caller cannot name a business it may edit and then save over
     a branch it may not. */
  const target = await CompanyLocation.findById(id).select('businessId').lean();
  if (!target) return json({ error: 'Not found' }, 404);

  const locDenied = await assertDocumentLocationAccess(session, {
    locationId: id,
    businessId: target.businessId,
  });
  if (locDenied) return locDenied;

  const denied = await screenDenial({
    session, ...LOCATION, action: PERM.UPDATE, businessId: target.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  const updated = await CompanyLocation.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const target = await CompanyLocation.findById(id).select('businessId').lean();
  if (!target) return json({ ok: true });

  const locDenied = await assertDocumentLocationAccess(session, {
    locationId: id,
    businessId: target.businessId,
  });
  if (locDenied) return locDenied;

  const denied = await screenDenial({
    session, ...LOCATION, action: PERM.DELETE, businessId: target.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await CompanyLocation.findByIdAndDelete(id);
  return json({ ok: true });
}
