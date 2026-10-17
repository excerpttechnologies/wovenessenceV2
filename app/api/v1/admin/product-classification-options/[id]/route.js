import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import ProductClassificationOption from '@/models/ProductClassificationOption';
import Item from '@/models/Item';
import { requireSession } from '@/lib/session';

const json = (d, s = 200) => Response.json(d, { status: s });

/* /api/v1/admin/product-classification-options/[id]
   
   DELETE: Soft delete a classification option (sets isActive: false)
           Only allowed if no items are using it */

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  if (!isValidObjectId(id)) {
    return json({ error: 'Invalid ID' }, 422);
  }

  const option = await ProductClassificationOption.findById(id).lean();
  if (!option) {
    return json({ error: 'Classification option not found' }, 404);
  }

  // Check if any items are using this classification
  const classificationFields = ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'];
  const usageChecks = await Promise.all(
    classificationFields.map(field =>
      Item.countDocuments({ [field]: id }).limit(1)
    )
  );

  const isUsed = usageChecks.some(count => count > 0);

  if (isUsed) {
    return json({ 
      error: `Cannot delete "${option.name}" because it is assigned to one or more products. Remove it from products first.` 
    }, 422);
  }

  // Soft delete
  await ProductClassificationOption.findByIdAndUpdate(id, { 
    isActive: false 
  });

  return json({ ok: true });
}
