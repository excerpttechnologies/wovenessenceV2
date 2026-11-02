import mongoose from 'mongoose';

/* ==========================================================================
   ACCOUNTING SETTINGS - which account each automatic posting uses.

   A posting rule must never carry an account id of its own. A GRC debits
   "Inventory" - WHICH inventory account is a decision each business makes
   per branch, so it lives here as a real reference to AccountsMaster, and
   the posting code fails loudly when a mapping is missing rather than
   guessing or hardcoding an id.

   Every mapping is validated against the same business and location as the
   document being posted (lib/accounting/settings.js), so a mapping can never
   point one branch's document at another branch's account.

   One row per business + location. The account ids are ObjectIds, not a
   Mixed blob, so a deleted account is a visible dangling reference rather
   than a silently ignored string.
   ========================================================================== */

export const MAPPING_KEYS = [
  'inventory',          // stock on hand - debited by a Purchase GRN
  'purchase',           // purchases / cost of goods bought
  'accountsPayable',    // supplier control - credited by a Purchase GRN
  'accountsReceivable', // customer control - future Sales posting
  'sales',              // sales revenue - future Sales posting
  'salesReturn',
  'inputCgst',
  'inputSgst',
  'inputIgst',
  'outputCgst',
  'outputSgst',
  'outputIgst',
  'cash',
  'bank',
  'retainedEarnings',
];

/* How a Purchase GRN's GST is treated when the journal is written.

     inclusive        the whole invoice (taxable + GST) lands in inventory.
                      This is the default, and the treatment the prompt asks
                      for when GST accounting is not configured: GRC stores a
                      single GST amount, not a CGST/SGST/IGST split, so there
                      is nothing to post to three different tax accounts.
     input-cgst-sgst  intra-state purchase: GST is split equally into Input
                      CGST and Input SGST (what a single intra-state rate is
                      by law), and the payable is the full invoice total.
     input-igst       inter-state purchase: the whole GST goes to Input IGST.

   Only the first is a default; the other two are an explicit choice made on
   the settings screen, never an assumption by the posting code. */
export const GST_POSTING_MODES = ['inclusive', 'input-cgst-sgst', 'input-igst'];

const MappingSchema = new mongoose.Schema(
  {
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: 'accountsMaster', default: null },
    accountName: { type: String, default: '' },
    accountCode: { type: String, default: '' },
  },
  { _id: false }
);

const mappingsObject = MAPPING_KEYS.reduce((shape, key) => {
  shape[key] = { type: MappingSchema, default: () => ({}) };
  return shape;
}, {});

const AccountingSettingsSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    mappings: mappingsObject,
    gstPostingMode: { type: String, enum: GST_POSTING_MODES, default: 'inclusive' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
    updatedByName: { type: String, default: '' },
  },
  { timestamps: true }
);

AccountingSettingsSchema.index(
  { businessId: 1, locationId: 1 },
  { unique: true, name: 'accounting_settings_per_scope' }
);

export default mongoose.models.accountingSettings ||
  mongoose.model('accountingSettings', AccountingSettingsSchema, 'accountingsettings');
