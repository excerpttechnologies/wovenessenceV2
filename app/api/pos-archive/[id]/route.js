import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import { Customer } from '@/lib/contacts';
import PosCounter from '@/models/PosCounter';
import SalesPerson from '@/models/SalesPerson';
import { requireSession } from '@/lib/session';

/* GET /api/pos-archive/<id>  (21-10-2026)

   One archived (deleted) POS bill, in the SAME shape as GET /api/sell-pos/<id>
   so the existing View screen (components/PosInvoiceView.jsx) shows it as
   it is - pointed here by its `endpoint` prop. Adds archivedAt / archivedBy.
   Read-only. Any logged-in user. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ doc: null }, 404);
  await dbConnect();

  const doc = await mongoose.connection.db.collection('posinvoicearchive').findOne({ _id: new Types.ObjectId(id) });
  if (!doc) return json({ doc: null }, 404);

  const [business, location, customer, counter] = await Promise.all([
    doc.businessId ? Business.findById(doc.businessId).lean() : null,
    doc.locationId ? CompanyLocation.findById(doc.locationId).lean() : null,
    doc.customerId ? Customer.findById(doc.customerId).lean() : null,
    doc.counterId ? PosCounter.findById(doc.counterId).lean() : null,
  ]);
  const spIds = [...new Set((doc.items || []).map((l) => String(l.salesPerson || '')).filter(isValidObjectId))];
  const salesPeople = spIds.length ? await SalesPerson.find({ _id: { $in: spIds } }).select('_id name').lean() : [];
  const spName = new Map(salesPeople.map((p) => [String(p._id), p.name || '']));
  const items = (doc.items || []).map((l) => ({ ...l, salesPersonName: spName.get(String(l.salesPerson || '')) || '' }));
  const salesPersonNames = [...new Set(items.map((l) => l.salesPersonName).filter(Boolean))];

  const customerData = customer || doc.customerSnapshot || null;
  const customerName = customerData
    ? customerData.businessName || [customerData.firstName, customerData.middleName, customerData.lastName].filter(Boolean).join(' ')
    : 'Walk-in Customer';

  return json({ doc: {
    ...doc,
    _id: String(doc._id),
    businessName: business?.name || business?.businessPrintName || '',
    locationName: location?.name || location?.businessPrintName || '',
    customerName,
    customerEmail: customerData?.billingEmail || '',
    customerContact: doc.customerContact || customerData?.billingMobile || '',
    customerAddress: customerData ? [customerData.billingAddressLine1, customerData.billingCity, customerData.billingDistrict, customerData.billingTaluk, customerData.billingState, customerData.billingCountry, customerData.billingZipCode].filter(Boolean).join(', ') : '',
    counterName: counter?.counterName || '',
    seller: {
      name: location?.businessPrintName || location?.name || business?.businessPrintName || business?.name || '',
      addressLine1: location?.addressLine1 || business?.addressLine1 || '',
      addressLine2: location?.addressLine2 || business?.addressLine2 || '',
      landmark: location?.landmark || '',
      city: location?.city || business?.city || '',
      state: location?.state || business?.state || '',
      zipCode: location?.zipCode || business?.zipCode || '',
      mobile: location?.mobile || business?.mobile || '',
      alternate: location?.alternateContactNumber || '',
      email: location?.email || business?.email || '',
      gstin: location?.gstin || business?.gstin || '',
      terms: location?.termsAndConditions || '',
    },
    customerGstn: customerData?.gstNo || '',
    items,
    salesPersonName: salesPersonNames.join(', '),
    status: 'ARCHIVED',
    archivedAt: doc.archivedAt || null,
    archivedByName: doc.archivedBy?.name || doc.archivedBy?.email || '',
  } });
}
