import mongoose from 'mongoose';

/* Barcode Merge - one document per merge of several source barcodes into one
   new merged barcode.

   Source barcode rows are never deleted. On finalise they are marked MERGED
   with qtyNum 0, each source's quantity and prices are copied into `sources`
   here, and the merged barcode carries the combined quantity. Cancel restores
   the sources if the merged barcode has not moved since. */

export const LABEL_FIELD = 'mergeNo';

export const MERGE_STATUS = {
  DRAFT: 'Draft',
  FINALIZED: 'Finalized',
  CANCELLED: 'Cancelled',
};

const mergeSourceSchema = new mongoose.Schema(
  {
    barcodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'barcodeLabel', default: null },
    barcodeNo: { type: String, default: '' },
    qty: { type: Number, default: 0 },
    uom: { type: String, default: '' },
    uomType: { type: String, default: 'PC' },
    conversionFactor: { type: Number, default: 1 },
    qtyInMergedUom: { type: Number, default: 0 },

    /* every source's own prices are preserved, never averaged away */
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

    grcId: { type: mongoose.Schema.Types.ObjectId, ref: 'grc', default: null },
    grcNo: { type: String, default: '' },
    batchNo: { type: String, default: '' },
    splitId: { type: mongoose.Schema.Types.ObjectId, ref: 'barcodeSplit', default: null },
    parentBarcodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'barcodeLabel', default: null },
    rootBarcodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'barcodeLabel', default: null },
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

const BarcodeMergeSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    mergeNo: { type: String, default: '', index: true },
    status: { type: String, enum: Object.values(MERGE_STATUS), default: MERGE_STATUS.DRAFT, index: true },

    mergedBarcodeId: { type: mongoose.Schema.Types.ObjectId, ref: 'barcodeLabel', default: null },
    mergedBarcodeNo: { type: String, default: '', index: true },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'item', default: null, index: true },
    itemCode: { type: String, default: '', index: true },
    itemName: { type: String, default: '' },

    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'supplier', default: null, index: true },
    supplierName: { type: String, default: '' },
    supplierCode: { type: String, default: '' },

    totalQty: { type: Number, default: 0 },
    uom: { type: String, default: '' },
    uomType: { type: String, default: 'PC' },
    sourceCount: { type: Number, default: 0 },

    /* the approved merged prices - entered, never averaged */
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

    snapshot: { type: mongoose.Schema.Types.Mixed, default: {} },
    sources: { type: [mergeSourceSchema], default: [] },

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

BarcodeMergeSchema.index({ businessId: 1, mergeNo: 1 }, { unique: true });
BarcodeMergeSchema.index({ businessId: 1, status: 1, createdAt: -1 });
BarcodeMergeSchema.index({ 'sources.barcodeId': 1 });

export default mongoose.models.barcodeMerge ||
  mongoose.model('barcodeMerge', BarcodeMergeSchema, 'barcodemer');
