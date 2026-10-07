import mongoose from 'mongoose';

/* Attribute Addons
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const AttributeAddonSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

export default mongoose.models.attributeAddon ||
  mongoose.model('attributeAddon', AttributeAddonSchema, 'attributeaddon');
