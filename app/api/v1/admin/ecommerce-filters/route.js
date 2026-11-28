import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { bumpCatalogVersion } from '@/lib/ecommerceCatalog';
import {
  BUILT_IN_FILTER_DEFS,
  BUILT_IN_FILTER_KEY_SET,
  BUILT_IN_FILTER_SLUG_SET,
  FILTER_ICON_CHOICES,
} from '@/lib/ecommerceFilterIcons';
import {
  ECOMMERCE_FILTERS_COLLECTION,
  businessOrFilter,
  isValidFilterKey,
  isValidFilterSlug,
  listFilterDefinitions,
  shapeFilterDefinition,
  toFilterKey,
  toFilterSlug,
} from '@/lib/ecommerceFilterMaster';

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
/* The sidebar re-reads this list after every Product Type / filter change.
   A cached answer would put a deleted entry back into the rail. */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const ALLOWED_ICONS = new Set(FILTER_ICON_CHOICES.map((c) => c.key));

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const businessId = sp.get('business');
  const includeInactive = sp.get('includeInactive') === '1' || sp.get('includeInactive') === 'true';

  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }

  const denied = await screenDenial({
    session,
    screen: SCREENS.ECOM_PRODUCT_TYPE,
    action: PERM.READ,
    businessId,
    label: 'Ecommerce filters',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await dbConnect();
  const filters = await listFilterDefinitions(businessId, { includeInactive });
  return json({ filters }, 200, NO_STORE);
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const businessId = String(body.business || '');
  if (!isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }

  const denied = await screenDenial({
    session,
    screen: SCREENS.ECOM_PRODUCT_TYPE,
    action: PERM.CREATE,
    businessId,
    label: 'Ecommerce filter',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const rawName = String(body.name || '').trim().replace(/\s+/g, ' ');
  const rawLabel = String(body.label || rawName).trim().replace(/\s+/g, ' ');
  if (!rawName || rawName.length > 60) {
    return json({ error: 'Filter name is required and must be 60 characters or less.' }, 422);
  }
  if (!rawLabel || rawLabel.length > 60) {
    return json({ error: 'Filter label is required and must be 60 characters or less.' }, 422);
  }

  const key = toFilterKey(body.key || rawLabel);
  const slug = toFilterSlug(body.slug || rawLabel);

  if (BUILT_IN_FILTER_KEY_SET.has(key)) {
    return json({ error: `Filter key "${key}" is reserved by a built-in filter.` }, 409);
  }
  if (BUILT_IN_FILTER_SLUG_SET.has(slug)) {
    return json({ error: `Slug "${slug}" is reserved by a built-in filter.` }, 409);
  }
  const builtInNameMatch = BUILT_IN_FILTER_DEFS.find(
    (b) => b.name.toLowerCase() === rawName.toLowerCase() || b.label.toLowerCase() === rawLabel.toLowerCase(),
  );
  if (builtInNameMatch) {
    return json({ error: `"${builtInNameMatch.name}" already exists as a built-in filter.` }, 409);
  }

  if (!isValidFilterKey(key)) {
    return json({ error: 'Filter key must start with a letter and contain only letters/numbers (2-48 chars).' }, 422);
  }
  if (!isValidFilterSlug(slug)) {
    return json({ error: 'Slug must use lowercase letters, numbers, and hyphens only (2-64 chars).' }, 422);
  }

  const icon = ALLOWED_ICONS.has(String(body.icon || '')) ? String(body.icon) : 'tag';
  const isActive = body.isActive !== false;
  const ecommerceVisible = body.ecommerceVisible !== false;

  await dbConnect();
  const db = mongoose.connection.db;
  const col = db.collection(ECOMMERCE_FILTERS_COLLECTION);
  const bScope = businessOrFilter(businessId);
  const nameRegex = { $regex: `^${escapeRegex(rawName)}$`, $options: 'i' };
  const labelRegex = { $regex: `^${escapeRegex(rawLabel)}$`, $options: 'i' };
  const keyRegex = { $regex: `^${escapeRegex(key)}$`, $options: 'i' };
  const slugRegex = { $regex: `^${escapeRegex(slug)}$`, $options: 'i' };

  const duplicate = await col.findOne({
    businessId: bScope,
    isActive: { $ne: false },
    $or: [
      { key: keyRegex },
      { slug: slugRegex },
      { name: nameRegex },
      { label: labelRegex },
    ],
  });
  if (duplicate) {
    if (String(duplicate.key || '').toLowerCase() === key.toLowerCase()) {
      return json({ error: `Filter key "${key}" already exists.` }, 409);
    }
    if (String(duplicate.slug || '').toLowerCase() === slug.toLowerCase()) {
      return json({ error: `Filter slug "${slug}" already exists.` }, 409);
    }
    return json({ error: `Filter "${rawName}" already exists.` }, 409);
  }

  const existingByKeyOrSlug = await col.findOne({
    businessId: bScope,
    $or: [{ key: keyRegex }, { slug: slugRegex }],
  });
  const now = new Date();
  if (existingByKeyOrSlug && existingByKeyOrSlug.isActive === false) {
    const reactivated = {
      ...existingByKeyOrSlug,
      name: rawName,
      label: rawLabel,
      key,
      slug,
      icon,
      isActive,
      ecommerceVisible,
      updatedAt: now,
    };
    delete reactivated.deletedAt;
    await col.updateOne(
      { _id: existingByKeyOrSlug._id },
      {
        $set: {
          name: rawName,
          label: rawLabel,
          key,
          slug,
          icon,
          isActive,
          ecommerceVisible,
          updatedAt: now,
        },
        $unset: { deletedAt: '' },
      },
    );
    await bumpCatalogVersion(businessId);
    return json({ ok: true, reactivated: true, filter: shapeFilterDefinition(reactivated) }, 201);
  }

  const last = await col.find({ businessId: bScope }, { projection: { displayOrder: 1 } })
    .sort({ displayOrder: -1 }).limit(1).toArray();
  const displayOrder = Math.max(BUILT_IN_FILTER_DEFS.length, Number(last[0]?.displayOrder ?? BUILT_IN_FILTER_DEFS.length - 1)) + 1;

  const doc = {
    _id: new Types.ObjectId(),
    businessId: new Types.ObjectId(businessId),
    key,
    slug,
    name: rawName,
    label: rawLabel,
    icon,
    isActive,
    ecommerceVisible,
    displayOrder,
    createdAt: now,
    updatedAt: now,
  };

  await col.insertOne(doc);
  await bumpCatalogVersion(businessId);
  return json({ ok: true, filter: shapeFilterDefinition(doc) }, 201);
}
