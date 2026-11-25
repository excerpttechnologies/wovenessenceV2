import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import JournalEntry from '@/models/JournalEntry';
import AccountsMaster, { ACCOUNT_TYPES } from '@/models/AccountsMaster';
import CompanyLocation from '@/models/CompanyLocation';
import { r2, scopeOf } from '@/lib/reports';

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

function parseDate(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(
    year,
    month - 1,
    day,
    endOfDay ? 23 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  );
  if (
    Number.isNaN(date.getTime())
    || date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) return null;
  return date;
}

const voucherNoExpr = {
  $cond: [
    { $gt: [{ $strLenCP: { $ifNull: ['$referenceNo', ''] } }, 0] },
    '$referenceNo',
    { $ifNull: ['$sourceRefNo', ''] },
  ],
};

const referenceExpr = {
  $cond: [
    { $gt: [{ $strLenCP: { $ifNull: ['$sourceRefNo', ''] } }, 0] },
    '$sourceRefNo',
    '',
  ],
};

export async function GET(request) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const params = new URL(request.url).searchParams;
  const fromDate = parseDate(params.get('fromDate'));
  const toDate = parseDate(params.get('toDate'), true);

  if (!fromDate || !toDate) return json({ error: 'Date From and Date To are required.' }, 422);
  if (fromDate > toDate) return json({ error: 'Date From must be on or before Date To.' }, 422);

  await dbConnect();

  const scope = scopeOf(params);
  if (!scope.businessId) return json({ error: 'Select a business in the top bar.' }, 422);
  const denied = await screenDenial({ session, screen: SCREENS.JOURNAL_VOUCHER_REPORT, action: PERM.READ, businessId: scope.businessId, label: 'the journal voucher report' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);
  if (params.get('allLocations') === '1') scope.locationId = null;

  const ledgerId = params.get('ledgerId') || '';
  if (ledgerId && !isValidObjectId(ledgerId)) {
    return json({ error: 'Select a valid ledger.' }, 422);
  }

  const ledgerGroup = params.get('ledgerGroup') || '';
  if (ledgerGroup && !ACCOUNT_TYPES.includes(ledgerGroup)) {
    return json({ error: 'Select a valid ledger group.' }, 422);
  }

  const lineMatch = {};
  let accountIds = null;
  if (ledgerGroup) {
    const accountFilter = {
      businessId: new Types.ObjectId(scope.businessId),
      accountType: ledgerGroup,
    };
    if (scope.locationId) {
      accountFilter.$or = [
        { locationId: new Types.ObjectId(scope.locationId) },
        { locationId: null },
        { locationId: { $exists: false } },
      ];
    }
    const accounts = await AccountsMaster.find(accountFilter).select('_id').lean();
    accountIds = accounts.map((account) => account._id);
  }
  if (ledgerId) {
    const selectedAccountId = new Types.ObjectId(ledgerId);
    if (accountIds && !accountIds.some((id) => String(id) === ledgerId)) {
      accountIds = [];
    } else {
      accountIds = [selectedAccountId];
    }
  }
  if (accountIds) lineMatch.accountId = { $in: accountIds };

  const drCr = params.get('drCr') || 'both';
  if (!['both', 'debit', 'credit'].includes(drCr)) {
    return json({ error: 'Select Debit and Credit, Debit Only, or Credit Only.' }, 422);
  }
  if (drCr === 'debit') lineMatch.debit = { $gt: 0 };
  if (drCr === 'credit') lineMatch.credit = { $gt: 0 };

  const filter = {
    businessId: new Types.ObjectId(scope.businessId),
    ...(scope.locationId ? { locationId: new Types.ObjectId(scope.locationId) } : {}),
    ...(scope.finYear ? { finYear: scope.finYear } : {}),
    journalDate: { $gte: fromDate, $lte: toDate },
    lines: { $elemMatch: lineMatch },
  };

  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(params.get('perPage') || '15', 10) || 15));
  const tab = params.get('tab') === 'voucher' ? 'voucher' : 'entry';
  const summaryByEntry = [
    {
      $group: {
        _id: '$_id',
        lines: { $sum: 1 },
        debit: { $sum: { $ifNull: ['$lines.debit', 0] } },
        credit: { $sum: { $ifNull: ['$lines.credit', 0] } },
      },
    },
    {
      $group: {
        _id: null,
        totalVouchers: { $sum: 1 },
        totalLines: { $sum: '$lines' },
        debit: { $sum: '$debit' },
        credit: { $sum: '$credit' },
      },
    },
    { $project: { _id: 0, totalVouchers: 1, totalLines: 1, debit: 1, credit: 1 } },
  ];

  const pipeline = [
    { $match: filter },
    { $unwind: '$lines' },
    { $match: { lines: lineMatch } },
  ];

  if (tab === 'voucher') {
    pipeline.push({
      $group: {
        _id: '$_id',
        journalDate: { $first: '$journalDate' },
        locationId: { $first: '$locationId' },
        referenceNo: { $first: '$referenceNo' },
        sourceRefNo: { $first: '$sourceRefNo' },
        narration: { $first: '$narration' },
        lineCount: { $sum: 1 },
        debit: { $sum: { $ifNull: ['$lines.debit', 0] } },
        credit: { $sum: { $ifNull: ['$lines.credit', 0] } },
      },
    });
  }

  const summaryPipeline = tab === 'voucher'
    ? [
      {
        $group: {
          _id: null,
          totalVouchers: { $sum: 1 },
          totalLines: { $sum: '$lineCount' },
          debit: { $sum: '$debit' },
          credit: { $sum: '$credit' },
        },
      },
      { $project: { _id: 0, totalVouchers: 1, totalLines: 1, debit: 1, credit: 1 } },
    ]
    : summaryByEntry;

  const rowPipeline = tab === 'voucher'
    ? [
      { $sort: { journalDate: -1, _id: -1 } },
      { $skip: (page - 1) * perPage },
      { $limit: perPage },
      {
        $project: {
          _id: { $toString: '$_id' },
          voucherNo: voucherNoExpr,
          date: '$journalDate',
          locationId: { $toString: '$locationId' },
          reference: referenceExpr,
          debit: 1,
          credit: 1,
          lineCount: 1,
          difference: { $abs: { $subtract: ['$debit', '$credit'] } },
          narration: { $ifNull: ['$narration', ''] },
        },
      },
    ]
    : [
      { $sort: { journalDate: -1, _id: -1, 'lines._id': 1 } },
      { $skip: (page - 1) * perPage },
      { $limit: perPage },
      {
        $project: {
          _id: {
            $concat: [{ $toString: '$_id' }, '-', { $toString: '$lines._id' }],
          },
          voucherNo: voucherNoExpr,
          date: '$journalDate',
          locationId: { $toString: '$locationId' },
          reference: referenceExpr,
          ledger: { $ifNull: ['$lines.accountName', ''] },
          debit: { $ifNull: ['$lines.debit', 0] },
          credit: { $ifNull: ['$lines.credit', 0] },
          lineRemark: { $ifNull: ['$lines.narration', ''] },
          narration: { $ifNull: ['$narration', ''] },
        },
      },
    ];

  const [result = { rows: [], summary: [] }] = await JournalEntry.aggregate([
    ...pipeline,
    { $facet: { rows: rowPipeline, summary: summaryPipeline } },
  ]);
  const summary = result.summary[0] || {
    totalVouchers: 0,
    totalLines: 0,
    debit: 0,
    credit: 0,
  };

  const locationIds = [...new Set(
    result.rows.map((row) => row.locationId).filter((id) => isValidObjectId(id))
  )].map((id) => new Types.ObjectId(id));
  const locations = locationIds.length
    ? await CompanyLocation.find({ _id: { $in: locationIds } }).select('name').lean()
    : [];
  const locationNames = new Map(locations.map((location) => [String(location._id), location.name || '']));
  const rows = result.rows.map((row) => ({
    ...row,
    location: locationNames.get(row.locationId) || '-',
    debit: r2(row.debit),
    credit: r2(row.credit),
    difference: r2(row.difference),
  }));
  const debit = r2(summary.debit);
  const credit = r2(summary.credit);
  const total = tab === 'voucher' ? Number(summary.totalVouchers) || 0 : Number(summary.totalLines) || 0;
  const difference = r2(Math.abs(debit - credit));

  return json({
    tiles: {
      totalVouchers: Number(summary.totalVouchers) || 0,
      totalLines: Number(summary.totalLines) || 0,
      totalDebit: debit,
      totalCredit: credit,
      difference,
    },
    sections: [{
      rows,
      count: total,
      totals: { debit, credit, difference },
    }],
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
    page,
    perPage,
  });
}
