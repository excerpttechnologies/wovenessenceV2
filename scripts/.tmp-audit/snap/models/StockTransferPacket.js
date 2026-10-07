import mongoose from 'mongoose';

/* Stock Transfer Packet (STP).

   Stage 1 of the Stock Transfers flow. Goods are packed at a SOURCE location
   and addressed to a DESTINATION location + stock point, both inside the same
   business. Unlike Inter Company Sell, nothing here crosses a business
   boundary - that is what makes this a stock movement rather than a sale.

   The From/To addresses and GSTINs are copied off the two locations at save
   time rather than joined on read, so later edits to a location never rewrite
   an issued packet - same reasoning as IcDeliveryChallan.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'packetNo';

const StockTransferPacketSchema = new mongoose.Schema(
  {
    /* scope */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    packetNo: { type: String, default: '', index: true },
    stpDate: { type: Date, default: null },

    /* transfer from */
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    fromGstn: { type: String, default: '' },
    fromAddress: { type: String, default: '' },
    fromState: { type: String, default: '' },

    /* transfer to */
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    toGstn: { type: String, default: '' },
    toAddress: { type: String, default: '' },
    toState: { type: String, default: '' },
    toStockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },

    /* totals - recomputed server-side from items, never trusted from the form */
    totalQty: { type: Number, default: 0 },
    taxableValue: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    /* Set when this packet is pulled into a Stock Transfer Location; null
       means it is still available to consolidate. This is what the View
       dialog prints as "Is Location Created: Yes / No", and what the Add
       Location screen filters on. Same claim/release pattern as
       IcDeliveryChallan.icSalesInvoiceId. */
    stockTransferLocationId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.stockTransferPacket ||
  mongoose.model('stockTransferPacket', StockTransferPacketSchema, 'stocktransferpacket');
