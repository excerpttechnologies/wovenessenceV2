import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import ProductGroup from '@/models/ProductGroup';
import Item from '@/models/Item';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

const PRODUCT_GROUP = { screen: SCREENS.PRODUCT_GROUP, label: 'product groups' };

import { FIELDS } from '@/app/admin/inventory/product/group/fields';

const json = (d, s = 200) => Response.json(d, { status: s });

/* /api/product-group/[id] - get, update, delete a single product group. */

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const id = params.id;
  if (!isValidObjectId(id)) return json({ error: 'Invalid ID' }, 400);

  await dbConnect();

  const group = await ProductGroup.findById(id).lean();
  if (!group) return json({ error: 'Product group not found' }, 404);

  const denied = await screenDenial({
    session, ...PRODUCT_GROUP, action: PERM.READ, businessId: String(group.businessId || ''),
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return json({
    data: {
      _id: String(group._id),
      name: group.name || '',
      prefix: group.prefix || '',
      parentId: group.parentId ? String(group.parentId) : '',
      businessId: group.businessId ? String(group.businessId) : '',
    },
  });
}

export async function PATCH(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const id = params.id;
  if (!isValidObjectId(id)) return json({ error: 'Invalid ID' }, 400);

  const body = await req.json();
  await dbConnect();

  const existing = await ProductGroup.findById(id).lean();
  if (!existing) return json({ error: 'Product group not found' }, 404);

  const denied = await screenDenial({
    session, ...PRODUCT_GROUP, action: PERM.UPDATE, businessId: String(existing.businessId || ''),
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  // Prevent setting parentId to self
  if (doc.parentId && String(doc.parentId) === id) {
    return json({ error: 'A product group cannot be its own parent' }, 422);
  }

  // Prevent circular parent relationships
  if (doc.parentId && isValidObjectId(String(doc.parentId))) {
    let checkId = doc.parentId;
    const visited = new Set([id]);
    
    while (checkId) {
      if (visited.has(String(checkId))) {
        return json({ error: 'Circular parent relationship detected' }, 422);
      }
      visited.add(String(checkId));
      
      const parent = await ProductGroup.findById(checkId).select('parentId').lean();
      if (!parent) break;
      checkId = parent.parentId;
    }
  }

  await ProductGroup.updateOne({ _id: id }, { $set: doc });
  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const id = params.id;
  if (!isValidObjectId(id)) return json({ error: 'Invalid ID' }, 400);

  await dbConnect();

  const existing = await ProductGroup.findById(id).lean();
  if (!existing) return json({ error: 'Product group not found' }, 404);

  const denied = await screenDenial({
    session, ...PRODUCT_GROUP, action: PERM.DELETE, businessId: String(existing.businessId || ''),
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  // Check if any items reference this product group
  const itemCount = await Item.countDocuments({ subGroupId: id });
  if (itemCount > 0) {
    return json({
      error: `Cannot delete this product group. ${itemCount} item${itemCount > 1 ? 's' : ''} ${itemCount > 1 ? 'are' : 'is'} using it.`,
    }, 409);
  }

  // Check if any child groups reference this as parent
  const childCount = await ProductGroup.countDocuments({ parentId: id });
  if (childCount > 0) {
    return json({
      error: `Cannot delete this product group. ${childCount} child group${childCount > 1 ? 's' : ''} ${childCount > 1 ? 'are' : 'is'} using it as parent.`,
    }, 409);
  }

  await ProductGroup.deleteOne({ _id: id });
  return json({ ok: true });
}

/* ModalForm saves an edit with PUT, like every other by-id route. */
export const PUT = PATCH;
