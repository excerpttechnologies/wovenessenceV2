import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import AccountingSettings, { MAPPING_KEYS, GST_POSTING_MODES } from '@/models/AccountingSettings';
import AccountsMaster from '@/models/AccountsMaster';
import { json, guard, sessionAndScope, writeScope } from '@/lib/accounting/route';
import { SCREENS, ACTIONS } from '@/lib/screenPermission';
import { MAPPING_LABELS, loadSettings, mappingProblems, requiredPostingKeys } from '@/lib/accounting/settings';

/* /api/accounting/settings - which account each automatic posting uses.

   Saved per business + location, and every id is checked against the chart
   of that same business before it is stored: a mapping that points at
   another branch's account would post one branch's receipts into the other's
   books, which is exactly what this screen exists to prevent. */

const mappingKeys = MAPPING_KEYS.map((key) => ({ key, label: MAPPING_LABELS[key] || key }));

export async function GET(req) {
  const denied = await guard(req, SCREENS.ACCOUNTS_SETTINGS, ACTIONS.READ);
  if (denied) return denied;

  await dbConnect();
  const { scope } = await sessionAndScope(req);

  const [saved, accounts] = await Promise.all([
    loadSettings(scope),
    AccountsMaster.find({
      ...(scope.businessId ? { businessId: scope.businessId } : {}),
      ...(scope.locationId
        ? { $or: [{ locationId: scope.locationId }, { locationId: null }, { locationId: { $exists: false } }] }
        : {}),
      isActive: { $ne: false },
    })
      .select('accountCode accountName accountType')
      .sort({ accountCode: 1, accountName: 1 })
      .lean(),
  ]);

  const mappings = {};
  MAPPING_KEYS.forEach((key) => {
    const mapping = saved?.mappings?.[key];
    mappings[key] = {
      accountId: mapping?.accountId ? String(mapping.accountId) : '',
      accountName: mapping?.accountName || '',
      accountCode: mapping?.accountCode || '',
    };
  });

  const mode = saved?.gstPostingMode || 'inclusive';
  const problems = await mappingProblems({
    businessId: scope.businessId,
    locationId: scope.locationId,
    keys: requiredPostingKeys(mode),
    settings: saved,
  });

  return json({
    settings: { gstPostingMode: mode, mappings },
    accounts: accounts.map((account) => ({ ...account, _id: String(account._id) })),
    mappingKeys,
    gstModes: GST_POSTING_MODES,
    requiredKeys: requiredPostingKeys(mode),
    problems: saved ? problems : ['Accounting is not set up for this business and location yet.'],
  });
}

export async function PUT(req) {
  const body = await req.json().catch(() => ({}));

  const denied = await guard(req, SCREENS.ACCOUNTS_SETTINGS, ACTIONS.UPDATE, body?.business);
  if (denied) return denied;

  await dbConnect();
  const scope = writeScope(body, new URL(req.url).searchParams);

  if (!scope.businessId) return json({ error: 'Select a business in the top bar.' }, 422);

  const input = body.data || body;
  const mode = input.gstPostingMode;
  if (mode !== undefined && !GST_POSTING_MODES.includes(mode)) {
    return json({ errors: { gstPostingMode: 'Choose a GST posting mode.' } }, 422);
  }

  const incoming = input.mappings || {};
  const keys = Object.keys(incoming).filter((key) => MAPPING_KEYS.includes(key));

  /* Every named account must exist in this business (and at this location, or
     be business-wide). Read in one query, then judged, so a mismatch is a
     clear 422 rather than a dangling reference in the settings. */
  const ids = keys.map((key) => incoming[key]?.accountId).filter((id) => isValidObjectId(String(id || '')));
  const accounts = ids.length
    ? await AccountsMaster.find({
      _id: { $in: ids },
      ...(scope.businessId ? { businessId: scope.businessId } : {}),
      ...(scope.locationId
        ? { $or: [{ locationId: scope.locationId }, { locationId: null }, { locationId: { $exists: false } }] }
        : {}),
    }).select('accountCode accountName').lean()
    : [];
  const byId = new Map(accounts.map((account) => [String(account._id), account]));

  const errors = {};
  keys.forEach((key) => {
    const id = String(incoming[key]?.accountId || '').trim();
    if (!id) return;
    if (!byId.has(id)) {
      errors['mappings.' + key] = 'That account is not in this business or location.';
    }
  });
  if (Object.keys(errors).length) return json({ errors }, 422);

  const existing = await AccountingSettings.findOne({
    businessId: scope.businessId,
    ...(scope.locationId ? { locationId: scope.locationId } : { locationId: null }),
  });

  const mappings = { ...(existing?.mappings || {}) };
  MAPPING_KEYS.forEach((key) => {
    if (!keys.includes(key)) return;
    const id = String(incoming[key]?.accountId || '').trim();
    if (!id) {
      mappings[key] = { accountId: null, accountName: '', accountCode: '' };
      return;
    }
    const account = byId.get(id);
    mappings[key] = {
      accountId: account._id,
      accountName: account.accountName || '',
      accountCode: account.accountCode || '',
    };
  });

  const saved = await AccountingSettings.findOneAndUpdate(
    {
      businessId: scope.businessId,
      ...(scope.locationId ? { locationId: scope.locationId } : { locationId: null }),
    },
    {
      $set: {
        businessId: scope.businessId,
        locationId: scope.locationId || null,
        mappings,
        ...(mode !== undefined ? { gstPostingMode: mode } : {}),
        updatedBy: null,
      },
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  const problems = await mappingProblems({
    businessId: scope.businessId,
    locationId: scope.locationId,
    keys: requiredPostingKeys(saved.gstPostingMode || 'inclusive'),
    settings: saved,
  });

  return json({ ok: true, warnings: problems });
}
