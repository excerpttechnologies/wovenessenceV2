import mongoose, { isValidObjectId, Types } from 'mongoose';

/* CLASSIFICATION COLLECTIONS (29-10-2026)

   The weave / fabric / craft / occasion / colour names live in their own
   collections:
     byWeave -> byweave      byFabric -> byfabric      byCraft -> bycraft
     byOccasion -> byoccasion                          byColour -> bycolour

   One row: { businessId, type, productType, name, displayOrder, isActive,
   createdAt, updatedAt }. productType is the group (SAREES, FABRICS,
   PLAIN FABRICS, DUPATTA, SIMPLE - see CLASSIFICATION_GROUPS).

   Both dedicated collections and productclassificationoption are queried to
   ensure full backward compatibility with all existing master data. */

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
  const bMatch = businessMatch(businessId);
  const filter = {
    businessId: bMatch,
    isActive: { $ne: false },
    ...(productType ? {
      $or: [
        { productType },
        { productType: { $exists: false } },
        { productType: null },
        { productType: '' },
      ],
    } : {}),
  };

  const db = mongoose.connection.db;

  const lists = await Promise.all(types.map(async (type) => {
    // 1. Fetch from dedicated collection
    let colRows = [];
    try {
      colRows = await classificationCollection(type)
        .find(filter)
        .sort({ displayOrder: 1, name: 1 })
        .toArray();
    } catch {}

    // 2. Fetch from productclassificationoption collection
    let pcoRows = [];
    try {
      const pcoFilter = {
        businessId: bMatch,
        type,
        isActive: { $ne: false },
        ...(productType ? {
          $or: [
            { productType },
            { productType: { $exists: false } },
            { productType: null },
            { productType: '' },
          ],
        } : {}),
      };
      pcoRows = await db.collection('productclassificationoption')
        .find(pcoFilter)
        .sort({ displayOrder: 1, name: 1 })
        .toArray();
    } catch {}

    const byId = new Map();
    const byName = new Map();

    const addRow = (row) => {
      const idStr = String(row._id);
      const nameKey = String(row.name || '').trim().toLowerCase();
      if (!nameKey) return;
      if (byId.has(idStr)) return;
      if (byName.has(nameKey)) {
        const existing = byName.get(nameKey);
        if (row.productType && !existing.productType) {
          byId.delete(String(existing._id));
          byId.set(idStr, { ...row, type });
          byName.set(nameKey, { ...row, type });
        }
        return;
      }
      const item = { ...row, type };
      byId.set(idStr, item);
      byName.set(nameKey, item);
    };

    colRows.forEach(addRow);
    pcoRows.forEach(addRow);

    return [...byId.values()];
  }));

  return lists.flat();
}

/* id -> { name, type, productType } for the ids given (any type) */
export async function classificationOptionsById(ids) {
  const objectIds = [...new Set((ids || []).map((id) => String(id || '')).filter(isValidObjectId))]
    .map((id) => new Types.ObjectId(id));
  const found = new Map();
  if (!objectIds.length) return found;
  const db = mongoose.connection.db;

  await Promise.all(CLASSIFICATION_FIELDS.map(async (type) => {
    try {
      const rows = await classificationCollection(type)
        .find({ _id: { $in: objectIds } }, { projection: { name: 1, productType: 1, isActive: 1, displayOrder: 1 } })
        .toArray();
      rows.forEach((row) => found.set(String(row._id), {
        name: row.name || '',
        type,
        productType: row.productType || '',
        displayOrder: Number(row.displayOrder) || 0,
        isActive: row.isActive !== false,
      }));
    } catch {}
  }));

  const unresolved = objectIds.filter((id) => !found.has(String(id)));
  if (unresolved.length) {
    try {
      const pcoRows = await db.collection('productclassificationoption')
        .find({ _id: { $in: unresolved } }, { projection: { name: 1, type: 1, productType: 1, isActive: 1, displayOrder: 1 } })
        .toArray();
      pcoRows.forEach((row) => found.set(String(row._id), {
        name: row.name || '',
        type: row.type || '',
        productType: row.productType || '',
        displayOrder: Number(row.displayOrder) || 0,
        isActive: row.isActive !== false,
      }));
    } catch {}
  }

  return found;
}
