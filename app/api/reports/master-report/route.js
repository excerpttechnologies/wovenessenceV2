import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { can, PERMISSIONS } from '@/lib/rbac';
import { requireSession } from '@/lib/session';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import Customer from '@/models/Customer';
import PosInvoice from '@/models/PosInvoice';
import { ROLES } from '@/models/User';

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

const cancelledDocuments = {
  status: { $not: { $regex: '^(cancelled|canceled|draft|deleted)$', $options: 'i' } },
  isCancelled: { $ne: true },
  isDeleted: { $ne: true },
  deletedAt: { $in: [null] },
};

function financialYearRange(finYear) {
  const match = /^(\d{4})-(\d{4})$/.exec(finYear || '');
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return null;
  const startYear = Number(match[1]);
  const endYear = Number(match[2]);
  return {
    fromDate: new Date(startYear, 3, 1, 0, 0, 0, 0),
    toDate: new Date(endYear, 2, 31, 23, 59, 59, 999),
  };
}

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

function dateExpression(fromDate, toDate) {
  const effectiveDate = { $ifNull: ['$date', '$createdAt'] };
  return {
    $expr: {
      $and: [
        { $gte: [effectiveDate, fromDate] },
        { $lte: [effectiveDate, toDate] },
      ],
    },
  };
}

function invoiceMatch({ finYear, allowedLocationIds, fromDate, toDate }) {
  return {
    businessId: { $type: 'objectId' },
    customerId: { $type: 'objectId' },
    ...cancelledDocuments,
    ...(allowedLocationIds ? { locationId: { $in: allowedLocationIds } } : {}),
    ...(finYear ? { finYear } : {}),
    ...(fromDate && toDate ? dateExpression(fromDate, toDate) : {}),
  };
}

function aggregateCustomerSales(match) {
  return PosInvoice.aggregate([
    { $match: match },
    {
      $group: {
        _id: { businessId: '$businessId', locationId: '$locationId', customerId: '$customerId' },
        value: {
          $sum: {
            $convert: {
              input: { $ifNull: ['$totalAmount', 0] },
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
    },
  ]);
}

async function firstPurchaseDates({ customerRefs, allowedLocationIds }) {
  if (!customerRefs.length) return new Map();
  const businessIds = [...new Set(customerRefs.map((ref) => ref.businessId))]
    .map((id) => new Types.ObjectId(id));
  const customerIds = [...new Set(customerRefs.map((ref) => ref.customerId))]
    .map((id) => new Types.ObjectId(id));
  const rows = await PosInvoice.aggregate([
    {
      $match: {
        businessId: { $in: businessIds },
        customerId: { $in: customerIds },
        ...cancelledDocuments,
        ...(allowedLocationIds ? { locationId: { $in: allowedLocationIds } } : {}),
      },
    },
    { $addFields: { reportDate: { $ifNull: ['$date', '$createdAt'] } } },
    {
      $group: {
        _id: { businessId: '$businessId', customerId: '$customerId' },
        firstPurchaseAt: { $min: '$reportDate' },
      },
    },
  ]);
  return new Map(rows.map((row) => [
    `${String(row._id.businessId)}:${String(row._id.customerId)}`,
    row.firstPurchaseAt,
  ]));
}

function customerRefsFrom(rows) {
  const refs = new Map();
  rows.forEach((row) => {
    const businessId = String(row._id.businessId || '');
    const customerId = String(row._id.customerId || '');
    if (isValidObjectId(businessId) && isValidObjectId(customerId)) {
      refs.set(`${businessId}:${customerId}`, { businessId, customerId });
    }
  });
  return [...refs.values()];
}

function customerKey(businessId, customerId) {
  return `${businessId}:${customerId}`;
}

function categoryFor(businessId, customerId, firstDates, fromDate, toDate) {
  const firstDate = firstDates.get(customerKey(businessId, customerId));
  return firstDate && firstDate >= fromDate && firstDate <= toDate ? 'new' : 'repeat';
}

function percentage(part, total) {
  return total ? Math.round((part / total) * 10000) / 100 : 0;
}

function businessGroupLabel(business, locations) {
  const name = String(business.businessPrintName || business.name || '').trim();
  const locationNames = locations
    .filter((location) => String(location.businessId || '') === String(business._id))
    .map((location) => String(location.name || ''))
    .join(' ');
  const knownCode = `${name} ${locationNames}`.match(/\b(JNR|HSR|SF|RRN)\b/i);
  if (knownCode) return knownCode[1].toUpperCase();
  const initials = (name.match(/[A-Za-z0-9]+/g) || [])
    .map((word) => word[0])
    .join('')
    .toUpperCase();
  return initials === 'SF' ? initials : name || 'Unknown business';
}

function summaryResponse({ rows, firstDates, locations, businesses, fromDate, toDate }) {
  const businessesById = new Map(businesses.map((business) => [String(business._id), business]));
  rows.forEach((row) => {
    const businessId = String(row._id.businessId || '');
    if (businessId && !businessesById.has(businessId)) {
      businessesById.set(businessId, { _id: businessId, name: 'Unknown business' });
    }
  });
  const codeOrder = { JNR: 0, HSR: 1, SF: 2, RRN: 3 };
  const groups = [...businessesById.values()]
    .map((business) => ({
      id: String(business._id),
      label: businessGroupLabel(business, locations),
    }))
    .sort((left, right) => (
      (codeOrder[left.label] ?? 4) - (codeOrder[right.label] ?? 4)
      || left.label.localeCompare(right.label)
    ));

  const stats = new Map(groups.map((group) => [
    group.id,
    {
      new: { customers: new Set(), value: 0 },
      repeat: { customers: new Set(), value: 0 },
    },
  ]));
  const grand = {
    new: { customers: new Set(), value: 0 },
    repeat: { customers: new Set(), value: 0 },
  };

  rows.forEach((row) => {
    const customerId = String(row._id.customerId);
    const businessId = String(row._id.businessId);
    const category = categoryFor(businessId, customerId, firstDates, fromDate, toDate);
    const amount = Number(row.value) || 0;
    const group = stats.get(businessId);
    if (!group) return;
    const refKey = customerKey(businessId, customerId);
    group[category].customers.add(refKey);
    group[category].value += amount;
    grand[category].customers.add(refKey);
    grand[category].value += amount;
  });

  const cellFor = (group, category) => {
    const totalCustomers = group.new.customers.size + group.repeat.customers.size;
    const totalValue = group.new.value + group.repeat.value;
    const selected = category === 'total'
      ? {
        customers: new Set([...group.new.customers, ...group.repeat.customers]),
        value: totalValue,
      }
      : group[category];
    return {
      volume: selected.customers.size,
      volumePercent: percentage(selected.customers.size, totalCustomers),
      value: Math.round(selected.value * 100) / 100,
      valuePercent: percentage(selected.value, totalValue),
    };
  };

  const allGroups = [...groups, {
    id: 'grandTotal',
    label: 'Grand Total',
    stats: grand,
  }];
  const rowsByCategory = ['new', 'repeat', 'total'].map((category) => ({
    key: category,
    label: category === 'new' ? 'New customer' : category === 'repeat' ? 'Repeat customer' : 'Total',
    values: Object.fromEntries(allGroups.map((group) => [
      group.id,
      cellFor(group.stats || stats.get(group.id), category),
    ])),
  }));

  return {
    groups: allGroups.map(({ id, label }) => ({ id, label })),
    rows: rowsByCategory,
    hasData: rows.length > 0,
  };
}

function customerName(customer, snapshotName, customerId) {
  const fullName = [
    customer?.prefix,
    customer?.firstName,
    customer?.middleName,
    customer?.lastName,
  ].filter(Boolean).join(' ').trim();
  return customer?.businessName || fullName || snapshotName || `Customer ${customerId.slice(-6)}`;
}

export async function GET(request) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!can(session, PERMISSIONS.REPORTS_VIEW)) {
    return json({ error: 'Your role is not allowed to view reports.' }, 403);
  }
  if (session.role !== ROLES.SUPER_ADMIN) {
    return json({ error: 'Only a Super Admin can view this cross-company report.' }, 403);
  }

  const params = new URL(request.url).searchParams;
  const finYear = params.get('finYear') || '';
  const period = financialYearRange(finYear);
  if (!period) return json({ error: 'Select a valid financial year.' }, 422);

  const assignedLocationIds = (session.locationIds || []).filter(isValidObjectId);
  const hasLocationAssignments = (session.locationIds || []).some(Boolean);
  const allowedLocationIds = hasLocationAssignments
    ? assignedLocationIds.map((id) => new Types.ObjectId(id))
    : null;
  const baseScope = { allowedLocationIds };
  const mode = params.get('mode') || 'summary';

  if (mode === 'summary') {
    await dbConnect();
    const [sales, locations, businesses] = await Promise.all([
      aggregateCustomerSales(invoiceMatch({
        allowedLocationIds,
        finYear,
        fromDate: period.fromDate,
        toDate: period.toDate,
      })),
      CompanyLocation.find({
        ...(allowedLocationIds ? { _id: { $in: allowedLocationIds } } : {}),
      }).select('_id name businessId').sort({ name: 1 }).lean(),
      Business.find({}).select('_id name businessPrintName').lean(),
    ]);
    const customerRefs = customerRefsFrom(sales);
    const firstDates = await firstPurchaseDates({ ...baseScope, customerRefs });
    const visibleBusinessIds = new Set(locations.map((location) => String(location.businessId || '')));
    const visibleBusinesses = allowedLocationIds
      ? businesses.filter((business) => visibleBusinessIds.has(String(business._id)))
      : businesses;
    return json({
      ...summaryResponse({
        rows: sales,
        firstDates,
        locations,
        businesses: visibleBusinesses,
        fromDate: period.fromDate,
        toDate: period.toDate,
      }),
      finYear,
    });
  }

  if (mode !== 'statement') return json({ error: 'Invalid report mode.' }, 422);

  const fromDate = parseDate(params.get('fromDate'));
  const toDate = parseDate(params.get('toDate'), true);
  if (!fromDate || !toDate) return json({ error: 'Select valid Date From and Date To values.' }, 422);
  if (fromDate > toDate) return json({ error: 'Date From must be on or before Date To.' }, 422);

  await dbConnect();
  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const perPage = Math.min(100, Math.max(1, Number.parseInt(params.get('perPage') || '25', 10) || 25));
  const [grouped] = await PosInvoice.aggregate([
    { $match: invoiceMatch({ allowedLocationIds, finYear, fromDate, toDate }) },
    {
      $addFields: {
        reportDate: { $ifNull: ['$date', '$createdAt'] },
        snapshotName: {
          $ifNull: [
            '$customerSnapshot.businessName',
            { $ifNull: ['$customerSnapshot.name', { $ifNull: ['$customerName', ''] }] },
          ],
        },
      },
    },
    {
      $group: {
        _id: { businessId: '$businessId', locationId: '$locationId', customerId: '$customerId' },
        invoiceCount: { $sum: 1 },
        value: {
          $sum: {
            $convert: {
              input: { $ifNull: ['$totalAmount', 0] },
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
        },
        snapshotName: { $max: '$snapshotName' },
        lastPurchaseAt: { $max: '$reportDate' },
      },
    },
    { $sort: { value: -1, '_id.customerId': 1 } },
    {
      $facet: {
        rows: [{ $skip: (page - 1) * perPage }, { $limit: perPage }],
        total: [{ $count: 'count' }],
      },
    },
  ]);
  const detailRows = grouped?.rows || [];
  const total = grouped?.total?.[0]?.count || 0;
  const customerRefs = customerRefsFrom(detailRows);
  const customerIds = [...new Set(customerRefs.map((ref) => ref.customerId))]
    .map((id) => new Types.ObjectId(id));
  const businessIds = [...new Set(customerRefs.map((ref) => ref.businessId))]
    .map((id) => new Types.ObjectId(id));
  const [firstDates, customers, locations, businesses] = await Promise.all([
    firstPurchaseDates({ ...baseScope, customerRefs }),
    customerIds.length
      ? Customer.find({ businessId: { $in: businessIds }, _id: { $in: customerIds } })
        .select('_id businessId businessName prefix firstName middleName lastName')
        .lean()
      : [],
    CompanyLocation.find({
      ...(allowedLocationIds ? { _id: { $in: allowedLocationIds } } : {}),
    }).select('_id name businessId').lean(),
    Business.find({}).select('_id name businessPrintName').lean(),
  ]);
  const customerById = new Map(customers.map((customer) => [
    customerKey(String(customer.businessId), String(customer._id)),
    customer,
  ]));
  const locationById = new Map(locations.map((location) => [String(location._id), location]));
  const businessNames = new Map(businesses.map((business) => [
    String(business._id),
    String(business.businessPrintName || business.name || '').trim(),
  ]));

  return json({
    rows: detailRows.map((row) => {
      const businessId = String(row._id.businessId);
      const customerId = String(row._id.customerId);
      const firstPurchaseAt = firstDates.get(customerKey(businessId, customerId)) || null;
      const location = locationById.get(String(row._id.locationId || ''));
      const locationName = String(location?.name || '').trim();
      const companyName = businessNames.get(businessId) || '';
      return {
        key: `${businessId}-${customerId}-${String(row._id.locationId || 'unassigned')}`,
        customer: customerName(customerById.get(customerKey(businessId, customerId)), String(row.snapshotName || '').trim(), customerId),
        location: [companyName, locationName].filter(Boolean).join(' — ') || `Unassigned — ${companyName || 'Unknown business'}`,
        type: categoryFor(businessId, customerId, firstDates, fromDate, toDate) === 'new' ? 'New customer' : 'Repeat customer',
        invoiceCount: Number(row.invoiceCount) || 0,
        value: Math.round((Number(row.value) || 0) * 100) / 100,
        firstPurchaseAt,
        lastPurchaseAt: row.lastPurchaseAt || null,
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}
