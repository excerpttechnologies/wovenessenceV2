import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import AccountsMaster, { ACCOUNT_TYPES } from '@/models/AccountsMaster';
import { json, guard, sessionAndScope, writeScope } from '@/lib/accounting/route';
import { SCREENS, ACTIONS } from '@/lib/screenPermission';
import { escapeRegex } from '@/lib/validate';
import { r2 } from '@/lib/accounting/calc';

/* /api/accounting/accounts - the chart of accounts: list + create. */

const PER_PAGE = 10;

const scopeFilter = (scope) => {
  const filter = {};
  if (scope.businessId) filter.businessId = scope.businessId;
  if (scope.locationId) {
    filter.$or = [{ locationId: scope.locationId }, { locationId: null }, { locationId: { $exists: false } }];
  }
  return filter;
};

/* The next free numeric code in this scope. The unique index is per business
   and location, so an account opened without a code still needs a distinct
   one - an empty string would collide with the second account. */
async function nextAccountCode(scope) {
  const rows = await AccountsMaster.find(scopeFilter(scope)).select('accountCode').lean();
  let highest = 0;
  rows.forEach((row) => {
    const match = /^(\d+)$/.exec(String(row.accountCode || '').trim());
    if (match) highest = Math.max(highest, Number(match[1]));
  });
  return String(highest + 1).padStart(4, '0');
}

function accountProblems(data) {
  const errors = {};
  if (!String(data.accountName || '').trim()) errors.accountName = 'Account name is required.';
  if (!ACCOUNT_TYPES.includes(data.accountType)) errors.accountType = 'Choose an account type.';
  if (data.parentAccountId && !isValidObjectId(data.parentAccountId)) {
    errors.parentAccountId = 'Choose a valid parent account.';
  }
  return errors;
}

export async function GET(req) {
  const denied = await guard(req, SCREENS.ACCOUNTS_CHART, ACTIONS.READ);
  if (denied) return denied;

  await dbConnect();
  const { scope } = await sessionAndScope(req);
  const sp = new URL(req.url).searchParams;

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(200, Math.max(1, Number(sp.get('perPage') || PER_PAGE)));

  const filter = scopeFilter(scope);
  const type = sp.get('accountType');
  if (ACCOUNT_TYPES.includes(type)) filter.accountType = type;
  const active = sp.get('active');
  if (active === '1') filter.isActive = { $ne: false };
  const search = String(sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$and = [...(filter.$and || []), { $or: [{ accountName: rx }, { accountCode: rx }] }];
  }

  const total = await AccountsMaster.countDocuments(filter);
  const rows = await AccountsMaster.find(filter)
    .sort({ accountType: 1, accountCode: 1, accountName: 1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  /* The balance column is the account's OPENING balance: what the chart
     stores. Live postings are the Trial Balance's job, and mixing the two
     here would make this list disagree with the value it lets you edit. */
  return json({
    rows: rows.map((row) => ({
      ...row,
      _id: String(row._id),
      parentAccountId: row.parentAccountId ? String(row.parentAccountId) : null,
      /* the screens read and write Active / Inactive, the way every other
         master does; the column itself stays a boolean. */
      isActive: row.isActive === false ? 'Inactive' : 'Active',
      openingBalance: r2(row.openingBalance),
      balanceType: r2(row.openingBalance) > 0 ? 'Dr' : (r2(row.openingBalance) < 0 ? 'Cr' : 'Nil'),
    })),
    labels: {},
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    total,
    perPage,
  });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const denied = await guard(req, SCREENS.ACCOUNTS_CHART, ACTIONS.CREATE, body?.business);
  if (denied) return denied;

  await dbConnect();
  const data = body.data || {};
  const scope = writeScope(body, new URL(req.url).searchParams);

  if (!scope.businessId) return json({ error: 'Select a business in the top bar.' }, 422);

  const errors = accountProblems(data);
  if (Object.keys(errors).length) return json({ errors }, 422);

  const accountCode = String(data.accountCode || '').trim();
  if (accountCode) {
    const clash = await AccountsMaster.findOne({
      ...scopeFilter(scope),
      accountCode,
    }).select('_id').lean();
    if (clash) {
      return json({ errors: { accountCode: 'That account code is already used in this business.' } }, 422);
    }
  }

  /* A parent has to be an account this one can roll into: same scope, and
     not the account itself (which cannot happen on create, but keeps the
     rule in one place for the update route). */
  if (data.parentAccountId) {
    const parent = await AccountsMaster.findOne({
      _id: data.parentAccountId,
      ...scopeFilter(scope),
    }).select('_id').lean();
    if (!parent) {
      return json({ errors: { parentAccountId: 'That parent account is not in this business.' } }, 422);
    }
  }

  const doc = await AccountsMaster.create({
    businessId: scope.businessId,
    locationId: scope.locationId || null,
    finYear: scope.finYear || '',
    accountCode: accountCode || await nextAccountCode(scope),
    accountName: String(data.accountName).trim(),
    accountType: data.accountType,
    parentAccountId: data.parentAccountId || null,
    openingBalance: r2(data.openingBalance),
    isActive: data.isActive !== false && data.isActive !== 'Inactive',
    description: String(data.description || '').trim(),
  });

  return json({ ok: true, id: String(doc._id) });
}
