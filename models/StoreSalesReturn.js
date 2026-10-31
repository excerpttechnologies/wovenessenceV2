import mongoose from 'mongoose';

/* Inter Store Sell - Sales Return.

   The buying store sends goods back to the store that invoiced them. Unlike a
   debit note this DOES move stock: the quantity leaves the returning store and
   goes back into the issuing store's stock, with a movement row for each side
   (lib/storeStock.js returnStoreStock).

   Stock moves once, when the return is saved. `returnQty` on the invoice lines
   is the guard: a return can never ask for more than was invoiced and not
   already returned, and a retried request cannot credit the same unit twice.

   Own collection + `module`, as with the other Inter Store documents. */

export const LABEL_FIELD = 'returnNo';
export const MODULE = 'interStoreSell';

const StoreSalesReturnSchema = new mongoose.Schema(
  {
    module: { type: String, default: MODULE, index: true },

    /* scope = the store returning the goods (the invoice's buyer) */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* the store that sold them, and takes them back into stock */
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },

    returnNo: { type: String, default: '', index: true },
    returnDate: { type: Date, default: null },

    salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'storeSalesInvoice', default: null, index: true },
    salesInvoiceNo: { type: String, default: '' },
    deliveryChallanIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },

    reason: { type: String, default: '' },
    gstMode: { type: String, enum: ['cgst_sgst', 'igst'], default: 'cgst_sgst' },

    taxableValue: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    status: { type: String, default: 'confirmed', index: true },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },

    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

StoreSalesReturnSchema.index({ businessId: 1, returnDate: 1 });

export default mongoose.models.storeSalesReturn ||
  mongoose.model('storeSalesReturn', StoreSalesReturnSchema, 'storesalesreturn');
