import mongoose from 'mongoose';

/* Stock Transfer Received (STR).

   Stage 3. The receiving half of a Stock Transfer Location. The destination
   location sees the other side's despatch as a row on "Pending Transfer
   Stock"; accepting it writes one of these, which is what the "Recieved
   Transfers" list shows. (That spelling is the deployed screen's, kept so the
   two apps read the same.)

   Receiving is all-or-nothing: sentQty and receivedQty are always equal and
   pendingQty is always zero on an accepted transfer. The three fields are
   stored rather than derived so that partial receipt can be switched on later
   without reshaping what is already on disk.

   Scope is the RECEIVING location. fromLocationId is where the goods came
   from.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'strCode';

const StockTransferReceivedSchema = new mongoose.Schema(
  {
    /* receiver scope */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    strCode: { type: String, default: '', index: true },
    strDate: { type: Date, default: null },

    /* what was accepted */
    stockTransferLocationId: {
      type: mongoose.Schema.Types.ObjectId, ref: 'stockTransferLocation', default: null, index: true,
    },
    packetNo: { type: String, default: '' },

    /* sender */
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    fromGstn: { type: String, default: '' },

    /* destination - the location doing the receiving */
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null },
    toGstn: { type: String, default: '' },
    toStockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },

    /* all-or-nothing today: received == sent, pending == 0 */
    sentQty: { type: Number, default: 0 },
    receivedQty: { type: Number, default: 0 },
    pendingQty: { type: Number, default: 0 },

    netValue: { type: Number, default: 0 },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.stockTransferReceived ||
  mongoose.model('stockTransferReceived', StockTransferReceivedSchema, 'stocktransferreceived');
