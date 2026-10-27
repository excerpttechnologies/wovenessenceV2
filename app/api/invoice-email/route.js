import nodemailer from 'nodemailer';
import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';

/* POST /api/invoice-email  (26-10-2026)

   The POS print page's Email button: the operator types the customer's
   address, the invoice PDF (built in the browser, as for WhatsApp) comes
   here and is SENT DIRECTLY by this server as an attachment - no mail
   window opens. Any logged-in user.

   The sending account comes from .env only - nothing is hard-coded:
     SMTP_HOST  smtp.gmail.com
     SMTP_PORT  465 (SSL) or 587 (STARTTLS)
     SMTP_USER  the sending Gmail address
     SMTP_PASS  its Gmail App Password (not the login password)
     SMTP_FROM  optional display sender, e.g. "Woven Essence <shop@gmail.com>"
   Without them the request is refused with a message saying so. */

export const runtime = 'nodejs';

const json = (d, s = 200) => Response.json(d, { status: s });
const MAX_BYTES = 5 * 1024 * 1024;
const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SHOP = 'WOVENESSENCE BY TEMPLE FABRICS';

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return json({ error: 'Email sending is not set up. Add SMTP_HOST, SMTP_PORT, SMTP_USER and SMTP_PASS to .env and restart the server.' }, 503);
  }

  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Send the PDF as form data.' }, 400); }
  const to = String(form.get('to') || '').trim();
  const invoiceId = String(form.get('invoiceId') || '');
  const file = form.get('file');
  if (!EMAIL_RX.test(to)) return json({ error: 'Enter a valid email address.' }, 422);
  if (!isValidObjectId(invoiceId)) return json({ error: 'Invoice not found.' }, 404);
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'No PDF received.' }, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: 'The PDF is empty or too large.' }, 413);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') return json({ error: 'That is not a PDF.' }, 400);

  await dbConnect();
  const invoice = await mongoose.connection.db.collection('posinvoice').findOne(
    { _id: new Types.ObjectId(invoiceId) },
    { projection: { invoiceNo: 1, totalAmount: 1, date: 1 } },
  );
  if (!invoice) return json({ error: 'Invoice not found.' }, 404);

  const invoiceNo = invoice.invoiceNo || '';
  const amount = Math.trunc(Number(invoice.totalAmount || 0));
  const date = invoice.date ? new Date(invoice.date).toLocaleDateString('en-GB') : '';
  const fileName = 'Invoice_' + String(invoiceNo || 'invoice').replace(/[^\w-]+/g, '_') + '.pdf';

  const port = Number(SMTP_PORT || 465);
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: String(SMTP_PASS).replace(/\s+/g, '') },
  });

  try {
    await transport.sendMail({
      from: SMTP_FROM || SMTP_USER,
      to,
      subject: 'Your invoice ' + invoiceNo + ' - ' + SHOP,
      text: [
        'Dear Customer,',
        '',
        'Thank you for shopping with ' + SHOP + '.',
        'Please find your invoice ' + invoiceNo + (date ? ' dated ' + date : '') + ' attached (Amount: Rs ' + amount + ').',
        '',
        'Regards,',
        SHOP,
      ].join('\n'),
      attachments: [{ filename: fileName, content: bytes, contentType: 'application/pdf' }],
    });
  } catch (e) {
    console.error('invoice-email send failed:', e);
    const auth = e && (e.code === 'EAUTH' || e.responseCode === 535);
    return json({
      error: auth
        ? 'The email account in .env refused the login. For Gmail, SMTP_PASS must be an App Password.'
        : 'Could not send the email: ' + (e?.message || 'unknown error'),
    }, 502);
  }

  return json({ ok: true, to, invoiceNo });
}
