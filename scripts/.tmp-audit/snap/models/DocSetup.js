import mongoose from 'mongoose';

/* Doc Setups
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'documentName';

const DocSetupSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    /* finYear was declared TWICE in this schema. The second declaration -
       without the index - is the one Mongoose kept, so the field silently
       lost its index and every Doc Setup lookup scanned the collection.
       Declared once now. */
    finYear: { type: String, default: '', index: true },

    documentName: { type: String, default: '' },
    documentType: { type: String, default: '' },
    description: { type: String, default: '' },
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    autoNumberLength: { type: Number, default: null },
    startFrom: { type: Number, default: null },

    /* Computed on save from prefix + zero-padded startFrom + suffix, never
       typed. It was a required free-text field, which is how a setup with
       prefix "htfdvbg" ended up showing a sample of "grcccr" - a preview
       that bears no relation to the number the system will actually issue. */
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

/* One configuration per business + document type + financial year.

   Without this, two setups for the same type made the numbering service's
   findOne() pick whichever the database returned first - so the prefix a
   document got depended on collection order. */
DocSetupSchema.index(
  { businessId: 1, documentType: 1, finYear: 1 },
  /* $gt: '' rather than $ne: '' - a partial index only supports $exists,
     $type, $eq and the range operators, so $ne is rejected outright. $gt: ''
     excludes both a missing type and an empty one, which is what is meant. */
  { unique: true, partialFilterExpression: { documentType: { $gt: '' } } }
);

export default mongoose.models.docSetup ||
  mongoose.model('docSetup', DocSetupSchema, 'docsetup');
