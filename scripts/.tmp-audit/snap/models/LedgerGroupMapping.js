import mongoose from 'mongoose';

/* Ledger Group Mapping
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const LedgerGroupMappingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    pairs: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.models.ledgerGroupMapping ||
  mongoose.model('ledgerGroupMapping', LedgerGroupMappingSchema, 'ledgergroupmapping');
