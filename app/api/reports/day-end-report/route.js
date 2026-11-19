import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { can, PERMISSIONS, canUseLocation } from '@/lib/rbac';
import CompanyLocation from '@/models/CompanyLocation';
import Business from '@/models/Business';
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
  return new Date(Date.UTC(year, month - 1, day, 0, endMinutes - indiaOffsetMinutes, endOfDay ? 59 : 0, endOfDay ? 999 : 0));
}

// export async function GET(request) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);
//   if (!can(session, PERMISSIONS.REPORTS_VIEW)) {
//     return json({ error: 'Your role is not allowed to view reports.' }, 403);
//   }
//   if (session.role !== ROLES.SUPER_ADMIN) {
//     return json({ error: 'Only a Super Admin can view this report.' }, 403);
//   }

//   const params = new URL(request.url).searchParams;
//   const locationId = params.get('locationId') || 'all';
//   const fromDate = parseDate(params.get('dateFrom'));
//   const toDate = parseDate(params.get('dateTo'), true);

//   if (locationId !== 'all' && !isValidObjectId(locationId)) {
//     return json({ error: 'Select a valid business location.' }, 422);
//   }
//   if (locationId !== 'all' && !canUseLocation(session, locationId)) {
//     return json({ error: 'Your account is not assigned to that location.' }, 403);
//   }
//   if (!fromDate || !toDate) return json({ error: 'Date From and Date To are required.' }, 422);
//   if (fromDate > toDate) return json({ error: 'Date From must be on or before Date To.' }, 422);

//   await dbConnect();

//   const assignedLocationIds = (session.locationIds || [])
//     .filter((id) => isValidObjectId(id))
//     .map((id) => new Types.ObjectId(id));
//   const invoiceFilter = {
//     businessId: { $type: 'objectId' },
//     ...cancelledDocuments,
//   };
//   if (params.get('finYear')) invoiceFilter.finYear = params.get('finYear');
//   if (locationId !== 'all') {
//     const location = await CompanyLocation.findById(new Types.ObjectId(locationId)).select('_id').lean();
//     if (!location) return json({ error: 'The selected business location was not found.' }, 422);
//     invoiceFilter.locationId = location._id;
//   } else if (assignedLocationIds.length) {
//     invoiceFilter.locationId = { $in: assignedLocationIds };
//   }

//   const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
//   const pageSize = Math.min(100, Math.max(1, Number.parseInt(params.get('pageSize') || '15', 10) || 15));
//   const [aggregation, allLocations, businesses] = await Promise.all([
//     PosInvoice.aggregate([
//       { $match: invoiceFilter },
//       { $addFields: { reportDate: { $ifNull: ['$date', '$createdAt'] } } },
//       {
//         $match: {
//           $expr: {
//             $and: [
//               { $gte: ['$reportDate', fromDate] },
//               { $lte: ['$reportDate', toDate] },
//             ],
//           },
//         },
//       },
//       {
//         $group: {
//           _id: {
//             date: {
//               $dateToString: {
//                 format: '%Y-%m-%d',
//                 date: '$reportDate',
//                 timezone: 'Asia/Kolkata',
//               },
//             },
//             businessId: '$businessId',
//             locationId: { $ifNull: ['$locationId', null] },
//           },
//           invoiceCount: { $sum: 1 },
//           totalSales: {
//             $sum: {
//               $convert: {
//                 input: { $ifNull: ['$totalAmount', 0] },
//                 to: 'double',
//                 onError: 0,
//                 onNull: 0,
//               },
//             },
//           },
//         },
//       },
//       { $sort: { '_id.date': -1, '_id.locationId': 1 } },
//       {
//         $facet: {
//           rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
//           total: [{ $count: 'count' }],
//         },
//       },
//     ]),
//     CompanyLocation.find({
//       ...(assignedLocationIds.length ? { _id: { $in: assignedLocationIds } } : {}),
//     }).select('_id name businessId').sort({ name: 1 }).lean(),
//     Business.find({}).select('_id name businessPrintName').lean(),
//   ]);

//   const grouped = aggregation[0] || {};
//   const registers = grouped.rows || [];
//   const total = grouped.total?.[0]?.count || 0;
//   const locationsById = new Map(allLocations.map((item) => [String(item._id), item]));
//   const businessesById = new Map(businesses.map((item) => [
//     String(item._id),
//     String(item.businessPrintName || item.name || '').trim(),
//   ]));

//   return json({
//     rows: registers.map((row) => {
//       const locationKey = String(row._id.locationId || '');
//       const locationRecord = locationsById.get(locationKey);
//       const locationName = String(locationRecord?.name || '').trim();
//       const businessName = businessesById.get(String(row._id.businessId || '')) || '';
//       return {
//         _id: `${row._id.date}-${String(row._id.businessId || 'unknown')}-${locationKey || 'unassigned'}`,
//         businessId: String(row._id.businessId || ''),
//         locationId: locationKey || 'unassigned',
//         date: row._id.date,
//         location: [
//           businessName,
//           locationName || 'Unassigned',
//         ].filter(Boolean).join(' — ') || 'Unassigned',
//         invoiceCount: Number(row.invoiceCount) || 0,
//         totalSales: Math.round((Number(row.totalSales) || 0) * 100) / 100,
//       };
//     }),
//     locations: allLocations.map((item) => {
//       const businessName = businessesById.get(String(item.businessId || '')) || '';
//       return {
//         value: String(item._id),
//         label: [
//           businessName,
//           String(item.name || '').trim() || 'Unnamed location',
//         ].filter(Boolean).join(' — '),
//       };
//     }),
//     total,
//     page,
//     pages: Math.max(1, Math.ceil(total / pageSize)),
//     pageSize,
//   });
// }



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
  const locationId = params.get('locationId') || 'all';
  const fromDate = parseDate(params.get('dateFrom'));
  const toDate = parseDate(params.get('dateTo'), true);

  if (locationId !== 'all' && !isValidObjectId(locationId)) {
    return json({ error: 'Select a valid business location.' }, 422);
  }
  if (locationId !== 'all' && !canUseLocation(session, locationId)) {
    return json({ error: 'Your account is not assigned to that location.' }, 403);
  }
  if (!fromDate || !toDate) return json({ error: 'Date From and Date To are required.' }, 422);
  if (fromDate > toDate) return json({ error: 'Date From must be on or before Date To.' }, 422);

  await dbConnect();

  const assignedLocationIds = (session.locationIds || [])
    .filter((id) => isValidObjectId(id))
    .map((id) => new Types.ObjectId(id));
  const invoiceFilter = {
    businessId: { $type: 'objectId' },
    ...cancelledDocuments,
  };
  if (params.get('finYear')) invoiceFilter.finYear = params.get('finYear');
  if (locationId !== 'all') {
    const location = await CompanyLocation.findById(new Types.ObjectId(locationId)).select('_id').lean();
    if (!location) return json({ error: 'The selected business location was not found.' }, 422);
    invoiceFilter.locationId = location._id;
  } else if (assignedLocationIds.length) {
    invoiceFilter.locationId = { $in: assignedLocationIds };
  }

  const page = Math.max(1, Number.parseInt(params.get('page') || '1', 10) || 1);
  const pageSize = Math.min(100, Math.max(1, Number.parseInt(params.get('pageSize') || '15', 10) || 15));
  const [aggregation, allLocations, businesses] = await Promise.all([
    PosInvoice.aggregate([
      { $match: invoiceFilter },
      { $addFields: { reportDate: { $ifNull: ['$date', '$createdAt'] } } },
      {
        $match: {
          $expr: {
            $and: [
              { $gte: ['$reportDate', fromDate] },
              { $lte: ['$reportDate', toDate] },
            ],
          },
        },
      },
      {
        $group: {
          _id: {
            date: {
              $dateToString: {
                format: '%Y-%m-%d',
                date: '$reportDate',
                timezone: 'Asia/Kolkata',
              },
            },
            businessId: '$businessId',
            locationId: { $ifNull: ['$locationId', null] },
          },
          invoiceCount: { $sum: 1 },
          totalSales: {
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
      { $sort: { '_id.date': -1, '_id.locationId': 1 } },
      {
        $facet: {
          rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
          total: [{ $count: 'count' }],
        },
      },
    ]),
    CompanyLocation.find({
      ...(assignedLocationIds.length ? { _id: { $in: assignedLocationIds } } : {}),
    }).select('_id name businessId').sort({ name: 1 }).lean(),
    Business.find({}).select('_id name businessPrintName').lean(),
  ]);

  const grouped = aggregation[0] || {};
  const registers = grouped.rows || [];
  const total = grouped.total?.[0]?.count || 0;
  const locationsById = new Map(allLocations.map((item) => [String(item._id), item]));
  const businessesById = new Map(businesses.map((item) => [
    String(item._id),
    String(item.businessPrintName || item.name || '').trim(),
  ]));

  return json({
    rows: registers.map((row) => {
      const locationKey = String(row._id.locationId || '');
      const locationRecord = locationsById.get(locationKey);
      const locationName = String(locationRecord?.name || '').trim();
      const businessName = businessesById.get(String(row._id.businessId || '')) || '';
      return {
        _id: `${row._id.date}-${String(row._id.businessId || 'unknown')}-${locationKey || 'unassigned'}`,
        businessId: String(row._id.businessId || ''),
        locationId: locationKey || 'unassigned',
        date: row._id.date,
        location: [
          businessName,
          locationName || 'Unassigned',
        ].filter(Boolean).join(' — ') || 'Unassigned',
        invoiceCount: Number(row.invoiceCount) || 0,
        totalSales: Math.round((Number(row.totalSales) || 0) * 100) / 100,
      };
    }),
    locations: allLocations.map((item) => {
      const businessName = businessesById.get(String(item.businessId || '')) || '';
      return {
        value: String(item._id),
        label: [
          businessName,
          String(item.name || '').trim() || 'Unnamed location',
        ].filter(Boolean).join(' — '),
      };
    }),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
  });
}
