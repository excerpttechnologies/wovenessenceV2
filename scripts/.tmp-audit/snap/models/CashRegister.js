import mongoose from 'mongoose';

/* Cash Register session.

   One document per open-to-close cycle at a location. The register is opened
   with a counted float, sits Open while trading happens, and is closed with a
   second count - at which point the three balances are frozen onto the record:

     openingBalance     what was counted in at open
     expectedBalance    opening + cash taken through POS during the window
     closingBalance     what was actually counted at close
     differenceBalance  closing - expected, i.e. over or short

   The figures are STORED at close rather than derived on read. A register is
   a statement about a moment: recomputing it later, after a POS invoice is
   edited or deleted, would silently rewrite a count somebody signed off.
   That is the opposite of how Ledger Transaction works, and deliberately so.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'status';

export const OPEN = 'Open';
export const CLOSED = 'Closed';

const CashRegisterSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* the counter this register belongs to, where the tenant uses them */
    posCounterId: { type: mongoose.Schema.Types.ObjectId, ref: 'posCounter', default: null },

    status: { type: String, enum: [OPEN, CLOSED], default: OPEN, index: true },

    openedAt: { type: Date, default: Date.now },
    closedAt: { type: Date, default: null },

    openingBalance: { type: Number, default: 0 },
    closingBalance: { type: Number, default: 0 },
    expectedBalance: { type: Number, default: 0 },
    differenceBalance: { type: Number, default: 0 },

    /* what made up the expected figure, kept so the close can be explained
       later without re-querying POS over a window that may have moved */
    cashSales: { type: Number, default: 0 },
    cashReturns: { type: Number, default: 0 },

    openedBy: { type: String, default: '' },
    closedBy: { type: String, default: '' },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

/* the "is anything open here" lookup, which runs on every list load */
CashRegisterSchema.index({ businessId: 1, locationId: 1, status: 1 });

export default mongoose.models.cashRegister ||
  mongoose.model('cashRegister', CashRegisterSchema, 'cashregister');
