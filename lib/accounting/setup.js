import AccountsMaster from '@/models/AccountsMaster';
import AccountingSettings, { MAPPING_KEYS, GST_POSTING_MODES } from '@/models/AccountingSettings';
import { MAPPING_LABELS, mappedIds, loadSettings, mappingProblems, requiredPostingKeys } from './settings';

/* ==========================================================================
   SETTING THE BOOKS UP - the standard chart and its default mappings.

   Every automatic posting names a ROLE, and the settings screen says which
   account fills it. That is the right end state, but a brand new install has
   neither the accounts nor the mappings, and until it does a GRC posts
   nothing - correctly, but with nothing done about it.

   So this is the bootstrap: the accounts a retail / wholesale business posts
   to (stock, the two GST sides, cash, bank, parties, sales, purchases and
   expenses), and the mappings for them - written by the operator pressing one
   button rather than by the posting code guessing.

   IT IS IDEMPOTENT AND RESPECTFUL:

     - an account that already exists (by code, or by name if its code was
       auto-assigned) is never re-created, so pressing it again is safe and
       an operator's own accounts are left alone
     - only EMPTY mappings are filled; a mapping somebody chose is never
       overwritten
     - nothing is written outside the business and location on the top bar

   After it runs, the same warning the posting route enforces is shown, so the
   screen says the truth: set up, or still missing something.
   ========================================================================== */

/* Which account each role points at. `map` is the AccountingSettings key. */
export const STANDARD_CHART = [
  { code: '1000', name: 'Cash in Hand', type: 'Asset', map: 'cash' },
  { code: '1001', name: 'Bank Account', type: 'Asset', map: 'bank' },
  { code: '1002', name: 'Inventory', type: 'Asset', map: 'inventory' },
  { code: '1003', name: 'Accounts Receivable', type: 'Asset', map: 'accountsReceivable' },
  { code: '1004', name: 'Input CGST', type: 'Asset', map: 'inputCgst' },
  { code: '1005', name: 'Input SGST', type: 'Asset', map: 'inputSgst' },
  { code: '1006', name: 'Input IGST', type: 'Asset', map: 'inputIgst' },
  { code: '1007', name: 'Advances to Suppliers', type: 'Asset' },
  { code: '1100', name: 'Furniture & Fixtures', type: 'Asset' },

  { code: '2000', name: 'Accounts Payable', type: 'Liability', map: 'accountsPayable' },
  { code: '2001', name: 'Output CGST', type: 'Liability', map: 'outputCgst' },
  { code: '2002', name: 'Output SGST', type: 'Liability', map: 'outputSgst' },
  { code: '2003', name: 'Output IGST', type: 'Liability', map: 'outputIgst' },
  { code: '2004', name: 'Expenses Payable', type: 'Liability' },

  { code: '3000', name: 'Capital', type: 'Equity', map: 'retainedEarnings' },
  { code: '3001', name: 'Owner Drawings', type: 'Equity' },

  { code: '4000', name: 'Sales', type: 'Income', map: 'sales' },
  { code: '4001', name: 'Sales Returns', type: 'Income', map: 'salesReturn' },
  { code: '4002', name: 'Other Income', type: 'Income' },

  { code: '5000', name: 'Purchases', type: 'Expense', map: 'purchase' },
  { code: '5001', name: 'Rent', type: 'Expense' },
  { code: '5002', name: 'Salaries & Wages', type: 'Expense' },
  { code: '5003', name: 'Electricity & Water', type: 'Expense' },
  { code: '5004', name: 'Freight & Carriage', type: 'Expense' },
  { code: '5005', name: 'Other Expenses', type: 'Expense' },
];

const scopeFilter = ({ businessId, locationId }) => {
  const filter = { businessId };
  if (locationId) {
    filter.$or = [{ locationId }, { locationId: null }, { locationId: { $exists: false } }];
  }
  return filter;
};

/* Creates the chart's accounts that are not already there.

   Returns { created, found } with accounts keyed by their settings role, so
   the caller can map them without a second lookup. An account already in the
   chart - found by code, then by name - is adopted rather than re-created;
   the name fallback matters because an operator who created "Inventory"
   without a code got a generated one. */
export async function ensureChartOfAccounts({ businessId, locationId, finYear = '' }) {
  const filter = scopeFilter({ businessId, locationId });
  const existing = await AccountsMaster.find(filter)
    .select('accountCode accountName accountType')
    .lean();

  const byCode = new Map();
  const byName = new Map();
  existing.forEach((account) => {
    const code = String(account.accountCode || '').trim();
    if (code) byCode.set(code, account);
    byName.set(String(account.accountName || '').trim().toLowerCase(), account);
  });

  const created = [];
  const accountsByKey = {};

  for (const spec of STANDARD_CHART) {
    // eslint-disable-next-line no-await-in-loop
    let account = byCode.get(spec.code) || byName.get(spec.name.toLowerCase());

    if (!account) {
      // eslint-disable-next-line no-await-in-loop
      account = await AccountsMaster.create({
        businessId,
        locationId: locationId || null,
        finYear,
        accountCode: spec.code,
        accountName: spec.name,
        accountType: spec.type,
        openingBalance: 0,
        isActive: true,
        description: 'Created by the standard chart setup.',
      });
      account = account.toObject();
      created.push(spec.code + ' ' + spec.name);
      byCode.set(spec.code, account);
    }

    if (spec.map) accountsByKey[spec.map] = account;
  }

  return { created, accountsByKey, existingCount: existing.length };
}

/* Fills the EMPTY mappings only, then says what is still missing. */
export async function applyDefaultMappings({
  businessId, locationId, accountsByKey, mode = 'inclusive',
}) {
  const current = await loadSettings({ businessId, locationId });
  const already = mappedIds(current);

  const mappings = { ...(current?.mappings || {}) };
  const filled = [];

  Object.entries(accountsByKey).forEach(([key, account]) => {
    if (!MAPPING_KEYS.includes(key) || !account) return;
    if (already[key]) return;                       // an operator's choice wins
    mappings[key] = {
      accountId: account._id,
      accountName: account.accountName || '',
      accountCode: account.accountCode || '',
    };
    filled.push(MAPPING_LABELS[key] || key);
  });

  const safeMode = GST_POSTING_MODES.includes(mode) ? mode : 'inclusive';

  const settings = await AccountingSettings.findOneAndUpdate(
    { businessId, locationId: locationId || null },
    {
      $set: {
        businessId,
        locationId: locationId || null,
        mappings,
        gstPostingMode: current?.gstPostingMode || safeMode,
      },
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  const problems = await mappingProblems({
    businessId,
    locationId,
    keys: requiredPostingKeys(settings.gstPostingMode || 'inclusive'),
    settings,
  });

  return { filled, settings, problems };
}

/* The whole setup in one call: chart, then mappings. */
export async function setupAccounting({ businessId, locationId, finYear = '', mode = 'inclusive' }) {
  if (!businessId) {
    return { ok: false, error: 'Select a business in the top bar first.' };
  }

  const chart = await ensureChartOfAccounts({ businessId, locationId, finYear });
  const mappings = await applyDefaultMappings({
    businessId,
    locationId,
    accountsByKey: chart.accountsByKey,
    mode,
  });

  return {
    ok: true,
    created: chart.created,
    createdCount: chart.created.length,
    filled: mappings.filled,
    problems: mappings.problems,
    accounts: await AccountsMaster.countDocuments(scopeFilter({ businessId, locationId })),
    requiredKeys: requiredPostingKeys(mappings.settings?.gstPostingMode || 'inclusive'),
    gstPostingMode: mappings.settings?.gstPostingMode || 'inclusive',
    mappings: Object.fromEntries(
      MAPPING_KEYS.map((key) => [key, String(mappings.settings?.mappings?.[key]?.accountId || '')])
    ),
  };
}
