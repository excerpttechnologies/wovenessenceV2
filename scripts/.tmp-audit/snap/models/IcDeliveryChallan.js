import mongoose from 'mongoose';

/* Inter Company Delivery Challan.

   Goods moving from ONE of your businesses to ANOTHER. The tenant scope
   (businessId / locationId / finYear) is the SOURCE - the branch raising the
   challan. toBusinessId / toLocationId are the DESTINATION, which is what the
   add form's "Business" and "Location Name" selectors choose, and what the
   Sales Invoice list shows as "To Business" / "To Location".

   customerGstn and customerAddress are copied off the destination business at
   save time rather than joined on read, so a later edit to that business does
   not silently rewrite an issued challan.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'dcNo';

const IcDeliveryChallanSchema = new mongoose.Schema(
  {
    /* source scope */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* destination */
    toBusinessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null },
    customerGstn: { type: String, default: '' },
    customerAddress: { type: String, default: '' },

    dcNo: { type: String, default: '', index: true },
    dcDate: { type: Date, default: null },

    stockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    salesPersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    salesTerm: { type: String, default: '' },
    logisticId: { type: mongoose.Schema.Types.ObjectId, ref: 'logistic', default: null },
    customerWaybill: { type: String, default: '' },

    /* totals block - computed on the form, stored so the list and the linked
       invoice read them back without recomputing */
    taxableValue: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    roundOffDiscountAmt: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    /* set when converted downstream; null = still available to invoice.
       Same pattern as GRC -> Purchase Invoice elsewhere in the app, so the
       "unconverted" filter reads the same way. */
    icSalesInvoiceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.icDeliveryChallan ||
  mongoose.model('icDeliveryChallan', IcDeliveryChallanSchema, 'icdeliverychallan');
