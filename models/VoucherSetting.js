import mongoose from 'mongoose';

/* Voucher Settings — Debtor / Creditor Ledger Groups
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const VoucherSettingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    groups: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

export default mongoose.models.voucherSetting ||
  mongoose.model('voucherSetting', VoucherSettingSchema, 'vouchersetting');
