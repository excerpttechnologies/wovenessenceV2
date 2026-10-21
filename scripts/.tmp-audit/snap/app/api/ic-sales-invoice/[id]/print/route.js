import dbConnect from '@/lib/db';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import { requireSession } from '@/lib/session';

/* /api/ic-sales-invoice/<id>/print

   Everything the Tax Invoice needs, joined in one call: the invoice, the
   issuing business and location (letterhead) and the destination business
   (buyer block).

   The buyer's own details were copied onto the invoice when it was issued.
   They are read back from the destination business here only to fill the
   address lines a stored string can't carry separately; the GSTIN and name
   fall back to what was stored, so a renamed business never rewrites an
   issued document. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const inv = await IcSalesInvoice.findById(id).lean();
  if (!inv) return json({ error: 'Not found' }, 404);

  const [seller, sellerLoc, buyer] = await Promise.all([
    inv.businessId ? Business.findById(inv.businessId).lean() : null,
    inv.locationId ? CompanyLocation.findById(inv.locationId).lean() : null,
    inv.toBusinessId ? Business.findById(inv.toBusinessId).lean() : null,
  ]);

  return json({
    seller: seller && {
      name: seller.name,
      printName: seller.businessPrintName || seller.name,
      locationName: sellerLoc?.name || '',
      addressLine1: sellerLoc?.addressLine1 || seller.addressLine1,
      addressLine2: sellerLoc?.addressLine2 || seller.addressLine2,
      city: sellerLoc?.city || seller.city,
      state: sellerLoc?.state || seller.state,
      zipCode: sellerLoc?.zipCode || seller.zipCode,
      mobile: sellerLoc?.mobile || seller.mobile,
      gstin: sellerLoc?.gstin || seller.gstin,
    },
    buyer: {
      /* stored values win - see the note above */
      name: inv.customerName || buyer?.name || '',
      gstin: inv.customerGstn || buyer?.gstin || '',
      addressLine1: buyer?.addressLine1 || inv.customerAddress || '',
      addressLine2: buyer?.addressLine2 || '',
      city: buyer?.city || '',
      zipCode: buyer?.zipCode || '',
      mobile: buyer?.mobile || '',
    },
    invoice: {
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      irn: inv.irn || '',
      ackNo: inv.ackNo || '',
      ackDate: inv.ackDate || null,
      qrCode: inv.qrCode || '',
    },
    items: Array.isArray(inv.items) ? inv.items : [],
  });
}
