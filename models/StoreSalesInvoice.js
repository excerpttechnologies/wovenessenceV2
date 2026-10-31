import mongoose from 'mongoose';

/* Inter Store Sell - Sales Invoice (GST enabled).

   Raised by the SELLING store against the buyer store, from one or more
   Delivery Challans. The lines are copied from the challan's SAVED lines -
   never re-typed from a browser payload - and each copied line keeps the
   challan it came from so the two documents stay traceable.

   `debitQty`, `returnQty` and `invoicedQty` on every line are the running
   adjustments against that line; a Received Debit Note and a Sales Return
   both read them to cap themselves at what is still available.

   Own collection, and `module` stamped, for the same reason as
   models/StoreDeliveryChallan.js. */

export const LABEL_FIELD = 'invoiceNo';
export const MODULE = 'interStoreSell';

export const INVOICE_STATUS = {
  CONFIRMED: 'confirmed',
  DEBITED: 'debited',
  RETURNED: 'returned',
};

const StoreSalesInvoiceSchema = new mongoose.Schema(
  {
    module: { type: String, default: MODULE, index: true },

    /* the SELLING store */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* the buying store */
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    toLocationName: { type: String, default: '' },
    customerGstn: { type: String, default: '' },
    customerAddress: { type: String, default: '' },

    invoiceNo: { type: String, default: '', index: true },
    invoiceDate: { type: Date, default: null },

    /* traceability back to the challans this invoice bills */
    deliveryChallanIds: { type: [mongoose.Schema.Types.ObjectId], default: [], index: true },
    deliveryChallanNos: { type: [String], default: [] },

    gstMode: { type: String, enum: ['cgst_sgst', 'igst'], default: 'cgst_sgst' },

    taxableValue: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    status: { type: String, default: INVOICE_STATUS.CONFIRMED, index: true },
    remarks: { type: String, default: '' },

    /* free-form lines, as on the challan */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },

    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

StoreSalesInvoiceSchema.index({ businessId: 1, invoiceDate: 1 });

export default mongoose.models.storeSalesInvoice ||
  mongoose.model('storeSalesInvoice', StoreSalesInvoiceSchema, 'storesalesinvoice');
