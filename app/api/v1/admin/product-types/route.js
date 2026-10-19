import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { PRODUCT_TYPES } from '@/lib/productClassificationConstants';

const json = (data, status = 200) => Response.json(data, { status });
const TYPE_COLLECTION = 'producttypes';

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const businessId = new URL(req.url).searchParams.get('business');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }

  const connection = await dbConnect();
  const collection = connection.connection.db.collection(TYPE_COLLECTION);
  const defaults = PRODUCT_TYPES.filter((type) => type.value).map((type, index) => ({
    businessId,
    value: type.value,
    label: type.label,
    displayOrder: index,
    isActive: true,
  }));

  await collection.bulkWrite(defaults.map((type) => ({
    updateOne: {
      filter: { businessId, value: type.value },
      update: { $setOnInsert: type },
      upsert: true,
    },
  })));

  const types = await collection.find({ businessId, isActive: true })
    .sort({ displayOrder: 1, label: 1 })
    .project({ value: 1, label: 1, _id: 0 })
    .toArray();

  return json({ types: [{ value: '', label: 'Not Specified' }, ...types] });
}