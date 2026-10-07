import mongoose from 'mongoose';

/* Held POS bills - the "Hold" button on the till.

   A cashier part-way through a bill can park it, serve the customer who is in
   a hurry, and pick the parked one up again. Stored server-side rather than in
   localStorage on purpose: a hold must survive a refresh, a crashed browser,
   and being resumed at a different till on the same counter.

   NOT a PosInvoice. A hold is not a sale - it has no invoice number, it never
   reaches the ledger, and it must not appear in any sales report. Giving it
   its own collection keeps it out of all of that by construction rather than
   by everyone remembering to filter on a status field.

   NOTHING HERE MOVES STOCK. The scanned units stay IN_STOCK while parked, so a
   hold does not reserve them - two tills can still scan the same barcode, and
   whoever bills first wins. That check already happens at sale time inside the
   transaction in app/api/sell-pos/route.js, which is the only safe place for
   it. A hold that is resumed after its stock has gone will be refused there.

   Collection name pinned lowercase, same reasoning as every other model. */

export const LABEL_FIELD = 'holdNo';

const PosHoldSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* A short label the cashier can recognise in the list. */
    holdNo: { type: String, default: '' },
    date: { type: Date, default: Date.now },

    /* the whole till header, so resuming restores the screen and not just the cart */
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    customerName: { type: String, default: '' },
    customerContact: { type: String, default: '' },
    customerSnapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    counterId: { type: mongoose.Schema.Types.ObjectId, ref: 'posCounter', default: null },
    billingType: { type: String, default: '' },
    exempted: { type: String, default: 'NO' },
    salesPerson: { type: String, default: '' },

    /* line items exactly as the till held them */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },

    shipping: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    totalQty: { type: Number, default: 0 },

    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

/* the till lists holds for the counter it is standing at, newest first */
PosHoldSchema.index({ businessId: 1, locationId: 1, finYear: 1, createdAt: -1 });

export default mongoose.models.posHold ||
  mongoose.model('posHold', PosHoldSchema, 'poshold');
