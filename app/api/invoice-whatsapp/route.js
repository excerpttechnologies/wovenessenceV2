import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';

/* POST /api/invoice-whatsapp  (27-10-2026)

   View POS's WhatsApp PDF button: the operator types the customer's mobile
   number, the invoice PDF (built in the browser) comes here and is SENT
   DIRECTLY to that number's WhatsApp through the WhatsApp Cloud API - no
   WhatsApp window opens. Any logged-in user.

   WhatsApp only lets a business start a chat with a Meta-APPROVED template,
   so the PDF goes as the header of the `pos_invoice` template:
     header  DOCUMENT  - the invoice PDF
     body    "Thank you for shopping with wovenessence by TEMPLE FABRICS.
              Your invoice {{1}} for Rs {{2}} is attached."

   Everything comes from .env - nothing is hard-coded:
     WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION,
     WHATSAPP_INVOICE_TEMPLATE (pos_invoice), WHATSAPP_TEMPLATE_LANGUAGE,
     WHATSAPP_DEFAULT_COUNTRY_CODE (91), WHATSAPP_REQUEST_TIMEOUT_MS */

export const runtime = 'nodejs';

const json = (d, s = 200) => Response.json(d, { status: s });
const MAX_BYTES = 5 * 1024 * 1024;

/* digits only; a bare 10-digit Indian number gets the country code */
function toWhatsAppNumber(raw, cc) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  if (d.length === 10) d = String(cc || '91') + d;
  return d.length >= 11 && d.length <= 15 ? d : '';
}

/* Meta's own error text, with plain words for the ones a counter will hit */
function metaError(d, fallback) {
  const e = d && d.error;
  if (!e) return fallback;
  const code = e.code;
  if (code === 132001 || code === 132000) return 'The WhatsApp invoice template is not approved by Meta yet - try again after it is approved.';
  if (code === 131026 || code === 131030) return 'This number cannot receive WhatsApp messages (not on WhatsApp, or not allowed for this account).';
  if (code === 190) return 'The WhatsApp access token in .env is invalid or expired.';
  return 'WhatsApp: ' + (e.error_user_msg || e.message || fallback);
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const {
    WHATSAPP_ENABLED, WHATSAPP_ACCESS_TOKEN: TOKEN, WHATSAPP_PHONE_NUMBER_ID: PHONE_ID,
    WHATSAPP_API_VERSION, WHATSAPP_INVOICE_TEMPLATE, WHATSAPP_TEMPLATE_LANGUAGE,
    WHATSAPP_DEFAULT_COUNTRY_CODE, WHATSAPP_REQUEST_TIMEOUT_MS,
  } = process.env;
  if (String(WHATSAPP_ENABLED).toLowerCase() === 'false' || !TOKEN || !PHONE_ID) {
    return json({ error: 'WhatsApp sending is not set up. Add the WHATSAPP_ settings to .env and restart the server.' }, 503);
  }
  const G = 'https://graph.facebook.com/' + (WHATSAPP_API_VERSION || 'v21.0');
  const timeout = () => AbortSignal.timeout(Math.max(3000, Number(WHATSAPP_REQUEST_TIMEOUT_MS) || 8000) * 2);

  let form;
  try { form = await req.formData(); } catch { return json({ error: 'Send the PDF as form data.' }, 400); }
  const to = toWhatsAppNumber(form.get('to'), WHATSAPP_DEFAULT_COUNTRY_CODE);
  const invoiceId = String(form.get('invoiceId') || '');
  const file = form.get('file');
  if (!to) return json({ error: 'Enter a valid mobile number (10 digits, or with country code).' }, 422);
  if (!isValidObjectId(invoiceId)) return json({ error: 'Invoice not found.' }, 404);
  if (!file || typeof file.arrayBuffer !== 'function') return json({ error: 'No PDF received.' }, 400);

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_BYTES) return json({ error: 'The PDF is empty or too large.' }, 413);
  if (bytes.subarray(0, 5).toString() !== '%PDF-') return json({ error: 'That is not a PDF.' }, 400);

  await dbConnect();
  const invoice = await mongoose.connection.db.collection('posinvoice').findOne(
    { _id: new Types.ObjectId(invoiceId) },
    { projection: { invoiceNo: 1, totalAmount: 1 } },
  );
  if (!invoice) return json({ error: 'Invoice not found.' }, 404);

  const invoiceNo = invoice.invoiceNo || '-';
  const amount = String(Math.trunc(Number(invoice.totalAmount || 0)));
  const fileName = 'Invoice_' + String(invoiceNo).replace(/[^\w-]+/g, '_') + '.pdf';

  try {
    /* 1. the PDF goes up to WhatsApp's media store */
    const up = new FormData();
    up.append('messaging_product', 'whatsapp');
    up.append('type', 'application/pdf');
    up.append('file', new Blob([bytes], { type: 'application/pdf' }), fileName);
    const mr = await fetch(G + '/' + PHONE_ID + '/media', {
      method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN }, body: up, signal: timeout(),
    });
    const md = await mr.json().catch(() => ({}));
    if (!mr.ok || !md.id) return json({ error: metaError(md, 'Could not upload the PDF to WhatsApp.') }, 502);

    /* 2. the approved template, with the PDF as its document header */
    const sr = await fetch(G + '/' + PHONE_ID + '/messages', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: WHATSAPP_INVOICE_TEMPLATE || 'pos_invoice',
          language: { code: WHATSAPP_TEMPLATE_LANGUAGE || 'en_US' },
          components: [
            { type: 'header', parameters: [{ type: 'document', document: { id: md.id, filename: fileName } }] },
            { type: 'body', parameters: [{ type: 'text', text: invoiceNo }, { type: 'text', text: amount }] },
          ],
        },
      }),
      signal: timeout(),
    });
    const sd = await sr.json().catch(() => ({}));
    if (!sr.ok) return json({ error: metaError(sd, 'Could not send the WhatsApp message.') }, 502);

    return json({ ok: true, to: '+' + to, invoiceNo, messageId: sd.messages?.[0]?.id || '' });
  } catch (e) {
    const timedOut = e && (e.name === 'TimeoutError' || e.name === 'AbortError');
    return json({ error: timedOut ? 'WhatsApp did not answer in time - try again.' : 'Could not reach WhatsApp: ' + (e?.message || 'error') }, 502);
  }
}
