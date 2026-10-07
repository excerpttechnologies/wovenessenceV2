import dbConnect from '@/lib/db';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import Contact from '@/models/Contact';
import PurchaseTerm from '@/models/PurchaseTerm';
import { requireSession } from '@/lib/session';

/* /api/purchase-invoice/<id>/print

   Everything the printable invoice needs in one call: the invoice, the
   buying business and location (letterhead) and the supplier (From block).
   Same shape and reasoning as /api/purchase-grc/<id>/print. */

const json = (d, s = 200) => Response.json(d, { status: s });
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const inv = await PurchaseInvoice.findById(id).lean();
  if (!inv) return json({ error: 'Not found' }, 404);

  const [business, location, supplier, term] = await Promise.all([
    inv.businessId ? Business.findById(inv.businessId).lean() : null,
    inv.locationId ? CompanyLocation.findById(inv.locationId).lean() : null,
    inv.supplierId ? Contact.findById(inv.supplierId).lean() : null,
    inv.purchaseTermId ? PurchaseTerm.findById(inv.purchaseTermId).lean() : null,
  ]);

  const items = Array.isArray(inv.items) ? inv.items : [];

  return json({
    business: business && {
      name: business.name,
      printName: business.businessPrintName || business.name,
      /* the location's own address wins where it has one - an invoice is
         received at a branch, not at the head office */
      locationName: location?.name || '',
      addressLine1: location?.addressLine1 || business.addressLine1,
      addressLine2: location?.addressLine2 || business.addressLine2,
      city: location?.city || business.city,
      state: location?.state || business.state,
      zipCode: location?.zipCode || business.zipCode,
      mobile: location?.mobile || business.mobile,
      gstin: location?.gstin || business.gstin,
    },
    supplier: supplier && {
      name: supplier.businessName
        || [supplier.firstName, supplier.lastName].filter(Boolean).join(' '),
      contactId: supplier.contactId || '',
      addressLine1: supplier.billingAddressLine1 || '',
      addressLine2: supplier.billingAddressLine2 || '',
      city: supplier.billingCity || '',
      state: supplier.billingState || '',
      zipCode: supplier.billingZipCode || '',
      mobile: supplier.billingMobile || '',
      gstin: supplier.gstNo || inv.vendorGstNo || '',
    },
    invoice: {
      purchaseInvoiceNo: inv.purchaseInvoiceNo || '',
      purchaseDate: inv.purchaseDate || null,
      grcNumber: inv.grcNumber || '',
      grcDate: inv.grcDate || null,
      vendorDocNo: inv.vendorDocNo || '',
      vendorDocDate: inv.vendorDocDate || null,
      purchaseTerm: term?.name || '',
      occasion: inv.occasion || '',
      finYear: inv.finYear || '',
    },
    items,
    totals: {
      taxableValue: num(inv.taxableValue),
      discountPercent: num(inv.discountPercent),
      roundOffDiscount: num(inv.roundOffDiscount),
      igstTotal: num(inv.igstTotal),
      cgstTotal: num(inv.cgstTotal),
      sgstTotal: num(inv.sgstTotal),
      freightBeforeGst: num(inv.freightBeforeGst),
      roundOff: num(inv.roundOff),
      totalQuantity: num(inv.totalQuantity) || items.reduce((a, r) => a + num(r.qty), 0),
      netPurchaseAmt: num(inv.netPurchaseAmt) || num(inv.totalPayable),
    },
  });
}
