import mongoose from 'mongoose';

/* Inter Store Sell - Delivery Challan.

   Goods moving between TWO STORES (company locations) of the SAME business.
   That is the whole difference from IcDeliveryChallan: nothing changes owner,
   so the sender and the receiver are businessId + two location ids rather
   than two businesses.

   Own collection on purpose. The Inter Company challans and these must never
   be able to appear in each other's lists, and the Inter Company screens do
   not filter by module - so sharing a collection would leak records onto the
   other screen. `module` is still stamped as a second, explicit discriminator
   (`interStoreSell`) for reports and for anything that reads this collection
   without the model.

   GST IS APPLICABLE here, unlike Inter Company Sell. Rates are resolved from
   the HSN > Tax master on the server (lib/storeGst.js) and every money figure
   is recomputed by the API from the line quantities - never trusted from the
   browser.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'dcNo';
export const MODULE = 'interStoreSell';

/* draft       saved, stock still in the source store
   dispatched  stock has left the source store, waiting at the destination
   received    the destination store has accepted the goods
   invoiced    (or partly) billed on an Inter Store Sales Invoice
   cancelled   withdrawn before dispatch; stock never moved */
export const DC_STATUS = {
  DISPATCHED: 'dispatched',
  RECEIVED: 'received',
  INVOICED: 'invoiced',
  CANCELLED: 'cancelled',
};

const StoreDeliveryChallanSchema = new mongoose.Schema(
  {
    module: { type: String, default: MODULE, index: true },

    /* scope = the SOURCE store raising the challan */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* destination store, always inside the same business */
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    /* copied at save time, so a later rename of the store does not rewrite
       a document that has already been issued */
    toLocationName: { type: String, default: '' },
    customerGstn: { type: String, default: '' },
    customerAddress: { type: String, default: '' },

    dcNo: { type: String, default: '', index: true },
    dcDate: { type: Date, default: null },

    stockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },
    remarks: { type: String, default: '' },

    /* GST split used for the whole document: 'cgst_sgst' (intra-state) or
       'igst' (inter-state). Lines carry their own rate. */
    gstMode: { type: String, enum: ['cgst_sgst', 'igst'], default: 'cgst_sgst' },

    taxableValue: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    roundOffDiscountAmt: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    status: { type: String, default: DC_STATUS.DISPATCHED, index: true },
    dispatchedAt: { type: Date, default: null },
    receivedAt: { type: Date, default: null, index: true },
    receivedBy: { type: String, default: '' },

    /* set once the challan is (fully or partly) billed. A challan is not
       invoiced merely because it exists - the user raises the invoice. */
    salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'storeSalesInvoice', default: null, index: true },

    /* lines are Mixed because a line carries both the trading fields and the
       stock allocation written by lib/storeStock.js (`stockMoves`). The shape
       is enforced by lib/storeSell.js + the API, not by Mongoose. */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },

    createdBy: { type: String, default: '' },
    updatedBy: { type: String, default: '' },
  },
  { timestamps: true }
);

StoreDeliveryChallanSchema.index({ businessId: 1, locationId: 1, dcDate: 1 });

export default mongoose.models.storeDeliveryChallan ||
  mongoose.model('storeDeliveryChallan', StoreDeliveryChallanSchema, 'storedeliverychallan');
