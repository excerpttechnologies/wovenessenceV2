import mongoose, { isValidObjectId, Types } from 'mongoose';

/* CLASSIFICATION COLLECTIONS (29-10-2026)

   The weave / fabric / craft / occasion / colour names live in their own
   collections - `productclassificationoption` is no longer read or written:

     byWeave -> byweave      byFabric -> byfabric      byCraft -> bycraft
     byOccasion -> byoccasion                          byColour -> bycolour

   One row: { businessId, type, productType, name, displayOrder, isActive,
   createdAt, updatedAt }. productType is the group (SAREES, FABRICS,
   PLAIN FABRICS, DUPATTA, SIMPLE - see CLASSIFICATION_GROUPS), so the same
   name can exist once per group.

   ecommerceproduct keeps storing the row _ids in byWeave / byFabric / ...;
   the e-commerce project turns them into names from these same collections. */

export const CLASSIFICATION_COLLECTIONS = {
  byWeave: 'byweave',
  byFabric: 'byfabric',
  byCraft: 'bycraft',
  byOccasion: 'byoccasion',
  byColour: 'bycolour',
};

export const CLASSIFICATION_FIELDS = Object.keys(CLASSIFICATION_COLLECTIONS);

/* a business id may be stored as an ObjectId or as its string */
export const businessMatch = (id) => ({ $in: [new Types.ObjectId(String(id)), String(id)] });

export const classificationCollection = (type) =>
  mongoose.connection.db.collection(CLASSIFICATION_COLLECTIONS[type]);

/* the rows of one business - every type, or the types given - as
   [{ _id, type, productType, name, ... }], active ones only */
export async function listClassificationOptions(businessId, { types = CLASSIFICATION_FIELDS, productType } = {}) {
  if (!isValidObjectId(String(businessId || ''))) return [];
  const filter = { businessId: businessMatch(businessId), isActive: { $ne: false } };
  if (productType) filter.productType = productType;
  const lists = await Promise.all(types.map(async (type) => {
    const rows = await classificationCollection(type)
      .find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .toArray();
    return rows.map((row) => ({ ...row, type }));
  }));
  return lists.flat();
}

/* id -> { name, type, productType } for the ids given (any type) */
export async function classificationOptionsById(ids) {
  const objectIds = [...new Set((ids || []).map((id) => String(id || '')).filter(isValidObjectId))]
    .map((id) => new Types.ObjectId(id));
  const found = new Map();
  if (!objectIds.length) return found;
  await Promise.all(CLASSIFICATION_FIELDS.map(async (type) => {
    const rows = await classificationCollection(type)
      .find({ _id: { $in: objectIds } }, { projection: { name: 1, productType: 1, isActive: 1 } })
      .toArray();
    rows.forEach((row) => found.set(String(row._id), {
      name: row.name || '',
      type,
      productType: row.productType || '',
      isActive: row.isActive !== false,
    }));
  }));
  return found;
}
