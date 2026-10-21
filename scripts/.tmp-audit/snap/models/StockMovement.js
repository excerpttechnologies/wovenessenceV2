import mongoose from 'mongoose';

/* Stock Movement - the inventory audit ledger.

   Until now this project had no record of stock MOVING. Quantities were
   re-derived on every report by counting barcode rows and subtracting sales
   (see the note at the top of app/api/reports/item-stock/route.js), which
   cannot answer "where did this piece go", cannot survive a deletion, and
   cannot distinguish a transfer from a sale.

   One row per barcode per event. Nothing here is ever updated or removed -
   it is append-only, which is what makes the trail auditable. Current state
   lives on the barcode row (status / currentLocationId); this collection is
   how that state was arrived at.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'type';

/* Every event that can change where a unit of stock is, or whose it is. */
export const MOVEMENT_TYPES = {
  GRC_IN: 'GRC_IN',                     // received from a supplier, stock created
  GRC_VOID: 'GRC_VOID',                 // GRC deleted / vendor return (GRT)
  TRANSFER_OUT: 'TRANSFER_OUT',         // despatched from source on a stock transfer
  TRANSFER_IN: 'TRANSFER_IN',           // accepted at destination
  TRANSFER_RETURN_OUT: 'TRANSFER_RETURN_OUT',   // destination sends back (damaged/wrong/excess)
  TRANSFER_RETURN_IN: 'TRANSFER_RETURN_IN',     // source takes the return back into stock
  POS_OUT: 'POS_OUT',                   // sold at the till
  POS_RETURN_IN: 'POS_RETURN_IN',       // customer return, back into stock
  ADJUST_IN: 'ADJUST_IN',               // stock adjustment, positive
  ADJUST_OUT: 'ADJUST_OUT',             // stock adjustment, negative
  ECOM_OUT: 'ECOM_OUT',                 // e-commerce direct transfer, despatched
};

const StockMovementSchema = new mongoose.Schema(
  {
    /* scope of the business the movement belongs to */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    type: { type: String, required: true, index: true },

    /* what moved. barcodeId is the barcodeLabel _id; barcodeNo is denormalised
       so a movement stays readable even if the barcode row is later purged. */
    barcodeId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    barcodeNo: { type: String, default: '', index: true },
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'item', default: null },
    itemCode: { type: String, default: '', index: true },
    itemName: { type: String, default: '' },
    uom: { type: String, default: '' },
    batchType: { type: String, default: '' },      // 'batch' | 'unique'

    /* signed quantity: positive puts stock into toLocationId, negative takes
       it out of fromLocationId. A transfer writes one of each. */
    qty: { type: Number, default: 0 },

    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },

    /* status either side of the event, so the trail replays without needing
       to re-derive it */
    statusBefore: { type: String, default: '' },
    statusAfter: { type: String, default: '' },

    /* the document that caused it */
    refModel: { type: String, default: '' },        // 'grc' | 'stockTransfer' | 'posInvoice' | ...
    refId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    refNo: { type: String, default: '', index: true },

    /* why, where it applies */
    reason: { type: String, default: '' },
    notes: { type: String, default: '' },

    /* who */
    userId: { type: mongoose.Schema.Types.ObjectId, default: null },
    userName: { type: String, default: '' },
    userEmail: { type: String, default: '' },

    /* the event clock. Separate from createdAt so a back-dated document can
       report against its own date while the audit row keeps its real time. */
    at: { type: Date, default: Date.now, index: true },

    /* TRUE when this row was RECONSTRUCTED from an existing document rather
       than written as the event happened.

       The ledger only begins when it is installed, but the documents that
       came before it are real and dated - GRCs, POS invoices, vendor returns.
       scripts/backfillMovementHistory.mjs derives movements from those so
       historical reporting works, and marks them here so a derived row is
       never mistaken for a captured one. `derivedFrom` names the document
       type it was read out of.

       Nothing is invented: a derived row exists only where a real dated
       document says that movement happened. */
    derived: { type: Boolean, default: false, index: true },
    derivedFrom: { type: String, default: '' },
  },
  { timestamps: true }
);

/* Reports slice this by business + date, and the barcode history screen by
   barcode. Both get a compound index rather than relying on the single-field
   ones above. */
StockMovementSchema.index({ businessId: 1, at: -1 });
StockMovementSchema.index({ barcodeNo: 1, at: 1 });
StockMovementSchema.index({ businessId: 1, type: 1, at: -1 });
StockMovementSchema.index({ refModel: 1, refId: 1 });

export default mongoose.models.stockMovement ||
  mongoose.model('stockMovement', StockMovementSchema, 'stockmovement');
