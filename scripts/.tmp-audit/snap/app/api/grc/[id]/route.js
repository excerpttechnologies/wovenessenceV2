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




import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import Contact from '@/models/Contact';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FORM } from '@/app/admin/transaction/purchase/grc/form';
import { LABEL_MODE, resolveBarcodeType, resolveBarcodeLabelCount } from '@/lib/barcodeLabelPrint';

const json = (data, status = 200) => Response.json(data, { status });

export async function GET(_req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();
  /* Next 15 hands `params` over as a Promise - destructuring it directly
     yields undefined, so every lookup here silently missed. */
  const { id } = await params;

  const grc = await Grc.findById(id).lean();
  if (!grc) return json({ error: 'GRC not found' }, 404);

  const [rows, supplier] = await Promise.all([
    BarcodeLabel.find({ grcId: id }).sort({ createdAt: 1 }).lean(),
      /* contactId is the supplier's human-facing code (models/Contact.js:143,
         shown as "Supplier Code" in the contact master, e.g. "G515"). It was
         already stored on every supplier but was being dropped by this
         select, so the barcode print page had no way to reach it without a
         second round trip. Added here rather than fetched separately - the
         supplier is already being read on this line. */
      grc.supplierId ? Contact.findById(grc.supplierId).select('contactId businessName firstName lastName markUpOnCostRsp markUpOnCostWsp markUpOnCostDp').lean() : null,
  ]);

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
        supplierMarkup: {
          rsp: supplier?.markUpOnCostRsp ?? null,
          wsp: supplier?.markUpOnCostWsp ?? null,
          dp: supplier?.markUpOnCostDp ?? null,
        },
    },
    /* Every barcode row carries the type and sticker count the label rule
       resolves for it, here on the server, from the uomType / batchType the
       save route stored: UNIQUE 1, MTR 2, BATCH null - a batch's count is
       the operator's, asked for when it is printed. The print screens run the
       very same function (lib/barcodeLabelPrint.js), so they agree with this
       by construction.
       
       Each row is also enriched with grcNumber and supplierCode from the parent
       GRC so labels can display "GRC {grcNumber} · Supplier {supplierCode}" at
       the top-right without requiring every caller to manually merge these fields. */
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
  const fields = (FORM.cards || []).flatMap((card) => card.type === 'fields' ? card.fields || [] : []);
  const { errors, doc, ok } = validate(fields, body.data || {});
  if (!ok) return json({ errors }, 422);
  const updated = await Grc.findByIdAndUpdate(id, doc, { new: true, runValidators: true }).lean();
  if (!updated) return json({ error: 'GRC not found' }, 404);
  return json({ ok: true, id: String(updated._id) });
}