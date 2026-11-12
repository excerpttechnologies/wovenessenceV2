import dbConnect from '@/lib/db';
import { Customer } from '@/lib/contacts';
import { isValidObjectId } from 'mongoose';
import { requireSession } from '@/lib/session';
import { json } from '@/lib/reports';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const business = sp.get('business') || '';
  const q = (sp.get('q') || '').trim();
  const requestedLimit = Number(sp.get('limit') || 25);
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(50, requestedLimit)
    : 25;
  if (!isValidObjectId(business)) return json({ error: 'A valid company is required.' }, 400);

  const denied = await screenDenial({
    session,
    screen: SCREENS.CUSTOMER_REPORT,
    label: 'the customer report',
    action: PERM.READ,
    businessId: business,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);
  if (q.length < 2) return json([]);

  try {
    await dbConnect();
    const expression = { $regex: escapeRegex(q), $options: 'i' };
    const rows = await Customer.find({
      businessId: business,
      contactKind: 'Customer',
      $or: [
        { businessName: expression },
        { firstName: expression },
        { middleName: expression },
        { lastName: expression },
        { shortName: expression },
        { contactId: expression },
        { billingMobile: expression },
        { billingAlternateContactNumber: expression },
      ],
    })
      .select('_id businessName shortName contactId firstName middleName lastName billingMobile')
      .sort({ businessName: 1, _id: 1 })
      .limit(limit)
      .lean();

    return json(rows.map((customer) => ({
        id: String(customer._id),
        name: customer.businessName
          || [customer.firstName, customer.middleName, customer.lastName].filter(Boolean).join(' '),
        code: customer.shortName || '',
        contactId: customer.contactId || '',
        mobile: customer.billingMobile || '',
      })));
  } catch (error) {
    console.error('Customer report search failed:', error);
    return json({ error: 'Unable to search customers.' }, 500);
  }
}
