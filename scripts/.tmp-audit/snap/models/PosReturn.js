import mongoose from 'mongoose';

/* POS Returns - a credit raised against a POS invoice.

   The model previously declared `locationId` TWICE, the second declaration
   without a ref, which is what Mongoose keeps; the field silently lost its
   relationship to companyLocation and every location join on a return came
   back empty. Declared once now, with the ref.

   The rest of the fields are the return itself: which invoice, which units,
   how much was refunded and how. Returned quantity is not a number the
   operator types - it is the count of the barcodes on this document, and the
   route checks each one was actually sold on the invoice being credited.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'invoiceNo';

const PosReturnSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    date: { type: Date, default: null },

    /* the credit note's own number */
    invoiceNo: { type: String, default: '', index: true },

    /* what is being credited */
    parentInvoice: { type: String, default: '', index: true },
    parentInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'posInvoice', default: null },

    customerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    customerName: { type: String, default: '' },
    customerContact: { type: String, default: '' },

    /* money. refundAmount is what actually left the till. */
    totalAmount: { type: Number, default: 0 },
    refundAmount: { type: Number, default: 0 },
    refundMode: { type: String, default: 'Cash' },
    paymentStatus: { type: String, default: 'Refunded' },

    reason: { type: String, default: '' },
    notes: { type: String, default: '' },

    returnedQty: { type: Number, default: 0 },
    returnedCount: { type: Number, default: 0 },

    /* who processed it, for the till audit */
    processedBy: { type: String, default: '' },

    /* line items: one per barcode returned */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

PosReturnSchema.index({ businessId: 1, date: -1 });
PosReturnSchema.index({ parentInvoiceId: 1 });
PosReturnSchema.index({ 'items.barcodeNo': 1 });

export default mongoose.models.posReturn ||
  mongoose.model('posReturn', PosReturnSchema, 'posreturn');
