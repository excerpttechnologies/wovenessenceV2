import mongoose from 'mongoose';

/* ==========================================================================
   CHART OF ACCOUNTS.

   This is the accounting account master - not to be confused with models/
   Ledger.js, which is the PARTY ledger master (supplier / customer / bank
   contact records with a name, address, GSTIN and an opening balance). The
   two live side by side on purpose:

     Ledger        - "who" (a party you deal with)
     AccountsMaster- "what" (a line in the books that money is posted to)

   The pre-existing position is unchanged: no party record is touched, and
   nothing here is derived from it or writes to it. A future migration that
   maps Ledger rows onto accounts can copy ids into AccountsMaster; until
   then this collection stands on its own.

   Collection name is pinned lowercase - Mongoose would pluralise it and
   MongoDB collection names are case-sensitive.
   ========================================================================== */

export const ACCOUNT_TYPES = ['Asset', 'Liability', 'Equity', 'Income', 'Expense'];

/* The two sides an account may sit on. Kept here so a controller, an import
   and a screen all read the same pair rather than repeating the strings. */
export const BALANCE_TYPES = ['Dr', 'Cr'];

const AccountsMasterSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    /* The financial year this account (and its opening balance) was opened
       in, e.g. 2026-2027. The chart itself is continuous: a later year still
       sees the same accounts, with the balance carried forward from the
       postings of the years before it - see lib/accounting/reports.js. */
    finYear: { type: String, default: '' },

    accountCode: { type: String, default: '' },
    accountName: { type: String, default: '' },
    accountType: { type: String, enum: ACCOUNT_TYPES, default: 'Asset' },

    /* a child account rolls up into its parent in the chart list */
    parentAccountId: {
      type: mongoose.Schema.Types.ObjectId, ref: 'accountsMaster', default: null, index: true,
    },

    /* SIGNED, and the sign is the side: positive = Dr, negative = Cr, 0 = Nil.
       Stored exactly as entered and never normalised on read - every report
       works from this one convention (see lib/accounting/calc.js). */
    openingBalance: { type: Number, default: 0 },

    isActive: { type: Boolean, default: true },

    /* free-text note an operator may keep against the account */
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

/* One code per account, per company and location. The chart is continuous
   across financial years, so finYear is deliberately NOT part of the key -
   the same code may not be opened twice for two years of one branch. */
AccountsMasterSchema.index(
  { businessId: 1, locationId: 1, accountCode: 1 },
  { unique: true, name: 'account_code_per_scope' }
);

/* the chart list, filtered by type and searched by name */
AccountsMasterSchema.index({ businessId: 1, locationId: 1, accountType: 1, accountName: 1 });
AccountsMasterSchema.index({ businessId: 1, locationId: 1, isActive: 1 });

export default mongoose.models.accountsMaster ||
  mongoose.model('accountsMaster', AccountsMasterSchema, 'accountsmaster');
