import mongoose from 'mongoose';

/* Inter Store Sell - Received Debit Note.

   A financial adjustment the BUYING store receives against a Sales Invoice:
   short supply, rate difference, damage agreed as a price reduction.

   IMPORTANT: creating one does NOT move stock. It is a value/GST adjustment
   only (Phase 4.3 of the brief). Physical goods going back are a Sales
   Return, which has its own stock movement. Keeping the two apart is what
   stops a store crediting stock it never physically received.

   Each note references the invoice it adjusts, and the invoice lines carry
   `debitQty` so the API can refuse a note larger than what is still
   adjustable. Own collection + `module`, as with the other Inter Store docs. */

export const LABEL_FIELD = 'debitNoteNo';
export const MODULE = 'interStoreSell';

const StoreDebitNoteSchema = new mongoose.Schema(
  {
    module: { type: String, default: MODULE, index: true },

    /* scope = the store that received the goods and is raising the note */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* the store that issued the invoice */
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },

    debitNoteNo: { type: String, default: '', index: true },
    debitNoteDate: { type: Date, default: null },

    salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'storeSalesInvoice', default: null, index: true },
    salesInvoiceNo: { type: String, default: '' },

    reason: { type: String, default: '' },
    gstMode: { type: String, enum: ['cgst_sgst', 'igst'], default: 'cgst_sgst' },

    taxableValue: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    status: { type: String, default: 'confirmed', index: true },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },

    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

StoreDebitNoteSchema.index({ businessId: 1, debitNoteDate: 1 });

export default mongoose.models.storeDebitNote ||
  mongoose.model('storeDebitNote', StoreDebitNoteSchema, 'storedebitnote');
