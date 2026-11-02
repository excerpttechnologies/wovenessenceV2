import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import AccountsMaster, { ACCOUNT_TYPES } from '@/models/AccountsMaster';
import JournalEntry from '@/models/JournalEntry';
import AccountingSettings, { MAPPING_KEYS } from '@/models/AccountingSettings';
import { json, guard, sessionAndScope, writeScope } from '@/lib/accounting/route';
import { SCREENS, ACTIONS } from '@/lib/screenPermission';
import { MAPPING_LABELS } from '@/lib/accounting/settings';
import { r2 } from '@/lib/accounting/calc';

/* /api/accounting/accounts/<id> - read one, update, delete. */

const scopeFilter = (scope) => {
  const filter = {};
  if (scope.businessId) filter.businessId = scope.businessId;
  if (scope.locationId) {
    filter.$or = [{ locationId: scope.locationId }, { locationId: null }, { locationId: { $exists: false } }];
  }
  return filter;
};

/* The record, but only when it is in the scope the request may touch. */
async function findScoped(id, scope) {
  if (!isValidObjectId(id)) return null;
  return AccountsMaster.findOne({ _id: id, ...scopeFilter(scope) }).lean();
}

export async function GET(req, { params }) {
  const denied = await guard(req, SCREENS.ACCOUNTS_CHART, ACTIONS.READ);
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;
  const { scope } = await sessionAndScope(req);

  const doc = await findScoped(id, scope);
  if (!doc) return json({ doc: null }, 404);

  return json({
    doc: {
      ...doc,
      _id: String(doc._id),
      parentAccountId: doc.parentAccountId ? String(doc.parentAccountId) : null,
      isActive: doc.isActive === false ? 'Inactive' : 'Active',
      openingBalance: r2(doc.openingBalance),
    },
  });
}

export async function PUT(req, { params }) {
  const body = await req.json().catch(() => ({}));

  const denied = await guard(req, SCREENS.ACCOUNTS_CHART, ACTIONS.UPDATE, body?.business);
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;
  const scope = writeScope(body, new URL(req.url).searchParams);

  const existing = await findScoped(id, scope);
  if (!existing) return json({ error: 'Not found' }, 404);

  const data = body.data || {};

  const errors = {};
  if (!String(data.accountName || '').trim()) errors.accountName = 'Account name is required.';
  if (!ACCOUNT_TYPES.includes(data.accountType)) errors.accountType = 'Choose an account type.';
  if (Object.keys(errors).length) return json({ errors }, 422);

  const accountCode = String(data.accountCode || existing.accountCode || '').trim();
  if (accountCode && accountCode !== existing.accountCode) {
    const clash = await AccountsMaster.findOne({
      _id: { $ne: existing._id },
      ...scopeFilter(scope),
      accountCode,
    }).select('_id').lean();
    if (clash) {
      return json({ errors: { accountCode: 'That account code is already used in this business.' } }, 422);
    }
  }

  const parentAccountId = data.parentAccountId || null;
  if (parentAccountId) {
    if (String(parentAccountId) === String(existing._id)) {
      return json({ errors: { parentAccountId: 'An account cannot be its own parent.' } }, 422);
    }
    const parent = await AccountsMaster.findOne({
      _id: parentAccountId,
      ...scopeFilter(scope),
    }).select('_id').lean();
    if (!parent) {
      return json({ errors: { parentAccountId: 'That parent account is not in this business.' } }, 422);
    }
  }

  /* businessId and locationId are deliberately NOT written: moving an
     account between branches would detach every posting already made to it. */
  await AccountsMaster.updateOne({ _id: existing._id }, {
    $set: {
      accountCode,
      accountName: String(data.accountName).trim(),
      accountType: data.accountType,
      parentAccountId,
      openingBalance: r2(data.openingBalance),
      isActive: data.isActive !== false && data.isActive !== 'Inactive',
      description: String(data.description || '').trim(),
    },
  });

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const denied = await guard(req, SCREENS.ACCOUNTS_CHART, ACTIONS.DELETE);
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;
  const { scope } = await sessionAndScope(req);

  const existing = await findScoped(id, scope);
  if (!existing) return json({ error: 'Not found' }, 404);

  /* Refused, with the reason, rather than deleted: an account with postings
     or children is part of the books. Deactivating it is the way to retire
     one, and the message says so. */
  const [posted, children] = await Promise.all([
    JournalEntry.countDocuments({ 'lines.accountId': existing._id }),
    AccountsMaster.countDocuments({ parentAccountId: existing._id }),
  ]);

  if (posted) {
    return json({
      error: 'This account has ' + posted + ' accounting line'
        + (posted === 1 ? '' : 's') + ' posted to it and cannot be deleted. '
        + 'Mark it inactive instead so the history stays intact.',
    }, 422);
  }

  if (children) {
    return json({
      error: 'This account has ' + children + ' child account'
        + (children === 1 ? '' : 's') + '. Move or delete them first.',
    }, 422);
  }

  const settingsRows = await AccountingSettings.find({
    ...scopeFilter(scope),
    $or: MAPPING_KEYS.map((key) => ({ ['mappings.' + key + '.accountId']: existing._id })),
  }).select('mappings').lean();

  if (settingsRows.length) {
    const roles = new Set();
    settingsRows.forEach((row) => {
      MAPPING_KEYS.forEach((key) => {
        if (String(row.mappings?.[key]?.accountId || '') === String(existing._id)) {
          roles.add(MAPPING_LABELS[key] || key);
        }
      });
    });
    return json({
      error: 'This account is used by Accounting Settings for: ' + [...roles].join(', ')
        + '. Re-map those first, or mark the account inactive.',
    }, 422);
  }

  await AccountsMaster.deleteOne({ _id: existing._id });
  return json({ ok: true });
}
