import dbConnect from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { handler, json } from '@/lib/apiError';
import { scanBarcode, shape } from '@/lib/inventory';

/* POST /api/barcode/scan
   { code, business, location, intent, invoiceId, transferId, scanned: [] }

   The one endpoint every scanner in the app talks to - the till, the stock
   transfer screen, receiving and returns. Keeping it single means the rules
   about what a barcode may be used for cannot drift between screens, and a
   new screen gets all of them for free.

   Answers 200 with the resolved unit, or a 4xx carrying a `code` from
   SCAN_ERRORS and a message written for the person holding the scanner. The
   screen shows the message and, for a hard failure, beeps - it never has to
   interpret the reason itself.

   GET is deliberately not offered: a scan is a lookup with an intent and a
   list of what is already on the document, which does not belong in a URL. */

export const POST = handler(async (req) => {
  const session = await requireUser();
  const body = await req.json().catch(() => ({}));
  await dbConnect();

  const {
    code, business, location, intent = 'LOOKUP',
    invoiceId = null, transferId = null, scanned = [],
  } = body || {};

  const unit = await scanBarcode({
    code,
    businessId: business,
    locationId: location,
    intent,
    invoiceId,
    transferId,
    alreadyScanned: Array.isArray(scanned) ? scanned : [],
  });

  void session;
  return json({ ok: true, unit: shape(unit) });
});
