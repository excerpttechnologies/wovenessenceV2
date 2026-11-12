import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { json } from '@/lib/reports';
import SalesInvoice from '@/models/SalesInvoice';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import {
  billPipeline,
  customerInBusiness,
  locationNames,
  reportRequest,
} from '../shared';

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const scope = reportRequest(sp);
  if (scope.error) return json({ error: scope.error }, scope.status);

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

    const [result] = await SalesInvoice.aggregate([
      ...billPipeline(scope),
      { $sort: { date: 1, _id: 1, source: 1 } },
      {
        $group: {
          _id: null,
          first: { $first: { date: '$date', locationId: '$locationId' } },
          last: { $last: { date: '$date', locationId: '$locationId' } },
          totalSaleTillDate: { $sum: { $ifNull: ['$billValue', 0] } },
        },
      },
    ]);

    const points = [result?.first, result?.last].filter(Boolean);
    const names = await locationNames(points);
    const fullName = [customer.prefix, customer.firstName, customer.middleName, customer.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return json({
      customerName: customer.businessName || fullName,
      mobile: customer.billingMobile || '',
      contactId: customer.contactId || '',
      state: customer.billingState || '',
      gstin: customer.gstNo || '',
      firstSaleDate: result?.first?.date || null,
      firstSaleLocation: names.get(String(result?.first?.locationId || '')) || '',
      lastVisitDate: result?.last?.date || null,
      lastVisitLocation: names.get(String(result?.last?.locationId || '')) || '',
      totalSaleTillDate: Math.round((Number(result?.totalSaleTillDate) || 0) * 100) / 100,
    });
  } catch (error) {
    console.error('Customer report summary failed:', error);
    return json({ error: 'Unable to load customer summary.' }, 500);
  }
}
