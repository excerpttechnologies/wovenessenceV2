import mongoose from 'mongoose';

/* Ledger Groups
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'groupName';

const LedgerGroupSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    groupName: { type: String, default: '' },
    status: { type: String, default: "Active" },
    parentGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledgerGroup', default: null },
  },
  { timestamps: true }
);

export default mongoose.models.ledgerGroup ||
  mongoose.model('ledgerGroup', LedgerGroupSchema, 'ledgergroup');
