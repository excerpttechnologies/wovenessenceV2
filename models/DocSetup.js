import mongoose from 'mongoose';

/* Doc Setups
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'documentName';

const DocSetupSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    documentName: { type: String, default: '' },
    documentType: { type: String, default: '' },
    description: { type: String, default: '' },
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    autoNumberLength: { type: Number, default: null },
    startFrom: { type: Number, default: null },

    /* Computed on save from prefix + zero-padded startFrom + suffix, never
       typed. */
    sample: { type: String, default: '' },

    /* Never | Daily | Monthly | Yearly - how often the running number
       restarts at startFrom. Read by lib/docnumber.js when it builds the
       counter key. */
    validity: { type: String, default: 'Never' },

    /* An inactive setup is ignored by the numbering service, so a series can
       be retired without deleting it and losing its history. */
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

/* One configuration per business + location + document type + financial year.
   Maintains independent document setup series across locations of a company. */
DocSetupSchema.index(
  { businessId: 1, locationId: 1, documentType: 1, finYear: 1 },
  { unique: true, partialFilterExpression: { documentType: { $gt: '' } } }
);

export default mongoose.models.docSetup ||
  mongoose.model('docSetup', DocSetupSchema, 'docsetup');
