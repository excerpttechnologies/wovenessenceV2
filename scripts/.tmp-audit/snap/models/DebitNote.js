import mongoose from 'mongoose';

/* Debit Notes
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'debitNoteNo';

const DebitNoteSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    vendorGstNo: { type: String, default: '' },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    logisticId: { type: mongoose.Schema.Types.ObjectId, ref: 'logistic', default: null },
    vendorInvoiceCopy: { type: String, default: '' },
    vendorWaybill: { type: String, default: '' },
    debitNoteNo: { type: String, default: '' },
    debitCreadted: { type: Date, default: null },
    supplierId: { type: mongoose.Schema.Types.ObjectId, default: null },
    grtNo: { type: String, default: '' },
    qty: { type: Number, default: 0 },
    value: { type: Number, default: 0 },
    remaining: { type: Number, default: 0 },
    adjStatus: { type: String, default: '' },
    adjustedAgainstPi: { type: String, default: '' },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.debitNote ||
  mongoose.model('debitNote', DebitNoteSchema, 'debitnote');
