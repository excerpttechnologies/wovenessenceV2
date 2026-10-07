// import dbConnect from '@/lib/db';
// import { Grc } from '@/lib/grc';
// import { BarcodeLabel } from '@/lib/barcodeLabel';

// const json = (data, status = 200) => Response.json(data, { status });

// /* GET /api/grc/[id]
//    Returns { grc, rows } - the GRC header plus every barcode row linked to
//    it (grcId). Used by both the "Print GRC" and "Barcode print" pages so
//    they don't each need their own fetch logic. */
// export async function GET(_req, { params }) {
//   await dbConnect();
//   const { id } = params;

//   const grc = await Grc.findById(id).lean();
//   if (!grc) return json({ error: 'GRC not found' }, 404);

//   const rows = await BarcodeLabel.find({ grcId: id }).sort({ createdAt: 1 }).lean();

//   return json({
//     grc: { ...grc, _id: String(grc._id) },
//     rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
//   });
// }

// /* DELETE /api/grc/[id]
//    Removes the GRC header and every barcode row linked to it - the
//    list's "Delete" action for a GRC row. */
// export async function DELETE(_req, { params }) {
//   await dbConnect();
//   const { id } = params;

//   await Promise.all([
//     Grc.findByIdAndDelete(id),
//     BarcodeLabel.deleteMany({ grcId: id }),
//   ]);

//   return json({ ok: true });
// }




import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import { Supplier } from '@/lib/contacts';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FORM } from '@/app/admin/transaction/purchase/grc/form';
import { LABEL_MODE, resolveBarcodeType, resolveBarcodeLabelCount } from '@/lib/barcodeLabelPrint';
import { TABS as SUPPLIER_TABS } from '@/app/admin/contact/supplier/tabs';
import { priceSetupFieldDefs, buildSupplierPriceSetup } from '@/lib/supplierPriceSetup';

const json = (data, status = 200) => Response.json(data, { status });

/* The supplier master's "Price Calculation Setup" fields, read off the
   supplier form definition itself - a field added to that section reaches
   Barcode Generation without another change here. */
const PRICE_SETUP_DEFS = priceSetupFieldDefs(SUPPLIER_TABS);

export async function GET(_req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();
  /* Next 15 hands `params` over as a Promise - destructuring it directly
     yields undefined, so every lookup here silently missed. */
  const { id } = await params;
  /* a GRC number or other non-id used to throw a cast error - a bare 500 */
  if (!isValidObjectId(id)) return json({ error: 'GRC not found' }, 404);

  const grc = await Grc.findById(id).lean();
  if (!grc) return json({ error: 'GRC not found' }, 404);

  const [rows, supplier] = await Promise.all([
    /* _id breaks ties: one Submit inserts its rows within the same few
       milliseconds, and MongoDB does not keep equal createdAt values in any
       particular order - the grid and the label sheet came back shuffled */
    BarcodeLabel.find({ grcId: id }).sort({ createdAt: 1, _id: 1 }).lean(),
      /* contactId is the supplier's human-facing code (models/Contact.js:143,
         shown as "Supplier Code" in the contact master, e.g. "G515"). It was
         already stored on every supplier but was being dropped by this
         select, so the barcode print page had no way to reach it without a
         second round trip. Added here rather than fetched separately - the
         supplier is already being read on this line. */
      /* ...and the whole Price Calculation Setup section, on the same read:
         the supplier is the GRC's own (grc.supplierId), never one matched by
         name. */
      grc.supplierId
        ? Supplier.findById(grc.supplierId)
          .select(['contactId', 'businessName', 'firstName', 'lastName', ...PRICE_SETUP_DEFS.map((d) => d.key)].join(' '))
          .lean()
        : null,
  ]);
  const supplierPriceSetup = buildSupplierPriceSetup(PRICE_SETUP_DEFS, supplier, { supplierId: grc.supplierId || '' });
  const setupValue = (key) => supplierPriceSetup.fields.find((f) => f.key === key)?.value ?? null;

  return json({
    grc: {
      ...grc,
      _id: String(grc._id),
      supplierName: supplier?.businessName || [supplier?.firstName, supplier?.lastName].filter(Boolean).join(' '),
      /* The stored code, verbatim - not derived from the name and never
         defaulted to a placeholder. It is ERP data for the screens and
         reports that show this GRC. It is NOW also label data: every barcode
         label carries the GRC number and supplier code at the top-right. */
      supplierCode: supplier?.contactId || '',
      /* the three markups, as before - from the same setup as below */
      supplierMarkup: {
        rsp: setupValue('markUpOnCostRsp'),
        wsp: setupValue('markUpOnCostWsp'),
        dp: setupValue('markUpOnCostDp'),
      },
      /* Supplier -> Price Calculation Setup, every field of it, with its
         label and the supplier's stored value (lib/supplierPriceSetup.js) */
      supplierPriceSetup,
    },
    /* Every barcode row carries the type and sticker count the label rule
       resolves for it, here on the server, from the uomType / batchType the
       save route stored: UNIQUE 1, MTR 2, BATCH null - a batch's count is
       the operator's, asked for when it is printed. The print screens run the
       very same function (lib/barcodeLabelPrint.js), so they agree with this
       by construction.
       
       Each row is also enriched with grcNumber and supplierCode from the parent
       GRC, for the screens that list these rows. A label prints neither: its
       fields come only through lib/barcodeLabelPrint.js toLabelData. */
    rows: rows.map((r) => {
      const barcodeType = resolveBarcodeType(r);
      return {
        ...r,
        _id: String(r._id),
        grcNumber: grc.grcNumber || '',
        supplierCode: supplier?.contactId || '',
        barcodeType,
        labelCount: barcodeType === LABEL_MODE.BATCH ? null : resolveBarcodeLabelCount(r),
      };
    }),
  });
}

export async function DELETE(_req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();
  const { id } = await params;

  await Promise.all([
    Grc.findByIdAndDelete(id),
    BarcodeLabel.deleteMany({ grcId: id }),
  ]);

  return json({ ok: true });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();
  const { id } = await params;
  const body = await req.json();
  /* Header fields, plus the Voucher Section columns marked `header: true`
     (Round Off). The rest of the Voucher Section lives in voucherRows and is
     deliberately left out, exactly as it was before. */
  const fields = (FORM.cards || []).flatMap((card) => {
    if (card.type === 'fields') return card.fields || [];
    if (card.type === 'voucher') return (card.fields || []).filter((f) => f.header);
    return [];
  });
  const { errors, doc, ok } = validate(fields, body.data || {});
  if (!ok) return json({ errors }, 422);

  /* coerce() spells an empty number as null; Round Off's own default is 0 */
  if (doc.roundOff == null) doc.roundOff = 0;

  /* Round Off is held twice on a GRC: on the header (what this screen and Net
     Purchases Value read) and inside the voucherRows the Add screen wrote.
     This screen has no Voucher Section, so it sends only the flat header
     value - mirror it back into the rows rather than let the two disagree on
     one document. The whole amount goes on the first row and the rest are
     zeroed, which keeps sum(voucherRows.roundOff) === header roundOff, the
     invariant the Add screen's own submit() maintains. */
  const current = await Grc.findById(id).select('voucherRows').lean();
  if (Array.isArray(current?.voucherRows) && current.voucherRows.length) {
    doc.voucherRows = current.voucherRows.map((row, index) => ({
      ...row,
      roundOff: index === 0 ? doc.roundOff : 0,
    }));
  }

  const updated = await Grc.findByIdAndUpdate(id, doc, { new: true, runValidators: true }).lean();
  if (!updated) return json({ error: 'GRC not found' }, 404);
  return json({ ok: true, id: String(updated._id) });
}