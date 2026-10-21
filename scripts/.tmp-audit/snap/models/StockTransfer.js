import mongoose from 'mongoose';
import {
  TRANSFER_STATUS as STATUS, RETURN_REASONS as REASONS,
} from '@/components/transferConstants';

/* ==========================================================================
   Stock Transfer - one barcode-driven document covering the whole journey.

   HOW THIS RELATES TO THE EXISTING STOCK TRANSFER SCREENS.

   The project already has a three-document flow: Packet (STP) -> Location
   (STL) -> Received (STR). Those are paperwork - they consolidate and
   despatch, but they never touch stock: nothing in them moves a barcode, and
   STR's own comment records that receiving is all-or-nothing with received
   always equal to sent. There is no way to say "8 of the 10 arrived".

   Rather than bolt partial receipt and barcode ownership onto three
   documents that have to agree with each other, the movement itself lives on
   ONE document here, with the barcodes it carries. The old screens are left
   alone and keep working for documents already raised on them; new transfers
   - including the e-commerce direct transfer - go through this one, so there
   is a single definition of what a transfer does to stock.

   Every quantity below is derived from the lines, never entered: billable
   quantity in particular is sent minus returned, which is the number the
   invoice must use.

   Collection name pinned lowercase, same reasoning as every other model. */

export const LABEL_FIELD = 'transferNo';

/* The document's lifecycle, and the reasons a destination sends stock back.

   Both are defined in components/transferConstants.js and re-exported here.
   The screens need them too and cannot import this file - it pulls in
   mongoose - so the plain-constants module is the shared source and the
   dependency points from the model to it, never the other way.

   A transfer moves forward only; there is no state that can be reached twice,
   which is what makes "already received" a detectable error rather than a
   silent second receipt:

     DRAFT              being built, nothing has moved
     IN_TRANSIT         submitted, stock has left the source
     PARTIALLY_RECEIVED some lines accepted at the destination
     RECEIVED           every line accounted for at the destination
     RETURN_IN_TRANSIT  destination has sent some back
     PARTIALLY_RETURNED some returns taken back in at the source
     COMPLETED          everything settled, and billed
     CANCELLED          withdrawn before despatch                          */
export const TRANSFER_STATUS = STATUS;
export const RETURN_REASONS = REASONS;

/* One physical unit on the transfer. A line IS a barcode - that is what makes
   "which 8 of the 10 arrived" answerable. */
const LineSchema = new mongoose.Schema(
  {
    barcodeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    barcodeNo: { type: String, default: '' },

    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'item', default: null },
    itemCode: { type: String, default: '' },
    itemName: { type: String, default: '' },
    description: { type: String, default: '' },

    uom: { type: String, default: '' },
    uomType: { type: String, default: '' },     // 'PC' | 'MTR'
    batchType: { type: String, default: '' },   // 'batch' | 'unique'
    qty: { type: Number, default: 1 },          // what this barcode represents

    hsn: { type: String, default: '' },
    gst: { type: Number, default: 0 },
    rate: { type: Number, default: 0 },         // cost, for the transfer's value
    rsp: { type: Number, default: 0 },          // retail selling price, printed on the challan
    supplierId: { type: String, default: '' },
    grcNo: { type: String, default: '' },

    /* per-line outcome. A line is received, or returned, or still in transit -
       never more than one, which is what keeps the totals honest. */
    received: { type: Boolean, default: false },
    receivedAt: { type: Date, default: null },
    receivedBy: { type: String, default: '' },

    returned: { type: Boolean, default: false },
    returnedAt: { type: Date, default: null },
    returnedBy: { type: String, default: '' },
    returnReason: { type: String, default: '' },
    returnNotes: { type: String, default: '' },
    /* set when the SOURCE has taken the returned unit back into its stock */
    returnAccepted: { type: Boolean, default: false },
    returnAcceptedAt: { type: Date, default: null },
  },
  { _id: false }
);

const StockTransferSchema = new mongoose.Schema(
  {
    /* scope - the SOURCE side owns the document */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* Unique across the business. The unique index is what actually
       guarantees it - the counter makes a clash almost impossible, the index
       makes it impossible. */
    transferNo: { type: String, default: '', index: true },
    transferDate: { type: Date, default: Date.now, index: true },

    /* from -> to. Addresses are copied at despatch rather than joined on
       read, so editing a location later never rewrites an issued document -
       the same reasoning StockTransferPacket already uses. */
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    fromLocationName: { type: String, default: '' },
    fromGstn: { type: String, default: '' },
    fromAddress: { type: String, default: '' },

    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    toLocationName: { type: String, default: '' },
    toGstn: { type: String, default: '' },
    toAddress: { type: String, default: '' },
    toStockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },

    status: { type: String, default: TRANSFER_STATUS.DRAFT, index: true },

    /* what raised it - a plain transfer, or the e-commerce direct transfer,
       which is the same movement with a different origin */
    source: { type: String, default: 'STOCK_TRANSFER' },   // 'STOCK_TRANSFER' | 'ECOMMERCE'
    ecomReference: { type: String, default: '' },

    lines: { type: [LineSchema], default: [] },

    /* ---- derived totals. Recomputed by recalc() on every write, never
       accepted from the browser. ---- */
    sentQty: { type: Number, default: 0 },
    sentCount: { type: Number, default: 0 },
    receivedQty: { type: Number, default: 0 },
    receivedCount: { type: Number, default: 0 },
    returnedQty: { type: Number, default: 0 },
    returnedCount: { type: Number, default: 0 },
    pendingQty: { type: Number, default: 0 },
    pendingCount: { type: Number, default: 0 },

    /* the number billing must use: sent - returned */
    billableQty: { type: Number, default: 0 },
    billableCount: { type: Number, default: 0 },

    /* PC and MTR split out, for the Delivery Challan summary */
    totalPc: { type: Number, default: 0 },
    totalMtr: { type: Number, default: 0 },

    taxableValue: { type: Number, default: 0 },
    gstValue: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },
    billableValue: { type: Number, default: 0 },

    /* despatch / receipt trail */
    submittedAt: { type: Date, default: null },
    submittedBy: { type: String, default: '' },
    receivedAt: { type: Date, default: null },
    receivedBy: { type: String, default: '' },
    returnReceivedAt: { type: Date, default: null },
    returnReceivedBy: { type: String, default: '' },

    /* set once an invoice has been raised against the accepted quantity */
    billingId: { type: mongoose.Schema.Types.ObjectId, default: null },
    billingNo: { type: String, default: '' },
    billedAt: { type: Date, default: null },

    waybill: { type: String, default: '' },
    remarks: { type: String, default: '' },
  },
  { timestamps: true }
);

/* The document number must be unique per business. Partial so that documents
   without a number yet (a draft mid-save) do not collide on ''. */
StockTransferSchema.index(
  { businessId: 1, transferNo: 1 },
  { unique: true, partialFilterExpression: { transferNo: { $type: 'string', $ne: '' } } }
);
StockTransferSchema.index({ businessId: 1, toLocationId: 1, status: 1 });
StockTransferSchema.index({ businessId: 1, fromLocationId: 1, status: 1 });
StockTransferSchema.index({ businessId: 1, transferDate: -1 });
StockTransferSchema.index({ 'lines.barcodeNo': 1 });

/* --------------------------------------------------------------- totals ---
   Every quantity on the document is a function of its lines. Recomputing
   rather than adjusting means a total can never drift out of step with the
   lines, however many times a transfer is partially received. */
StockTransferSchema.methods.recalc = function recalc() {
  const lines = this.lines || [];

  const sum = (rows, f) => round3(rows.reduce((a, r) => a + (Number(f ? f(r) : r.qty) || 0), 0));

  const received = lines.filter((l) => l.received && !l.returned);
  const returned = lines.filter((l) => l.returned);
  const pending = lines.filter((l) => !l.received && !l.returned);

  this.sentQty = sum(lines);
  this.sentCount = lines.length;
  this.receivedQty = sum(received);
  this.receivedCount = received.length;
  this.returnedQty = sum(returned);
  this.returnedCount = returned.length;
  this.pendingQty = sum(pending);
  this.pendingCount = pending.length;

  /* THE BILLING RULE: billable = sent - returned.
     Stock still in transit is included - it has been despatched and is the
     destination's to account for; only what came back reduces the bill. */
  this.billableQty = round3(this.sentQty - this.returnedQty);
  this.billableCount = this.sentCount - this.returnedCount;

  this.totalPc = sum(lines.filter((l) => l.uomType === 'PC'));
  this.totalMtr = sum(lines.filter((l) => l.uomType === 'MTR'));

  const value = (rows) => round2(rows.reduce((a, l) => a + (Number(l.rate) || 0) * (Number(l.qty) || 0), 0));
  const tax = (rows) => round2(rows.reduce((a, l) => {
    const base = (Number(l.rate) || 0) * (Number(l.qty) || 0);
    return a + base * ((Number(l.gst) || 0) / 100);
  }, 0));

  this.taxableValue = value(lines);
  this.gstValue = tax(lines);
  this.netValue = round2(this.taxableValue + this.gstValue);

  const billableLines = lines.filter((l) => !l.returned);
  this.billableValue = round2(value(billableLines) + tax(billableLines));

  return this;
};

/* Where the document should now be, given its lines. Called after every
   receive and return so the status can never be set by hand to something the
   lines contradict. */
StockTransferSchema.methods.deriveStatus = function deriveStatus() {
  if (this.status === TRANSFER_STATUS.DRAFT || this.status === TRANSFER_STATUS.CANCELLED) return this.status;

  const lines = this.lines || [];
  const settled = lines.filter((l) => l.received || l.returned).length;
  const returnsOutstanding = lines.some((l) => l.returned && !l.returnAccepted);

  if (returnsOutstanding) {
    this.status = settled === lines.length
      ? TRANSFER_STATUS.RETURN_IN_TRANSIT
      : TRANSFER_STATUS.PARTIALLY_RECEIVED;
    return this.status;
  }

  const anyReturned = lines.some((l) => l.returned);

  if (settled === 0) this.status = TRANSFER_STATUS.IN_TRANSIT;
  else if (settled < lines.length) this.status = TRANSFER_STATUS.PARTIALLY_RECEIVED;
  else if (anyReturned) this.status = this.billingId ? TRANSFER_STATUS.COMPLETED : TRANSFER_STATUS.PARTIALLY_RETURNED;
  else this.status = this.billingId ? TRANSFER_STATUS.COMPLETED : TRANSFER_STATUS.RECEIVED;

  return this.status;
};

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const round3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

export default mongoose.models.stockTransfer ||
  mongoose.model('stockTransfer', StockTransferSchema, 'stocktransfer');
