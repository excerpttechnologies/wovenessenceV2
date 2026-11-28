import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { bumpCatalogVersion } from '@/lib/ecommerceCatalog';
import {
  BUILT_IN_FILTER_DEFS,
  FILTER_ICON_CHOICES,
} from '@/lib/ecommerceFilterIcons';
import {
  ECOMMERCE_FILTERS_COLLECTION,
  businessOrFilter,
  classifyExistingCustomMatch,
  isValidFilterKey,
  isValidFilterSlug,
  listFilterDefinitions,
  resolveBuiltInFilterMatch,
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
  const icon = ALLOWED_ICONS.has(String(body.icon || '')) ? String(body.icon) : 'tag';
  const isActive = body.isActive !== false;
  const ecommerceVisible = body.ecommerceVisible !== false;

  const builtInMatch = resolveBuiltInFilterMatch({
    name: rawName,
    label: rawLabel,
    key,
    slug,
  });
  if (builtInMatch.kind === 'conflict') {
    return json({ error: builtInMatch.error }, 409);
  }
  if (builtInMatch.kind === 'reuse') {
    const builtIn = builtInMatch.builtIn;
    await dbConnect();
    const db = mongoose.connection.db;
    const col = db.collection(ECOMMERCE_FILTERS_COLLECTION);
    const bScope = businessOrFilter(businessId);
    const tombstone = await col.findOne({ businessId: bScope, key: builtIn.key });
    const now = new Date();
    let reactivated = false;
    if (tombstone && (tombstone.deletedAt != null || tombstone.isActive === false)) {
      await col.updateOne(
        { _id: tombstone._id },
        {
          $set: { isActive: true, ecommerceVisible, updatedAt: now },
          $unset: { deletedAt: '' },
        },
      );
      await bumpCatalogVersion(businessId);
      reactivated = true;
    }
    return json({
      ok: true,
      reused: true,
      reactivated,
      filter: {
        ...builtIn,
        _id: builtIn.key,
        isActive: true,
        ecommerceVisible: builtIn.ecommerceVisible !== false,
      },
    }, 200, NO_STORE);
  }

  if (!isValidFilterKey(key)) {
    return json({ error: 'Filter key must start with a letter and contain only letters/numbers (2-48 chars).' }, 422);
  }
  if (!isValidFilterSlug(slug)) {
    return json({ error: 'Slug must use lowercase letters, numbers, and hyphens only (2-64 chars).' }, 422);
  }

  await dbConnect();
  const db = mongoose.connection.db;
  const col = db.collection(ECOMMERCE_FILTERS_COLLECTION);
  const bScope = businessOrFilter(businessId);
  const nameRegex = { $regex: `^${escapeRegex(rawName)}$`, $options: 'i' };
  const labelRegex = { $regex: `^${escapeRegex(rawLabel)}$`, $options: 'i' };
  const keyRegex = { $regex: `^${escapeRegex(key)}$`, $options: 'i' };
  const slugRegex = { $regex: `^${escapeRegex(slug)}$`, $options: 'i' };

  const candidates = await col.find({
    businessId: bScope,
    $or: [
      { key: keyRegex },
      { slug: slugRegex },
      { name: nameRegex },
      { label: labelRegex },
    ],
  }).toArray();

  const activeMatches = candidates.filter((c) => c.deletedAt == null && c.isActive !== false);
  const customMatch = classifyExistingCustomMatch(activeMatches, {
    name: rawName,
    label: rawLabel,
    key,
    slug,
  });
  if (customMatch.kind === 'conflict') {
    return json({ error: customMatch.error }, 409);
  }
  if (customMatch.kind === 'reuse') {
    return json({
      ok: true,
      reused: true,
      filter: shapeFilterDefinition(customMatch.existing),
    }, 200, NO_STORE);
  }

  const existingByKeyOrSlug = candidates.find(
    (c) => String(c.key || '').toLowerCase() === key.toLowerCase()
      || String(c.slug || '').toLowerCase() === slug.toLowerCase(),
  ) || candidates[0];
  const now = new Date();
  if (existingByKeyOrSlug && (existingByKeyOrSlug.isActive === false || existingByKeyOrSlug.deletedAt != null)) {
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
