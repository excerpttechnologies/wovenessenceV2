import mongoose from 'mongoose';

/* Stock Transfer Location (STL).

   Stage 2. Consolidates one or more unconverted Stock Transfer Packets that
   share the same From -> To location pair into a single despatch document,
   and carries the waybill.

   Claiming a packet stamps its stockTransferLocationId, which removes it from
   the next STL's picker. The claim is re-checked at write time and rolled back
   on a clash - the same guard IcSalesInvoice puts around delivery challans,
   for the same reason: the list the browser fetched may be seconds stale.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'packetNo';

const StockTransferLocationSchema = new mongoose.Schema(
  {
    /* scope */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* the deployed screen calls this "Packet No" on both the list and the add
       form, even though it is the STL's own number, not a packet's */
    packetNo: { type: String, default: '', index: true },
    stlDate: { type: Date, default: null },
    stockTransferWaybill: { type: String, default: '' },

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

    /* the packets this document consumed */
    packetIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'stockTransferPacket', default: [] },

    totalQty: { type: Number, default: 0 },
    taxableValue: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    /* set when the destination location receives it; null = still pending on
       their side, which is what the Pending Transfer Stock card lists */
    receivedId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.stockTransferLocation ||
  mongoose.model('stockTransferLocation', StockTransferLocationSchema, 'stocktransferlocation');
