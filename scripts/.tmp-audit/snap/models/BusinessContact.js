import mongoose from 'mongoose';

/* Business Contact Mapping
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const BusinessContactSchema = new mongoose.Schema(
  {
    pairs: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.models.businessContact ||
  mongoose.model('businessContact', BusinessContactSchema, 'businesscontact');
