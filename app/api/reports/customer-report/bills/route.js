import dbConnect from '@/lib/db';
import SalesInvoice from '@/models/SalesInvoice';
import { requireSession } from '@/lib/session';
import { json } from '@/lib/reports';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { billPipeline, customerInBusiness, locationNames, reportRequest } from '../shared';

const parsePage = (sp) => {
  const page = Number(sp.get('page') || 1);
  const pageSize = Number(sp.get('pageSize') || 15);
  return Number.isInteger(page) && page > 0 && Number.isInteger(pageSize) && pageSize > 0
    ? { page, pageSize: Math.min(pageSize, 50) }
    : null;
};

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const scope = reportRequest(sp);
  if (scope.error) return json({ error: scope.error }, scope.status);
  const paging = parsePage(sp);
  if (!paging) return json({ error: 'Invalid pagination values.' }, 400);

  const denied = await screenDenial({
    session,
    screen: SCREENS.CUSTOMER_REPORT,
    label: 'the customer report',
    action: PERM.READ,
    businessId: String(scope.businessId),
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  try {
    await dbConnect();
    const customer = await customerInBusiness(scope.customerId, scope.businessId);
    if (!customer) return json({ error: 'Customer not found.' }, 404);

    const offset = (paging.page - 1) * paging.pageSize;
    const [result] = await SalesInvoice.aggregate([
      ...billPipeline(scope),
      {
        $facet: {
          records: [
            { $sort: { date: -1, _id: -1, source: 1 } },
            { $skip: offset },
            { $limit: paging.pageSize },
          ],
          totals: [{
            $group: {
              _id: null,
              billValue: { $sum: '$billValue' },
              taxableValue: { $sum: '$taxableValue' },
              tax: { $sum: '$tax' },
            },
          }],
          count: [{ $count: 'totalRecords' }],
        },
      },
    ]);

    const records = result?.records || [];
    const names = await locationNames(records);
    const totalRecords = result?.count?.[0]?.totalRecords || 0;
    const totals = result?.totals?.[0] || {};
    return json({
      records: records.map((row) => ({
        id: `${row.source}:${row._id}`,
        location: names.get(String(row.locationId || '')) || '',
        invNo: row.invNo || '',
        date: row.date || null,
        billValue: Number(row.billValue) || 0,
        taxableValue: Number(row.taxableValue) || 0,
        tax: Number(row.tax) || 0,
      })),
      totalRecords,
      totalPages: Math.ceil(totalRecords / paging.pageSize),
      page: paging.page,
      pageSize: paging.pageSize,
      totals: {
        billValue: Number(totals.billValue) || 0,
        taxableValue: Number(totals.taxableValue) || 0,
        tax: Number(totals.tax) || 0,
      },
    });
  } catch (error) {
    console.error('Customer bill report failed:', error);
    return json({ error: 'Unable to load customer bills.' }, 500);
  }
}
