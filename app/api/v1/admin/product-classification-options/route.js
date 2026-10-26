import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import ProductClassificationOption, { CLASSIFICATION_TYPES } from '@/models/ProductClassificationOption';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import {
  FABRIC_CLASSIFICATION_OPTIONS,
  PLAIN_FABRIC_CLASSIFICATION_OPTIONS,
} from '@/lib/productClassificationConstants';

const json = (d, s = 200) => Response.json(d, { status: s });

const DEFAULT_OPTIONS = {
  byWeave: ['Brocade', 'Crepe', 'Double Ikat', 'Handloom', 'Jacquard', 'Jamdani', 'Kadwa', 'Korvai', 'Kuppadam', 'Plain Weave', 'Single Ikat', 'Tissue'],
  byFabric: ['Banarasi Silk Sarees', 'Chanderi Sarees', 'Cotton Sarees', 'Gadwal Silk Sarees', 'Georgette Sarees', 'Kanchipuram Silk Sarees', 'Linen Sarees', 'Mysore Silk Sarees', 'Organza Sarees', 'Paithani Silk Sarees', 'Patola Silk Sarees', 'Tussar Silk Sarees'],
  byCraft: ['Bandhani', 'Block Print', 'Cutwork', 'Hand Embroidery', 'Jamdani', 'Kalamkari', 'Meenakari', 'Zari'],
  byOccasion: ['Bridal', 'Casual', 'Festive', 'Office', 'Party', 'Pooja', 'Wedding'],
  byColour: ['Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Orange', 'Black', 'White', 'Beige', 'Gold', 'Silver', 'Maroon', 'Navy Blue', 'Teal', 'Magenta', 'Peach', 'Cream', 'Brown', 'Grey', 'Multicolour', 'Pastel', 'Neon', 'Metallic'],
};

async function ensureDefaultOptions(businessId, requestedType) {
  const types = requestedType ? [requestedType] : Object.keys(DEFAULT_OPTIONS);
  const defaults = types.flatMap((type) =>
    DEFAULT_OPTIONS[type].map((name, index) => ({ type, name, displayOrder: index + 1 }))
  );
  const existing = await ProductClassificationOption.find({ businessId, type: { $in: types } })
    .select('type name')
    .lean();
  const existingNames = new Set(existing.map((option) => `${option.type}:${option.name.trim().toLowerCase()}`));
  const missing = defaults.filter((option) => !existingNames.has(`${option.type}:${option.name.toLowerCase()}`));

  const writes = await Promise.allSettled(missing.map((option) => ProductClassificationOption.updateOne(
    {
      businessId,
      type: option.type,
      name: { $regex: `^${escapeRegex(option.name)}$`, $options: 'i' },
    },
    {
      $setOnInsert: {
        businessId,
        ...option,
        isActive: true,
      },
    },
    { upsert: true }
  )));
  const failure = writes.find((result) => result.status === 'rejected' && result.reason?.code !== 11000);
  if (failure) throw failure.reason;
}

/* /api/v1/admin/product-classification-options
   
   GET: List all classification options for a business, optionally filtered by type
   POST: Create a new classification option
   
   Classification types: byWeave, byFabric, byCraft, byOccasion, byColour */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const businessId = sp.get('business');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }

  // Filter by type if provided
  const type = sp.get('type');
  if (type) {
    if (!Object.values(CLASSIFICATION_TYPES).includes(type)) {
      return json({ error: 'Invalid classification type' }, 422);
    }
  }

  const productType = (sp.get('productType') || '').trim().toUpperCase();
  const productTypeOptions = productType === 'PLAIN FABRICS'
    ? PLAIN_FABRIC_CLASSIFICATION_OPTIONS[type]
    : productType === 'FABRICS'
      ? FABRIC_CLASSIFICATION_OPTIONS[type]
    : null;
  if (productTypeOptions) {
    const writes = await Promise.allSettled(productTypeOptions.map((name, index) =>
      ProductClassificationOption.updateOne(
        {
          businessId,
          type,
          name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
        },
        {
          $setOnInsert: {
            businessId,
            type,
            name,
            displayOrder: index + 1,
            isActive: true,
          },
        },
        { upsert: true }
      )
    ));
    const failure = writes.find((result) => result.status === 'rejected' && result.reason?.code !== 11000);
    if (failure) throw failure.reason;
  } else {
    await ensureDefaultOptions(businessId, type);
  }

  const filter = { businessId, isActive: true };
  if (type) filter.type = type;
  if (productTypeOptions) filter.name = { $in: productTypeOptions };

  // Search by name if provided
  const search = (sp.get('search') || '').trim();
  if (search) {
    const nameSearch = { name: { $regex: escapeRegex(search), $options: 'i' } };
    if (productTypeOptions) filter.$and = [nameSearch];
    else filter.name = nameSearch.name;
  }

  const options = await ProductClassificationOption.find(filter)
    .sort({ type: 1, displayOrder: 1, name: 1 })
    .lean();
  if (productTypeOptions) {
    const order = new Map(productTypeOptions.map((name, index) => [name.toLowerCase(), index]));
    options.sort((a, b) => order.get(a.name.toLowerCase()) - order.get(b.name.toLowerCase()));
  }

  // Group by type for easier consumption
  const grouped = {};
  Object.values(CLASSIFICATION_TYPES).forEach(t => { grouped[t] = []; });
  
  options.forEach(opt => {
    if (grouped[opt.type]) {
      grouped[opt.type].push({
        _id: String(opt._id),
        name: opt.name,
        type: opt.type,
        displayOrder: opt.displayOrder,
      });
    }
  });

  return json({ 
    options: grouped,
    all: options.map(opt => ({
      _id: String(opt._id),
      name: opt.name,
      type: opt.type,
      displayOrder: opt.displayOrder,
    }))
  });
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json();
  await dbConnect();

  const { business, type, name } = body;

  if (!business || !isValidObjectId(business)) {
    return json({ error: 'Valid business ID required' }, 422);
  }

  if (!type || !Object.values(CLASSIFICATION_TYPES).includes(type)) {
    return json({ error: 'Valid classification type required (byWeave, byFabric, byCraft, byOccasion, byColour)' }, 422);
  }

  const trimmedName = String(name || '').trim();
  if (!trimmedName || trimmedName.length > 100) {
    return json({ error: 'Name is required and must be 100 characters or less' }, 422);
  }

  // Check for duplicate
  const existing = await ProductClassificationOption.findOne({
    businessId: business,
    type,
    name: { $regex: `^${escapeRegex(trimmedName)}$`, $options: 'i' }
  });

  if (existing) {
    return json({ 
      error: `A ${type} option named "${trimmedName}" already exists` 
    }, 422);
  }

  // Get the next display order
  const maxOrder = await ProductClassificationOption.findOne(
    { businessId: business, type },
    { displayOrder: 1 }
  ).sort({ displayOrder: -1 }).lean();

  const created = await ProductClassificationOption.create({
    businessId: business,
    type,
    name: trimmedName,
    displayOrder: (maxOrder?.displayOrder ?? 0) + 1,
    isActive: true,
  });

  return json({ 
    ok: true, 
    option: {
      _id: String(created._id),
      name: created.name,
      type: created.type,
      displayOrder: created.displayOrder,
    }
  });
}
