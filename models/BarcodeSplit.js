import mongoose from 'mongoose';

/* Barcode Split - one document per split of one original barcode into one or
   more child barcodes.

   The transaction is the audit record; the barcodeLabel rows remain the only
   place stock lives. A Draft never touches stock. Finalising writes the child
   rows, reduces the original and posts the movement ledger rows in one
   transaction (lib/barcodeSplit.js).

   Supplier, GRC, purchase reference and every item attribute are COPIED here
   from the original barcode at the time of the split. They are copied, not
   re-entered: the original barcode stays the source of truth, and the split
   cannot rewrite it. */

export const LABEL_FIELD = 'splitNo';

export const SPLIT_STATUS = {
  DRAFT: 'Draft',
  FINALIZED: 'Finalized',
  CANCELLED: 'Cancelled',
};

const splitLineSchema = new mongoose.Schema(
  {
    childBarcodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'barcodeLabel', default: null },
    childBarcodeNo: { type: String, default: '' },

    /* quantity as entered, in the line's own UOM */
    qty: { type: Number, default: 0 },
    uom: { type: String, default: '' },
    uomType: { type: String, default: 'PC' },

    /* the conversion used to express this line in the original's UOM */
    conversionFactor: { type: Number, default: 1 },
    qtyInOriginalUom: { type: Number, default: 0 },

    /* new prices for THIS child - never the original's prices */
    purchaseRate: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    finalPurchaseRate: { type: Number, default: 0 },
    rsp: { type: Number, default: 0 },
    rspOfferPrice: { type: Number, default: 0 },
    wsp: { type: Number, default: 0 },
    wspOfferPrice: { type: Number, default: 0 },
    dp: { type: Number, default: 0 },
    dpOfferPrice: { type: Number, default: 0 },
    sellingPrice: { type: Number, default: 0 },

    /* inherited context, kept per line so the summary survives a master edit */
    itemCode: { type: String, default: '' },
    itemName: { type: String, default: '' },
    hsn: { type: String, default: '' },
    gst: { type: String, default: '' },
    batchNo: { type: String, default: '' },
    goodsType: { type: String, default: '' },
  },
  { _id: true }
);

const auditSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: { type: String, default: '' },
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userName: { type: String, default: '' },
    userEmail: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const BarcodeSplitSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    splitNo: { type: String, default: '', index: true },
    status: { type: String, enum: Object.values(SPLIT_STATUS), default: SPLIT_STATUS.DRAFT, index: true },

    /* ---- the original barcode (never deleted by a split) ---- */
    originalBarcodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'barcodeLabel', default: null, index: true },
    originalBarcodeNo: { type: String, default: '', index: true },
    originalQty: { type: Number, default: 0 },
    originalUom: { type: String, default: '' },
    uomType: { type: String, default: 'PC' },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'item', default: null, index: true },
    itemCode: { type: String, default: '', index: true },
    itemName: { type: String, default: '' },

    /* inherited and locked - the split can never change these */
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'supplier', default: null, index: true },
    supplierName: { type: String, default: '' },
    supplierCode: { type: String, default: '' },
    grcId: { type: mongoose.Schema.Types.ObjectId, ref: 'grc', default: null, index: true },
    grcNo: { type: String, default: '' },
    purchaseRef: { type: String, default: '' },

    /* a full snapshot of the original's inherited fields, so the detail screen
       can show exactly what was inherited even if a master record changes */
    snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },

    totalSplitQty: { type: Number, default: 0 },       // expressed in originalUom
    remainingQty: { type: Number, default: 0 },        // original qty after the split
    childCount: { type: Number, default: 0 },

    lines: { type: [splitLineSchema], default: [] },

    notes: { type: String, default: '' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdByName: { type: String, default: '' },
    createdByEmail: { type: String, default: '' },
    finalizedAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },

    audit: { type: [auditSchema], default: [] },
  },
  { timestamps: true }
);

BarcodeSplitSchema.index({ businessId: 1, splitNo: 1 }, { unique: true });
BarcodeSplitSchema.index({ businessId: 1, status: 1, createdAt: -1 });
BarcodeSplitSchema.index({ originalBarcodeId: 1, createdAt: -1 });

export default mongoose.models.barcodeSplit ||
  mongoose.model('barcodeSplit', BarcodeSplitSchema, 'barcodesplit');
