import mongoose from 'mongoose';

/* B2B Invoice
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'invoiceNo';

const B2bInvoiceSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, default: null },
    invoiceNo: { type: String, default: '' },
    customerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    customerContact: { type: String, default: '' },
    gstNo: { type: String, default: '' },
    state: { type: String, default: '' },
    totalTaxable: { type: Number, default: 0 },
    totalIgst: { type: Number, default: 0 },
    totalCgst: { type: Number, default: 0 },
    totalSgst: { type: Number, default: 0 },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.b2bInvoice ||
  mongoose.model('b2bInvoice', B2bInvoiceSchema, 'b2binvoice');
