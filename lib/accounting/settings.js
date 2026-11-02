import AccountingSettings, { MAPPING_KEYS, GST_POSTING_MODES } from '@/models/AccountingSettings';
import AccountsMaster from '@/models/AccountsMaster';
import { r2, toPaise, fromPaise } from './calc';

/* ==========================================================================
   WHICH ACCOUNT A POSTING USES.

   A posting rule names a ROLE ("inventory", "accountsPayable"), never an
   account id. The id comes from AccountingSettings for the document's own
   business and location, so one branch's receipt can never be posted into
   another branch's chart.

   A missing mapping is an ERROR, not a fallback. Guessing an account is how
   books silently end up in the wrong place, and a posting that guessed is
   harder to find later than one that refused and said which mapping it
   needed.
   ========================================================================== */

export const MAPPING_LABELS = {
  inventory: 'Inventory',
  purchase: 'Purchase',
  accountsPayable: 'Accounts Payable',
  accountsReceivable: 'Accounts Receivable',
  sales: 'Sales',
  salesReturn: 'Sales Return',
  inputCgst: 'Input CGST',
  inputSgst: 'Input SGST',
  inputIgst: 'Input IGST',
  outputCgst: 'Output CGST',
  outputSgst: 'Output SGST',
  outputIgst: 'Output IGST',
  cash: 'Cash',
  bank: 'Bank',
  retainedEarnings: 'Retained Earnings',
};

const isValidId = (value) => /^[0-9a-fA-F]{24}$/.test(String(value || ''));

/* The account ids a settings row currently maps, as plain strings. */
export function mappedIds(settings) {
  const out = {};
  MAPPING_KEYS.forEach((key) => {
    const id = settings?.mappings?.[key]?.accountId;
    out[key] = id ? String(id) : '';
  });
  return out;
}

/* Reads the row for one business + location. Null when nothing is saved. */
export async function loadSettings({ businessId, locationId }) {
  if (!isValidId(businessId)) return null;
  const filter = { businessId };
  if (isValidId(locationId)) {
    filter.$or = [{ locationId }, { locationId: null }, { locationId: { $exists: false } }];
  }
  const rows = await AccountingSettings.find(filter).lean();
  if (!rows.length) return null;
  /* Prefer the exact location's row over a business-wide one. */
  return rows.find((r) => String(r.locationId || '') === String(locationId || '')) || rows[0];
}

/* A problem a posting would hit, as a sentence naming what to map.
   Empty when every role the mode needs is mapped and still exists. */
export async function mappingProblems({ businessId, locationId, keys, settings = null }) {
  const row = settings || await loadSettings({ businessId, locationId });
  if (!row) {
    return ['Accounting is not set up for this business and location. Press "Set up accounting" on '
      + 'Accounts > Accounting Settings to create the standard accounts and map them, or map them by hand.'];
  }

  const ids = mappedIds(row);
  const wanted = [...new Set(keys)].filter(Boolean);
  const missing = wanted.filter((key) => !ids[key]);
  if (missing.length) {
    return ['These accounts are not mapped on Accounts > Accounting Settings: '
      + missing.map((key) => MAPPING_LABELS[key] || key).join(', ')
      + '. Press "Set up accounting" there to create and map them, or choose them yourself.'];
  }

  /* A mapped id that no longer exists is as unusable as no mapping at all -
     and saying so is what stops a posting pointing at a deleted account. */
  const existing = await AccountsMaster.find({
    _id: { $in: wanted.map((key) => ids[key]) },
  }).select('_id businessId locationId').lean();

  const usable = new Set(existing
    .filter((a) => String(a.businessId || '') === String(businessId || ''))
    .filter((a) => !isValidId(locationId) || !a.locationId
      || String(a.locationId) === String(locationId))
    .map((a) => String(a._id)));

  const gone = wanted.filter((key) => !usable.has(ids[key]));
  if (gone.length) {
    return ['These mapped accounts no longer exist in this business: '
      + gone.map((key) => MAPPING_LABELS[key] || key).join(', ')
      + '. Re-map them on Accounts > Accounting Settings.'];
  }

  return [];
}

/* The account for one role, with its name and code, ready for a journal line.
   Throws when it cannot be resolved - callers check mappingProblems first so
   the message they show is the mapping one, not this. */
export function accountFor(settings, key) {
  const mapping = settings?.mappings?.[key];
  if (!mapping?.accountId) {
    throw new Error('No account mapped for ' + (MAPPING_LABELS[key] || key) + '.');
  }
  return {
    accountId: String(mapping.accountId),
    accountName: mapping.accountName || MAPPING_LABELS[key] || '',
    accountCode: mapping.accountCode || '',
  };
}

/* Which input-tax roles a GST mode needs, and how the tax amount is split.
   The split always adds back up to the paise: CGST is floored at half and
   SGST takes the remainder, so an odd paisa is never lost. */
export function gstSplit(mode, gst) {
  const total = toPaise(gst);
  if (total === 0) return [];
  if (mode === 'input-igst') return [{ key: 'inputIgst', amount: fromPaise(total) }];
  if (mode === 'input-cgst-sgst') {
    const half = Math.floor(total / 2);
    return [
      { key: 'inputCgst', amount: fromPaise(half) },
      { key: 'inputSgst', amount: fromPaise(total - half) },
    ];
  }
  /* inclusive: the tax stays inside the inventory debit - no tax account */
  return [];
}

/* The roles a Purchase GRC posting needs, for a given GST mode. Named here
   so the settings screen's warning and the posting route's refusal cannot
   disagree about what is still missing. */
export function requiredPostingKeys(mode) {
  if (mode === 'input-igst') return ['inventory', 'accountsPayable', 'inputIgst'];
  if (mode === 'input-cgst-sgst') return ['inventory', 'accountsPayable', 'inputCgst', 'inputSgst'];
  return ['inventory', 'accountsPayable'];
}

export function gstModeOf(settings) {
  const mode = settings?.gstPostingMode;
  return GST_POSTING_MODES.includes(mode) ? mode : 'inclusive';
}

export { r2 };
