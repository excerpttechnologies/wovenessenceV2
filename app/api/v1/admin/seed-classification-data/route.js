import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { classificationCollection } from '@/lib/classificationCollections';

const json = (data, status = 200) => Response.json(data, { status });

const SAMPLE_DATA = {
  byWeave: [
    { name: 'HANDLOOM', productType: 'SAREES' },
    { name: 'POWER LOOM', productType: 'SAREES' },
    { name: 'JACQUARD', productType: 'SAREES' },
    { name: 'BROCADE', productType: 'SAREES' },
  ],
  byFabric: [
    { name: 'BANARASI SILK', productType: 'SAREES' },
    { name: 'KANCHIPURAM SILK', productType: 'SAREES' },
    { name: 'TUSSAR SILK', productType: 'SAREES' },
    { name: 'CHANDERI', productType: 'SAREES' },
    { name: 'COTTON', productType: 'SAREES' },
    { name: 'SILK', productType: 'FABRICS' },
    { name: 'COTTON FABRIC', productType: 'FABRICS' },
  ],
  byCraft: [
    { name: 'HAND EMBROIDERED', productType: 'SAREES' },
    { name: 'ZARI WORK', productType: 'SAREES' },
    { name: 'BLOCK PRINT', productType: 'SAREES' },
    { name: 'KALAMKARI', productType: 'SAREES' },
  ],
  byOccasion: [
    { name: 'WEDDING', productType: 'SAREES' },
    { name: 'FESTIVAL', productType: 'SAREES' },
    { name: 'PARTY', productType: 'SAREES' },
    { name: 'CASUAL', productType: 'SAREES' },
    { name: 'FORMAL', productType: 'SAREES' },
  ],
  byColour: [
    { name: 'RED', productType: 'FABRICS' },
    { name: 'BLUE', productType: 'FABRICS' },
    { name: 'GREEN', productType: 'FABRICS' },
    { name: 'YELLOW', productType: 'FABRICS' },
  ],
};

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const businessId = String(body.business || '');
  
  if (!isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }

  await dbConnect();
  
  const results = {
    added: 0,
    skipped: 0,
    details: [],
  };

  const businessObjectId = new Types.ObjectId(businessId);

  for (const [type, items] of Object.entries(SAMPLE_DATA)) {
    const collection = classificationCollection(type);
    
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if already exists
      const existing = await collection.findOne({
        businessId: { $in: [businessObjectId, businessId] },
        productType: item.productType,
        name: { $regex: `^${item.name}$`, $options: 'i' },
      });

      if (existing) {
        results.skipped++;
        results.details.push(`Skipped: ${type} - ${item.name} (already exists)`);
        continue;
      }

      // Insert new option
      const doc = {
        businessId: businessObjectId,
        type,
        productType: item.productType,
        name: item.name,
        displayOrder: i,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      await collection.insertOne(doc);
      results.added++;
      results.details.push(`Added: ${type} - ${item.name} for ${item.productType}`);
    }
  }

  return json({
    success: true,
    message: `Seeding complete! Added ${results.added} new options, skipped ${results.skipped} existing.`,
    ...results,
  });
}
