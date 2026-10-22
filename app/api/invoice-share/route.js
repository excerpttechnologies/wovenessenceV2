import crypto from 'crypto';
import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';

/* POST /api/invoice-share  (22-10-2026)

   The POS print page's WhatsApp / Email buttons share the invoice as a
   download LINK. The page builds the PDF in the browser and posts it here;
   it is kept in the `invoiceshare` collection under a long random token and
   served, without a login, by app/invoice/[token]/route.js - only to whoever
   holds the link.

   One row per invoice: sharing it again replaces the PDF but keeps the same
   token, so a link already sent keeps working. Any logged-in user. */

const json = (d, s = 200) => Response.json(d, { status: s });
const MAX_BYTES = 5 * 1024 * 1024;

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Send the PDF as form data.' }, 400); }
  const invoiceId = String(form.get('invoiceId') || '');
  const file = form.get('file');
  if (!isValidObjectId(invoiceId)) return json({ error: 'Invoice not found.' }, 404);
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'No PDF received.' }, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: 'The PDF is empty or too large.' }, 413);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') return json({ error: 'That is not a PDF.' }, 400);

  await dbConnect();
  const db = mongoose.connection.db;
  const _id = new Types.ObjectId(invoiceId);
  const invoice = await db.collection('posinvoice').findOne({ _id }, { projection: { invoiceNo: 1 } });
  if (!invoice) return json({ error: 'Invoice not found.' }, 404);

  const col = db.collection('invoiceshare');
  const existing = await col.findOne({ invoiceId: _id }, { projection: { token: 1 } });
  const token = existing?.token || crypto.randomBytes(24).toString('base64url');
  await col.updateOne(
    { invoiceId: _id },
    {
      $set: {
        invoiceNo: invoice.invoiceNo || '',
        pdf: bytes,
        size: bytes.length,
        updatedAt: new Date(),
        updatedBy: { id: String(session.id || ''), name: session.name || '' },
      },
      $setOnInsert: { token, createdAt: new Date() },
    },
    { upsert: true },
  );

  return json({ ok: true, token, path: '/invoice/' + token });
}
