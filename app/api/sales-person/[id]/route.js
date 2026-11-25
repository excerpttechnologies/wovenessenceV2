import dbConnect from '@/lib/db';
import SalesPerson, { clearOtherDefaults } from '@/models/SalesPerson';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import {
  assertDocumentLocationAccess, resolveAuthorizedScope, scopeErrorResponse,
} from '@/lib/locationAccess';
import { validate } from '@/lib/validate';
import { FIELDS } from '@/app/admin/staff-management/staff/salesperson/fields';

/* /api/sales-person/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  /* Next 15 hands `params` over as a Promise - destructuring it directly
     yields undefined, so every lookup here would silently miss. */
  const { id } = await params;
  await dbConnect();

  const doc = await SalesPerson.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  const docDenied = await assertDocumentLocationAccess(session, doc);
  if (docDenied) return docDenied;
  const denied = await screenDenial({ session, screen: SCREENS.SALES_PERSON, action: PERM.READ, businessId: doc.businessId, label: 'sales persons' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const existing = await SalesPerson.findById(id).select('businessId').lean();
  if (!existing) return json({ error: 'Not found' }, 404);
  const docDenied = await assertDocumentLocationAccess(session, existing);
  if (docDenied) return docDenied;
  if (body.business) {
    const scope = await resolveAuthorizedScope(session, { businessId: body.business });
    if (!scope.ok) return scopeErrorResponse(scope);
  }
  const denied = await screenDenial({ session, screen: SCREENS.SALES_PERSON, action: PERM.UPDATE, businessId: existing.businessId, label: 'sales persons' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  const updated = await SalesPerson.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  if (doc.isDefault === 'Yes') await clearOtherDefaults(updated);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await SalesPerson.findById(id).select('businessId').lean();
  if (!existing) return json({ ok: true });
  const docDenied = await assertDocumentLocationAccess(session, existing);
  if (docDenied) return docDenied;
  const denied = await screenDenial({ session, screen: SCREENS.SALES_PERSON, action: PERM.DELETE, businessId: existing.businessId, label: 'sales persons' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await SalesPerson.findByIdAndDelete(id);
  return json({ ok: true });
}
