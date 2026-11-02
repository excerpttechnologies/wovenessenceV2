import mongoose from 'mongoose';

/* ==========================================================================
   JOURNAL ENTRIES - the posting engine's only output.

   Before this collection existed, /admin/ledger-transaction DERIVED its
   Dr / Cr list at read time from the documents themselves (see the note at
   the top of app/admin/ledger-transaction/fields.js). Derived entries have no
   audit trail and no opening balances, and they change when the source
   document is edited.

   A stored journal is the alternative: once a posting is written it is the
   record, it does not move when the document behind it is edited, and a
   correction is another journal (see kind: 'reversal') rather than an edit.

   Every journal is balanced (total debit = total credit) and validated
   before it is written - lib/accounting/journal.js is the only writer.

   MONEY IS ALWAYS TWO DECIMALS. Debit / credit are rounded to the paisa on
   the way in, and every comparison is done in integer paise, so 10000.10 vs
   10000.1 is one number and total debit = total credit cannot fail on
   floating-point drift.
   ========================================================================== */

export const JOURNAL_SOURCES = ['manual', 'purchase', 'sales', 'stocktransfer'];
/* A normal posting, or the reversal of one. A reversal is itself a posted
   journal with debit and credit swapped, so it nets the original to zero
   without anything historical being deleted or edited. */
export const JOURNAL_KINDS = ['entry', 'reversal'];
export const JOURNAL_STATUSES = ['posted', 'reversed'];

const JournalLineSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'accountsMaster', required: true },
    /* the account's name at the time of posting - a snapshot, so a renamed
       account does not rewrite history */
    accountName: { type: String, default: '' },
    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
    /* free text a screen may attach to a line (an item, a party, a note) */
    narration: { type: String, default: '' },
  },
  { _id: true }
);

const JournalEntrySchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '' },

    journalDate: { type: Date, required: true },
    referenceNo: { type: String, default: '' },
    narration: { type: String, default: '' },

    source: { type: String, enum: JOURNAL_SOURCES, default: 'manual' },
    /* the document behind an automatic posting (a GRC's _id, later a sales
       invoice's). Null for a manual journal. */
    sourceRefId: { type: mongoose.Schema.Types.ObjectId, default: null },
    /* what the source document was numbered, copied so the journal still
       names its document if the source is later removed from view */
    sourceRefNo: { type: String, default: '' },

    /* 'entry' | 'reversal'; postingSeq orders the postings of one source, so
       a re-post after a document changed is a new seq rather than an edit */
    kind: { type: String, enum: JOURNAL_KINDS, default: 'entry' },
    postingSeq: { type: Number, default: 1 },
    reversalOf: { type: mongoose.Schema.Types.ObjectId, ref: 'journalEntry', default: null },
    reversedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'journalEntry', default: null },

    lines: { type: [JournalLineSchema], default: [] },

    /* computed server-side from `lines`, never read from a request */
    totalDebit: { type: Number, default: 0 },
    totalCredit: { type: Number, default: 0 },

    status: { type: String, enum: JOURNAL_STATUSES, default: 'posted' },

    createdBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdByName: { type: String, default: '' },
  },
  { timestamps: true }
);

/* ---- the list, the ledger and every report ---------------------------- */
/* A journal is only ever read inside its scope and date window. */
JournalEntrySchema.index({ businessId: 1, locationId: 1, finYear: 1, journalDate: -1 });
/* one account's ledger: match the lines' account and walk the dates */
JournalEntrySchema.index({ 'lines.accountId': 1, journalDate: 1 });
/* document lookups from a list screen */
JournalEntrySchema.index({ businessId: 1, referenceNo: 1 });
/* idempotency: one posting per (source, document, sequence, kind).

   The partial filter keeps manual journals (no sourceRefId) out of it - a
   manual journal is never deduplicated, since two identical manual entries
   can legitimately exist. This is what makes "confirmation pressed twice"
   produce one journal rather than two. */
JournalEntrySchema.index(
  { businessId: 1, source: 1, sourceRefId: 1, kind: 1, postingSeq: 1 },
  {
    unique: true,
    name: 'journal_source_idempotency',
    partialFilterExpression: { sourceRefId: { $type: 'objectId' } },
  }
);

export default mongoose.models.journalEntry ||
  mongoose.model('journalEntry', JournalEntrySchema, 'journalentry');
