import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { bumpCatalogVersion } from '@/lib/ecommerceCatalog';
import {
  BUILT_IN_FILTER_DEFS,
  BUILT_IN_FILTER_SLUG_SET,
  FILTER_ICON_CHOICES,
} from '@/lib/ecommerceFilterIcons';
import {
  ECOMMERCE_FILTERS_COLLECTION,
  businessOrFilter,
  isValidFilterSlug,
  shapeFilterDefinition,
  toFilterSlug,
} from '@/lib/ecommerceFilterMaster';

const json = (data, status = 200) => Response.json(data, { status });
const ALLOWED_ICONS = new Set(FILTER_ICON_CHOICES.map((c) => c.key));

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ error: 'Invalid filter ID' }, 422);

  const body = await req.json().catch(() => ({}));
  const businessId = String(body.business || '');
  if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);

  const denied = await screenDenial({
    session,
    screen: SCREENS.ECOM_PRODUCT_TYPE,
    action: PERM.UPDATE,
    businessId,
    label: 'Ecommerce filter',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await dbConnect();
  const db = mongoose.connection.db;
  const col = db.collection(ECOMMERCE_FILTERS_COLLECTION);
  const _id = new Types.ObjectId(id);
  const bScope = businessOrFilter(businessId);

  const current = await col.findOne({ _id, businessId: bScope });
  if (!current) return json({ error: 'Custom filter not found' }, 404);

  const nextName = body.name !== undefined
    ? String(body.name || '').trim().replace(/\s+/g, ' ')
    : current.name;
  const nextLabel = body.label !== undefined
    ? String(body.label || '').trim().replace(/\s+/g, ' ')
    : current.label;
  const nextSlug = body.slug !== undefined
    ? toFilterSlug(body.slug)
    : current.slug;

  if (!nextName || nextName.length > 60) {
    return json({ error: 'Filter name is required and must be 60 characters or less.' }, 422);
  }
  if (!nextLabel || nextLabel.length > 60) {
    return json({ error: 'Filter label is required and must be 60 characters or less.' }, 422);
  }
  if (BUILT_IN_FILTER_SLUG_SET.has(nextSlug)) {
    return json({ error: `Slug "${nextSlug}" is reserved by a built-in filter.` }, 409);
  }
  const builtInNameMatch = BUILT_IN_FILTER_DEFS.find(
    (b) => b.name.toLowerCase() === nextName.toLowerCase() || b.label.toLowerCase() === nextLabel.toLowerCase(),
  );
  if (builtInNameMatch) {
    return json({ error: `"${builtInNameMatch.name}" is reserved by a built-in filter.` }, 409);
  }
  if (!isValidFilterSlug(nextSlug)) {
    return json({ error: 'Slug must use lowercase letters, numbers, and hyphens only.' }, 422);
  }

  const conflict = await col.findOne({
    _id: { $ne: _id },
    businessId: bScope,
    isActive: { $ne: false },
    $or: [
      { slug: { $regex: `^${escapeRegex(nextSlug)}$`, $options: 'i' } },
      { name: { $regex: `^${escapeRegex(nextName)}$`, $options: 'i' } },
      { label: { $regex: `^${escapeRegex(nextLabel)}$`, $options: 'i' } },
    ],
  });
  if (conflict) {
    return json({ error: 'Another filter with that name, label, or slug already exists.' }, 409);
  }

  const nextIcon = body.icon !== undefined && ALLOWED_ICONS.has(String(body.icon))
    ? String(body.icon)
    : (current.icon || 'tag');
  const nextActive = body.isActive !== undefined ? body.isActive !== false : current.isActive !== false;
  const nextVisible = body.ecommerceVisible !== undefined ? body.ecommerceVisible !== false : current.ecommerceVisible !== false;
  const nextOrder = Number.isFinite(Number(body.displayOrder)) ? Number(body.displayOrder) : Number(current.displayOrder) || 0;

  const updated = {
    ...current,
    name: nextName,
    label: nextLabel,
    slug: nextSlug,
    icon: nextIcon,
    isActive: nextActive,
    ecommerceVisible: nextVisible,
    displayOrder: nextOrder,
    updatedAt: new Date(),
  };

  await col.updateOne(
    { _id },
    {
      $set: {
        name: updated.name,
        label: updated.label,
        slug: updated.slug,
        icon: updated.icon,
        isActive: updated.isActive,
        ecommerceVisible: updated.ecommerceVisible,
        displayOrder: updated.displayOrder,
        updatedAt: updated.updatedAt,
      },
    },
  );
  await bumpCatalogVersion(businessId);
  return json({ ok: true, filter: shapeFilterDefinition(updated) });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ error: 'Invalid filter ID' }, 422);

  await dbConnect();
  const db = mongoose.connection.db;
  const col = db.collection(ECOMMERCE_FILTERS_COLLECTION);
  const _id = new Types.ObjectId(id);

  const current = await col.findOne({ _id, isActive: { $ne: false } });
  if (!current) return json({ error: 'Custom filter not found' }, 404);

  const denied = await screenDenial({
    session,
    screen: SCREENS.ECOM_PRODUCT_TYPE,
    action: PERM.DELETE,
    businessId: current.businessId,
    label: 'Ecommerce filter',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const now = new Date();
  await col.updateOne({ _id }, { $set: { isActive: false, deletedAt: now, updatedAt: now } });
  await bumpCatalogVersion(String(current.businessId));
  return json({ ok: true, softDeleted: true });
}
