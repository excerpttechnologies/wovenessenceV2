// import mongoose from 'mongoose';

// /* Purchase Invoices
//    Collection name pinned lowercase - Mongoose would pluralise it otherwise
//    and MongoDB collection names are case-sensitive. */

// export const LABEL_FIELD = 'purchaseInvoiceNo';

// const PurchaseInvoiceSchema = new mongoose.Schema(
//   {
//     businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
//     locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
//     finYear: { type: String, default: '', index: true },
//     supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
//     vendorGstNo: { type: String, default: '' },
//     grcNumber: { type: String, default: '' },
//     vendorDocNo: { type: String, default: '' },
//     grcDate: { type: Date, default: null },
//     vendorDocDate: { type: Date, default: null },
//     purchaseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseGroup', default: null },
//     occasion: { type: String, default: '' },
//     purchaseTermId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseTerm', default: null },
//     agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
//     logisticId: { type: mongoose.Schema.Types.ObjectId, ref: 'logistic', default: null },
//     vendorInvoiceCopy: { type: String, default: '' },
//     vendorWaybill: { type: String, default: '' },
//     purchaseInvoiceNo: { type: String, default: '' },
//     purchaseDate: { type: Date, default: null },
//     netPurchaseAmt: { type: Number, default: 0 },
//     totalPayable: { type: Number, default: 0 },

//     /* line items are free-form per document type */
//     items: { type: mongoose.Schema.Types.Mixed, default: [] },
//   },
//   { timestamps: true }
// );

// export default mongoose.models.purchaseInvoice ||
//   mongoose.model('purchaseInvoice', PurchaseInvoiceSchema, 'purchaseinvoice');




import mongoose from 'mongoose';

/* Purchase Invoices
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'purchaseInvoiceNo';

const PurchaseInvoiceSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    vendorGstNo: { type: String, default: '' },
    grcNumber: { type: String, default: '' },
    vendorDocNo: { type: String, default: '' },
    grcDate: { type: Date, default: null },
    vendorDocDate: { type: Date, default: null },
    purchaseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseGroup', default: null },
    occasion: { type: String, default: '' },
    purchaseTermId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseTerm', default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    logisticId: { type: mongoose.Schema.Types.ObjectId, ref: 'logistic', default: null },
    vendorInvoiceCopy: { type: String, default: '' },
    vendorWaybill: { type: String, default: '' },
    purchaseInvoiceNo: { type: String, default: '' },
    purchaseDate: { type: Date, default: null },
    /* totals block, computed on the form and stored so the list and the
       linked GRC can read them back without recomputing */
    taxableValue: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    roundOffDiscount: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    freightBeforeGst: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    netPurchaseAmt: { type: Number, default: 0 },
    totalPayable: { type: Number, default: 0 },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.purchaseInvoice ||
  mongoose.model('purchaseInvoice', PurchaseInvoiceSchema, 'purchaseinvoice');