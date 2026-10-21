import mongoose from 'mongoose';

/* Voucher - Receipt, Payment and Contra.

   One shape for all three, because they are the same document: a set of
   ledger lines that must balance. What differs is which side the party sits
   on and what the sides are called on screen.

     Receipt  money in   Dr bank/cash        Cr customer
     Payment  money out  Dr supplier         Cr bank/cash  (+ Cr discount)
     Contra   transfer   Dr destination a/c  Cr source a/c

   Names are COPIED onto the voucher at save time rather than joined on read,
   so renaming a ledger later never rewrites an issued voucher - the same
   reasoning as the inter company documents.

   This is the first thing in the project that actually POSTS: every other
   balance is derived at read time. A voucher line is a real entry, which is
   why nothing here recomputes itself and why editing is not offered - a
   posted voucher is reversed by deleting it, not amended in place.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'voucherNo';

export const RECEIPT = 'Receipt';
export const PAYMENT = 'Payment';
export const CONTRA = 'Contra';

/* which line is which - drives the badges and the list columns */
export const ROLES = ['party', 'bank', 'discount', 'to', 'from'];

const LineSchema = new mongoose.Schema({
  ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
  ledgerName: { type: String, default: '' },
  role: { type: String, enum: ROLES, default: 'bank' },
  debit: { type: Number, default: 0 },
  credit: { type: Number, default: 0 },
  remark: { type: String, default: '' },
}, { _id: false });

const VoucherSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    type: { type: String, enum: [RECEIPT, PAYMENT, CONTRA], required: true, index: true },
    voucherNo: { type: String, default: '', index: true },
    voucherDate: { type: Date, default: Date.now },
    remark: { type: String, default: '' },

    lines: { type: [LineSchema], default: [] },

    /* denormalised for the list columns - Customer Name / Supplier Name on
       receipt and payment, To / From on contra */
    partyLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null, index: true },
    partyName: { type: String, default: '' },
    toName: { type: String, default: '' },
    fromName: { type: String, default: '' },

    totalDebit: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },
    /* the value of the voucher - both sides are equal, so either will do */
    totalAmount: { type: Number, default: 0 },

    /* How much of this voucher has been allocated against invoices. Invoice
       allocation is not built (the Adjust button is disabled on the form),
       so this stays 0 and the whole amount shows as Advance / Unsettled.
       When allocation lands, only this field and the Adjust action change. */
    adjustedAmount: { type: Number, default: 0 },

    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

/* the list's default sort, and the per-type numbering lookup */
VoucherSchema.index({ businessId: 1, finYear: 1, type: 1, voucherDate: -1 });

export default mongoose.models.voucher ||
  mongoose.model('voucher', VoucherSchema, 'voucher');
