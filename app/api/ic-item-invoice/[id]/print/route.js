import QRCode from 'qrcode';
import dbConnect from '@/lib/db';
import IcItemInvoice from '@/models/IcItemInvoice';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/ic-item-invoice/<id>/print

   Everything the printed Tax Invoice needs, joined in one call: the
   consignment invoice, the SENDER's letterhead (business + location) and
   the RECEIVER as the buyer block. Same payload shape as
   /api/ic-sales-invoice/<id>/print, so components/IcTaxInvoiceView.jsx
   renders both without knowing which flow an invoice came from. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const inv = await IcItemInvoice.findById(id).lean();
  if (!inv) return json({ error: 'Not found' }, 404);

  const denied = await screenDenial({
    session,
    screen: SCREENS.IC_ITEM_INVOICE,
    label: 'inter company sales invoices',
    action: PERM.READ,
    businessId: inv.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

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
      /* the name was copied onto the invoice at issue time and wins, so a
         renamed business never rewrites an issued document */
      name: inv.toBusinessName || buyer?.name || '',
      gstin: buyer?.gstin || '',
      addressLine1: buyer?.addressLine1 || '',
      addressLine2: buyer?.addressLine2 || '',
      city: buyer?.city || '',
      zipCode: buyer?.zipCode || '',
      mobile: buyer?.mobile || '',
    },
    /* the IRN block is filled only for the e-Invoice print (?einv=1) and
       only once an IRN is GENERATED (lib/einvoice); the plain Print keeps
       printing exactly as before - the e-invoice lines simply do not
       render when these are empty */
    invoice: {
      invoiceNo: inv.invoiceNo,
      invoiceDate: inv.invoiceDate,
      ...(await irnBlock(req, inv)),
    },
    items: Array.isArray(inv.items) ? inv.items : [],
  });
}

async function irnBlock(req, inv) {
  const blank = { irn: '', ackNo: '', ackDate: null, qrCode: '' };
  if (new URL(req.url).searchParams.get('einv') !== '1') return blank;

  /* raw read - see app/api/ic-item-invoice/[id]/einvoice/route.js */
  const raw = await IcItemInvoice.collection.findOne({ _id: inv._id }, { projection: { einvoice: 1 } });
  const e = raw?.einvoice;
  const state = { einvoiceStatus: e?.status || '', einvoiceMode: e?.mode || '' };
  if (!e || e.status !== 'GENERATED') return { ...blank, ...state };

  /* the IRP's signed QR string drawn as an image - error level M is what
     printed e-invoices commonly use */
  const qrCode = e.signedQrCode
    ? await QRCode.toDataURL(e.signedQrCode, { errorCorrectionLevel: 'M', margin: 1, width: 220 }).catch(() => '')
    : '';
  return {
    irn: e.irn || '',
    ackNo: e.ackNo || '',
    ackDate: e.ackDate || null,
    qrCode,
    ...state,
  };
}
