import mongoose from 'mongoose';

/* Sales Invoices
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'salesInvoiceNo';

const SalesInvoiceSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    customerGstn: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    taxableValue: { type: Number, default: null },
    roundOff: { type: Number, default: null },
    netValue: { type: Number, default: null },
    salesInvoiceNo: { type: String, default: '' },
    customerMobile: { type: String, default: '' },
    deliveryChallanNo: { type: String, default: '' },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.salesInvoice ||
  mongoose.model('salesInvoice', SalesInvoiceSchema, 'salesinvoice');
