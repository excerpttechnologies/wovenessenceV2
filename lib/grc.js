import mongoose from 'mongoose';

const { Schema } = mongoose;

/* GRC header document. One per "Goods Receipt Challan" submission from the
   barcode generation screen. Field names mirror the `columns` list for
   'transaction/purchase/grc' in purchaseRegistry.js. */
const grcSchema = new Schema(
  {
    supplierId: { type: String, default: '' },
    grcNumber: { type: String, default: '' },
    grcDate: { type: Date, default: Date.now },
    vendorDocNo: { type: String, default: '' },
    vendorDocDate: { type: Date },
    logisticId: { type: String, default: '' },
    purchaseGroupId: { type: String, default: '' },
    occasion: { type: String, default: '' },
    agentId: { type: String, default: '' },
    procurementTypeId: { type: String, default: '' },
    purchaseTermId: { type: String, default: '' },

    taxable: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },

    // tenant scope, stored as plain strings to match whatever ScopeContext provides
    businessId: { type: String, default: '' },
    locationId: { type: String, default: '' },
    finYear: { type: String, default: '' },
  },
  { timestamps: true }
);

/* collection pinned lowercase, same reasoning as barcodeLabel.js - avoid
   Mongoose's auto-pluralisation ('grc' -> 'grcs') causing a mismatch with
   whatever the rest of the app expects. */
export const Grc =
  mongoose.models.grc || mongoose.model('grc', grcSchema, 'grc');