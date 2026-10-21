import mongoose from 'mongoose';

/* ==========================================================================
   barcodeLabel - ONE ROW IS ONE UNIT OF STOCK.

   This collection was already the only thing that put stock into the system
   (Barcode Generation writes it, every stock report reads it back). What it
   did not carry was any notion of WHERE a unit currently is or WHAT HAS
   HAPPENED to it, so nothing downstream could tell available stock from sold
   stock, and a barcode could be billed twice.

   The lifecycle block below closes that. It is added to the existing schema
   rather than to a second collection on purpose: a parallel inventory model
   would leave two answers to "what is in stock".

   Current state lives here; how it got here lives in models/StockMovement.js.
   The two are always written together, inside one transaction, by
   lib/inventory.js. Nothing else may write the lifecycle fields.

   The original commercial fields are unchanged and still typed as String -
   they are written straight from form inputs and are read with Number()
   everywhere. qtyNum below is the parsed companion used for arithmetic.
   ========================================================================== */

/* A unit's lifecycle. Every transition is enumerated in lib/inventory.js. */
export const BARCODE_STATUS = {
  IN_STOCK: 'IN_STOCK',                     // available at currentLocationId
  IN_TRANSIT: 'IN_TRANSIT',                 // despatched on a transfer, not yet received
  SOLD: 'SOLD',                             // billed at the till
  RETURN_IN_TRANSIT: 'RETURN_IN_TRANSIT',   // destination sent it back, source has not taken it in
  VOID: 'VOID',                             // returned to vendor (GRT) or its GRC was deleted
};

const barcodeLabelSchema = new mongoose.Schema(
  {
    grcId: { type: String, default: '', index: true },
    supplierId: { type: String, default: '' },
    groupId: { type: String, default: '' },
    oldBarcode: { type: String, default: '' },
    itemCode: { type: String, default: '', index: true },
    batchUnique: { type: String, default: '' },
    billSlNo: { type: String, default: '' },
    seq: { type: String, default: '' },
    dummy: { type: String, default: '' },
    supplierDescription: { type: String, default: '' },
    qty: { type: String, default: '' },
    /* How many cuts the received metreage was split into, as the Barcode
       Generation grid shows it. No stock arithmetic reads it - it is kept so
       an edited No. of Cut survives a reload instead of reverting to blank. */
    noOfCuts: { type: String, default: '' },
    /* The screen's own id for the row this unit was created from (Add Item,
       the ITEMS sheet, an import). A Submit repeated before the screen has
       re-read the GRC sends that id again, and the save matches it instead of
       inserting the row twice (lib/barcodeRowSync.js). Identity only - never
       shown and never edited. */
    clientRowId: { type: String, default: '' },
    uom: { type: String, default: '' },
    hsn: { type: String, default: '' },
    purRate: { type: String, default: '' },
    /* The purchase rate written through the Purchase Rate Code Master's
       digit -> letter table (Masters -> Purchase Rate Code Master). Stored
       ALONGSIDE purRate, never instead of it: purRate stays the real number
       every report and valuation reads, and this is only what gets printed.
       Empty when no mapping is configured - nothing is ever encoded with a
       built-in default alphabet. */
    encodedPurRate: { type: String, default: '' },
    disc: { type: String, default: '' },
    finalNet: { type: String, default: '' },
    gst: { type: String, default: '' },
    printDescription: { type: String, default: '' },
    retailPrice: { type: String, default: '' },
    disc2: { type: String, default: '' },
    offerPrice: { type: String, default: '' },
    wspPrice: { type: String, default: '' },
    dpPrice: { type: String, default: '' },
    goodsType: { type: String, default: '' },
   sm: { type: String, default: '' },
   p_m_f: { type: String, default: '' },
    fma: { type: String, default: '' },
    silkMark: { type: String, default: '' },
    barcodeGenerated: { type: String, default: '', index: true },
    customFields: { type: mongoose.Schema.Types.Mixed, default: {} },

    /* Staff-uploaded product photo. The mobile app used to write these to a
       separate productImage collection; it now writes them straight onto the
       barcode row, which is why they are declared here. Declared rather than
       left implicit so they survive a non-lean read or a .select(). */
    imageUrl: { type: String, default: '' },
    filePath: { type: String, default: '' },
    mimeType: { type: String, default: '' },
    originalName: { type: String, default: '' },

    businessId: { type: String, default: '', index: true },
    locationId: { type: String, default: '' },
    finYear: { type: String, default: '' },

    /* ==================================================== lifecycle ===== */

    /* The canonical barcode number. barcodeGenerated is kept in step with it
       so existing screens and reports that read that field keep working;
       everything written from here on reads barcodeNo. */
    barcodeNo: { type: String, default: '', index: true },

    /* What this unit is, resolved at generation time rather than re-matched
       on itemCode text at read time. itemCode above stays as the display /
       legacy key. */
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'item', default: null, index: true },
    itemName: { type: String, default: '' },

    /* 'PC' or 'MTR' - which of the two quantity rules applies. */
    uomType: { type: String, default: 'PC' },
    uomId: { type: mongoose.Schema.Types.ObjectId, ref: 'uom', default: null },

    /* 'batch'  - this one barcode stands for the whole quantity
       'unique' - this barcode stands for exactly one unit */
    batchType: { type: String, default: 'unique', index: true },

    /* The quantity this single barcode represents, as a number.
         PC  + unique -> 1
         PC  + batch  -> the whole received quantity
         MTR + unique -> the metres on this one cut
         MTR + batch  -> the whole received metreage */
    qtyNum: { type: Number, default: 1 },

    /* Set on a batch row so the label can print "5 MTR" and a report can tell
       a 5-metre batch barcode from five 1-metre unique ones. */
    batchNo: { type: String, default: '' },
    serialNo: { type: String, default: '' },

    /* ------------------------------------------------ current state ---- */
    status: { type: String, default: BARCODE_STATUS.IN_STOCK, index: true },

    /* Where the unit physically is now. Starts as the GRC's location and is
       moved by the transfer / receive / return engine. locationId above is
       left as the ORIGINATING location so the source of a unit stays known. */
    currentLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    currentBusinessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    currentStockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },

    /* ------------------------------------------- document references --- */
    grcNo: { type: String, default: '' },
    transferId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    transferNo: { type: String, default: '' },
    receivedId: { type: mongoose.Schema.Types.ObjectId, default: null },
    returnId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    returnReason: { type: String, default: '' },
    billingId: { type: mongoose.Schema.Types.ObjectId, default: null },
    billingNo: { type: String, default: '' },
    soldAt: { type: Date, default: null },
  },
  { timestamps: true }
);

/* --------------------------------------------------------------- indexes --
   Scanning must be instant at the till and on the transfer screen, and both
   look a barcode up by number within a business. The rest support the
   location-wise and status-wise stock queries the reports run. */
barcodeLabelSchema.index({ barcodeNo: 1, businessId: 1 });
barcodeLabelSchema.index({ businessId: 1, status: 1, currentLocationId: 1 });
barcodeLabelSchema.index({ businessId: 1, itemCode: 1, status: 1 });
barcodeLabelSchema.index({ transferId: 1, status: 1 });
barcodeLabelSchema.index({ billingId: 1 });
barcodeLabelSchema.index({ createdAt: -1 });

/* Keep the legacy field and the canonical one in step on every write, so a
   screen still reading barcodeGenerated never sees a blank. */
barcodeLabelSchema.pre('save', function keepBarcodeFieldsInStep(next) {
  if (this.barcodeNo && !this.barcodeGenerated) this.barcodeGenerated = this.barcodeNo;
  if (this.barcodeGenerated && !this.barcodeNo) this.barcodeNo = this.barcodeGenerated;
  next();
});

// collection pinned lowercase, same reasoning as the models/ directory
export const BarcodeLabel =
  mongoose.models.barcodeLabel ||
  mongoose.model('barcodeLabel', barcodeLabelSchema, 'barcodeLabel');

export default BarcodeLabel;
