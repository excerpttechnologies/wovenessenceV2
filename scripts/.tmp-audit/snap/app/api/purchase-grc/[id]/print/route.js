// import dbConnect from '@/lib/db';
// import Grc from '@/models/Grc';
// import Business from '@/models/Business';
// import Contact from '@/models/Contact';
// import { requireSession } from '@/lib/session';

// /* /api/purchase-grc/<id>/print
//    Everything the printable challan needs, joined in one call: the GRC itself,
//    the receiving business (letterhead) and the supplier (From block). */

// const json = (d, s = 200) => Response.json(d, { status: s });

// export async function GET(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   await dbConnect();

//   const grc = await Grc.findById(id).lean();
//   if (!grc) return json({ error: 'Not found' }, 404);

//   const [business, supplier] = await Promise.all([
//     grc.businessId ? Business.findById(grc.businessId).lean() : null,
//     grc.supplierId ? Contact.findById(grc.supplierId).lean() : null,
//   ]);

//   const line = (r, i) => {
//     const qty = Number(r.qty ?? r.Qty ?? r.Quantity ?? 0);
//     const price = Number(r.finalPrice ?? r['Final Price'] ?? 0);
//     const rsp = Number(r.rsp ?? r.RSP ?? r['RSP Price'] ?? 0);
//     /* amount falls back to qty x price when it wasn't stored */
//     const amount = Number(r.amount ?? r.Amount ?? qty * price);
//     /* gross profit % against RSP, blank when there's no RSP to compare to */
//     const gp = rsp > 0 ? ((rsp - price) / rsp) * 100 : null;

//     return {
//       sn: i + 1,
//       itemName: r.itemName ?? r['Item Name'] ?? '',
//       batchNo: r.batchNo ?? r.BatchNO ?? r['Item Code'] ?? '',
//       uom: r.uom ?? 'Pc(s)',
//       qty, price, amount, rsp,
//       gp: gp === null ? null : Number(gp.toFixed(2)),
//     };
//   };

//   const items = (Array.isArray(grc.items) ? grc.items : []).map(line);

//   return json({
//     business: business && {
//       name: business.name,
//       printName: business.businessPrintName || business.name,
//       addressLine1: business.addressLine1,
//       city: business.city,
//       state: business.state,
//       zipCode: business.zipCode,
//       mobile: business.mobile,
//       gstin: business.gstin,
//     },
//     supplier: supplier && {
//       name: supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' '),
//       city: supplier.billingCity,
//       addressLine1: supplier.billingAddressLine1,
//       addressLine2: supplier.billingAddressLine2,
//       zipCode: supplier.billingZipCode,
//       mobile: supplier.billingMobile,
//       gstin: supplier.gstNo,
//     },
//     grc: {
//       grcNumber: grc.grcNumber,
//       grcDate: grc.grcDate,
//       vendorDocNo: grc.vendorDocNo,
//       vendorDocDate: grc.vendorDocDate || null,
//       lrNo: grc.lrNo || '',
//       lrDate: grc.lrDate || null,
//     },
//     items,
//     totals: {
//       qty: Number(items.reduce((a, r) => a + r.qty, 0).toFixed(2)),
//       amount: Number(items.reduce((a, r) => a + r.amount, 0).toFixed(2)),
//     },
//   });
// }



/* FILE: app/api/purchase-grc/[id]/print/route.js */
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import Business from '@/models/Business';
import Contact from '@/models/Contact';
import { requireSession } from '@/lib/session';

/* /api/purchase-grc/<id>/print
   Everything the printable challan needs, joined in one call: the GRC itself,
   the receiving business (letterhead) and the supplier (From block). */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const grc = await Grc.findById(id).lean();
  if (!grc) return json({ error: 'Not found' }, 404);

  const [business, supplier] = await Promise.all([
    grc.businessId ? Business.findById(grc.businessId).lean() : null,
    grc.supplierId ? Contact.findById(grc.supplierId).lean() : null,
  ]);

  const line = (r, i) => {
    /* lines are written by the Purchase Invoice, so the invoice key names come
       first; the bracketed forms are the older grid-header keys */
    const qty = Number(r.qty ?? r.Qty ?? r.Quantity ?? r['QTY/MTR'] ?? 0);
    const price = Number(r.purchaseRate ?? r.finalPrice ?? r['Final Price'] ?? r['Purchase Rate'] ?? 0);
    const rsp = Number(r.rsp ?? r.RSP ?? r['RSP Price'] ?? 0);
    const wsp = Number(r.wsp ?? r.WSP ?? r['WSP Price'] ?? 0);

    /* Amount on the challan is the line's net (incl. GST); falls back to
       qty x price for a line saved without one */
    const amount = Number(r.netAmount ?? r.amount ?? r.Amount ?? qty * price);

    /* GP is markup over cost - (RSP - purchase rate) / purchase rate.
       Verified against the live challan: 630 vs 370 -> 70.27%, not 41.27%. */
    const gp = price > 0 && rsp > 0 ? ((rsp - price) / price) * 100 : null;

    return {
      sn: i + 1,
      itemName: r.itemName ?? r['Item Name'] ?? '',
      batchNo: r.itemCode ?? r.batchNo ?? r.BatchNO ?? r['Item Code'] ?? '',
      uom: r.uom ?? 'Pc(s)',
      qty, price, amount, rsp, wsp,
      gp: gp === null ? null : Number(gp.toFixed(2)),
    };
  };

  const items = (Array.isArray(grc.items) ? grc.items : []).map(line);

  return json({
    business: business && {
      name: business.name,
      printName: business.businessPrintName || business.name,
      addressLine1: business.addressLine1,
      city: business.city,
      state: business.state,
      zipCode: business.zipCode,
      mobile: business.mobile,
      gstin: business.gstin,
    },
    supplier: supplier && {
      name: supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' '),
      city: supplier.billingCity,
      addressLine1: supplier.billingAddressLine1,
      addressLine2: supplier.billingAddressLine2,
      zipCode: supplier.billingZipCode,
      mobile: supplier.billingMobile,
      gstin: supplier.gstNo,
    },
    grc: {
      grcNumber: grc.grcNumber,
      grcDate: grc.grcDate,
      vendorDocNo: grc.vendorDocNo,
      vendorDocDate: grc.vendorDocDate || null,
      lrNo: grc.lrNo || '',
      lrDate: grc.lrDate || null,
    },
    items,
    totals: {
      qty: Number(items.reduce((a, r) => a + r.qty, 0).toFixed(2)),
      amount: Number(items.reduce((a, r) => a + r.amount, 0).toFixed(2)),
    },
  });
}