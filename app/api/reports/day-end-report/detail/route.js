import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { can, PERMISSIONS, canUseLocation } from '@/lib/rbac';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
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

function parseDate(value, endOfDay = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const [year, month, day] = value.split('-').map(Number);
  const dateCheck = new Date(Date.UTC(year, month - 1, day));
  if (
    Number.isNaN(dateCheck.getTime())
    || dateCheck.getUTCFullYear() !== year
    || dateCheck.getUTCMonth() !== month - 1
    || dateCheck.getUTCDate() !== day
  ) return null;

  const indiaOffsetMinutes = 330;
  const endMinutes = endOfDay ? 24 * 60 - 1 : 0;
  return new Date(Date.UTC(
    year,
    month - 1,
    day,
    0,
    endMinutes - indiaOffsetMinutes,
    endOfDay ? 59 : 0,
    endOfDay ? 999 : 0
  ));
}

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function customerName(invoice) {
  const snapshot = invoice.customerSnapshot || {};
  const personName = [
    snapshot.prefix,
    snapshot.firstName,
    snapshot.middleName,
    snapshot.lastName,
  ].filter(Boolean).join(' ').trim();
  return String(
    snapshot.businessName
    || personName
    || snapshot.name
    || invoice.customerName
    || 'Walk-in Customer'
  ).trim();
}

export async function GET(request) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  if (!can(session, PERMISSIONS.REPORTS_VIEW)) {
    return json({ error: 'Your role is not allowed to view reports.' }, 403);
  }
  if (session.role !== ROLES.SUPER_ADMIN) {
    return json({ error: 'Only a Super Admin can view this report.' }, 403);
  }

  const params = new URL(request.url).searchParams;
  const businessId = params.get('businessId') || '';
  const locationId = params.get('locationId') || '';
  const date = params.get('date') || '';
  const fromDate = parseDate(date);
  const toDate = parseDate(date, true);

  if (!isValidObjectId(businessId)) return json({ error: 'The report business is invalid.' }, 422);
  if (locationId !== 'unassigned' && !isValidObjectId(locationId)) {
    return json({ error: 'The report location is invalid.' }, 422);
  }
  if (locationId !== 'unassigned' && !canUseLocation(session, locationId)) {
    return json({ error: 'Your account is not assigned to that location.' }, 403);
  }
  if (locationId === 'unassigned' && (session.locationIds || []).some(Boolean)) {
    return json({ error: 'Your account cannot view unassigned-location invoices.' }, 403);
  }
  if (!fromDate || !toDate) return json({ error: 'A valid report date is required.' }, 422);

  await dbConnect();
  const businessObjectId = new Types.ObjectId(businessId);
  const business = await Business.findById(businessObjectId)
    .select('name businessPrintName gstin')
    .lean();
  if (!business) return json({ error: 'The report business was not found.' }, 404);

  let location = null;
  const invoiceFilter = {
    businessId: businessObjectId,
    ...cancelledDocuments,
    ...(params.get('finYear') ? { finYear: params.get('finYear') } : {}),
    $or: [
      { date: { $gte: fromDate, $lte: toDate } },
      { date: null, createdAt: { $gte: fromDate, $lte: toDate } },
    ],
  };
  if (locationId === 'unassigned') {
    invoiceFilter.locationId = { $in: [null] };
  } else {
    location = await CompanyLocation.findOne({
      _id: new Types.ObjectId(locationId),
      businessId: businessObjectId,
    }).select('name gstin').lean();
    if (!location) return json({ error: 'The report location does not belong to this business.' }, 422);
    invoiceFilter.locationId = location._id;
  }

  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(params.get('pageSize') || '25', 10) || 25));
  const [summaryResult, invoices, invoiceCount] = await Promise.all([
    PosInvoice.aggregate([
      { $match: invoiceFilter },
      {
        $addFields: {
          reportPayments: {
            $let: {
              vars: {
                recordedPayments: {
                  $cond: [{ $isArray: '$payments' }, '$payments', []],
                },
              },
              in: {
                $cond: [
                  { $gt: [{ $size: '$$recordedPayments' }, 0] },
                  '$$recordedPayments',
                  [{ method: { $ifNull: ['$billingType', 'Cash'] }, amount: { $ifNull: ['$paid', 0] } }],
                ],
              },
            },
          },
          saleValue: {
            $convert: { input: { $ifNull: ['$totalAmount', 0] }, to: 'double', onError: 0, onNull: 0 },
          },
          paidValue: {
            $convert: { input: { $ifNull: ['$paid', 0] }, to: 'double', onError: 0, onNull: 0 },
          },
          dueValue: {
            $convert: {
              input: {
                $ifNull: [
                  '$sellDue',
                  { $max: [0, { $subtract: [{ $ifNull: ['$totalAmount', 0] }, { $ifNull: ['$paid', 0] }] }] },
                ],
              },
              to: 'double',
              onError: 0,
              onNull: 0,
            },
          },
          invoiceStatus: {
            $switch: {
              branches: [
                { case: { $eq: [{ $toLower: { $ifNull: ['$paymentStatus', ''] } }, 'paid'] }, then: 'Paid' },
                { case: { $eq: [{ $toLower: { $ifNull: ['$paymentStatus', ''] } }, 'part paid'] }, then: 'Part Paid' },
                { case: { $eq: [{ $toLower: { $ifNull: ['$paymentStatus', ''] } }, 'unpaid'] }, then: 'Unpaid' },
              ],
              default: {
                $cond: [
                  { $gt: [{ $ifNull: ['$paid', 0] }, 0] },
                  {
                    $cond: [
                      { $gte: [{ $ifNull: ['$paid', 0] }, { $ifNull: ['$totalAmount', 0] }] },
                      'Paid',
                      'Part Paid',
                    ],
                  },
                  'Unpaid',
                ],
              },
            },
          },
        },
      },
      {
        $facet: {
          totals: [{
            $group: {
              _id: null,
              invoiceCount: { $sum: 1 },
              totalSales: { $sum: '$saleValue' },
              totalPaid: { $sum: '$paidValue' },
              totalDue: { $sum: '$dueValue' },
            },
          }],
          paymentMethods: [
            { $unwind: '$reportPayments' },
            {
              $addFields: {
                paymentAmount: {
                  $convert: {
                    input: { $ifNull: ['$reportPayments.amount', 0] },
                    to: 'double',
                    onError: 0,
                    onNull: 0,
                  },
                },
                paymentMethod: {
                  $ifNull: [{ $trim: { input: { $ifNull: ['$reportPayments.method', ''] } } }, ''],
                },
              },
            },
            { $match: { paymentAmount: { $gt: 0 } } },
            {
              $group: {
                _id: { $cond: [{ $eq: ['$paymentMethod', ''] }, 'Unspecified', '$paymentMethod'] },
                transactionCount: { $sum: 1 },
                amount: { $sum: '$paymentAmount' },
              },
            },
            { $sort: { amount: -1, _id: 1 } },
          ],
          invoiceStatuses: [
            {
              $group: {
                _id: '$invoiceStatus',
                invoiceCount: { $sum: 1 },
                outstandingDue: { $sum: '$dueValue' },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]),
    PosInvoice.find(invoiceFilter)
      .select('date createdAt invoiceNo customerSnapshot customerName billingType paymentStatus totalAmount paid sellDue')
      .sort({ date: 1, createdAt: 1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .lean(),
    PosInvoice.countDocuments(invoiceFilter),
  ]);

  const summary = summaryResult[0] || {};
  const totals = summary.totals?.[0] || {};
  return json({
    business: String(business.businessPrintName || business.name || '').trim(),
    location: location ? String(location.name || '').trim() : 'Unassigned',
    gstin: String(location?.gstin || business.gstin || '').trim(),
    date,
    totals: {
      invoiceCount: Number(totals.invoiceCount) || 0,
      totalSales: money(totals.totalSales),
      totalPaid: money(totals.totalPaid),
      totalDue: money(totals.totalDue),
    },
    paymentMethods: (summary.paymentMethods || []).map((item) => ({
      method: String(item._id || 'Unspecified'),
      transactionCount: Number(item.transactionCount) || 0,
      amount: money(item.amount),
    })),
    invoiceStatuses: (summary.invoiceStatuses || []).map((item) => ({
      status: String(item._id || 'Unpaid'),
      invoiceCount: Number(item.invoiceCount) || 0,
      outstandingDue: money(item.outstandingDue),
    })),
    invoices: invoices.map((invoice) => {
      const totalAmount = money(invoice.totalAmount);
      const paid = money(invoice.paid);
      const due = invoice.sellDue === undefined || invoice.sellDue === null
        ? money(Math.max(0, totalAmount - paid))
        : money(invoice.sellDue);
      return {
        _id: String(invoice._id),
        date: invoice.date || invoice.createdAt || null,
        invoiceNo: String(invoice.invoiceNo || ''),
        customer: customerName(invoice),
        paymentStatus: String(invoice.paymentStatus || invoice.billingType || 'Unpaid'),
        totalAmount,
        paid,
        due,
      };
    }),
    totalInvoices: invoiceCount,
    page,
    pages: Math.max(1, Math.ceil(invoiceCount / pageSize)),
    pageSize,
  });
}
