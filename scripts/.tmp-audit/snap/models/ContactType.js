import mongoose from 'mongoose';

/* Contact Types
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const ContactTypeSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    contactType: { type: String, default: '' },
    prefix: { type: String, default: '' },
    status: { type: String, default: "Active" },
    colorLebel: { type: String, default: '' },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.contactType ||
  mongoose.model('contactType', ContactTypeSchema, 'contacttype');
