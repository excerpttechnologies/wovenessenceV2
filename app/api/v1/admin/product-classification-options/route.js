import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import ProductClassificationOption, { CLASSIFICATION_TYPES } from '@/models/ProductClassificationOption';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';

const json = (d, s = 200) => Response.json(d, { status: s });

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

  const filter = { businessId, isActive: true };
  
  // Filter by type if provided
  const type = sp.get('type');
  if (type) {
    if (!Object.values(CLASSIFICATION_TYPES).includes(type)) {
      return json({ error: 'Invalid classification type' }, 422);
    }
    filter.type = type;
  }

  // Search by name if provided
  const search = (sp.get('search') || '').trim();
  if (search) {
    filter.name = { $regex: escapeRegex(search), $options: 'i' };
  }

  const options = await ProductClassificationOption.find(filter)
    .sort({ type: 1, displayOrder: 1, name: 1 })
    .lean();

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
