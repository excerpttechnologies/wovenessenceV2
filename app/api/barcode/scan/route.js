import dbConnect from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { handler, json } from '@/lib/apiError';
import { scanBarcode, shape } from '@/lib/inventory';
import { screenDenial, screenDenialAny, screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';

const NON_POS_SCAN_SCREENS = [
  SCREENS.GRC,
  SCREENS.GRT,
  SCREENS.BARCODE_ITEM,
  SCREENS.PRINT_LABEL,
  SCREENS.MASTER_STOCK_REPORT,
  SCREENS.ITEM,
  SCREENS.STOCK_ADJUSTMENT,
  SCREENS.BARCODE_SPLIT,
  SCREENS.BARCODE_MERGE,
  SCREENS.TRANSFER_PACKET,
  SCREENS.TRANSFER_LOCATION,
  SCREENS.TRANSFER_RECEIVED,
  SCREENS.IC_DELIVERY_CHALLAN,
  SCREENS.IC_RECEIVE_DELIVERY_CHALLAN,
  SCREENS.SELL_DELIVERY_CHALLAN,
  SCREENS.DELIVERY,
  SCREENS.DISPATCH,
];

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

  const scope = await resolveAuthorizedScope(session, {
    businessId: business,
    locationId: location,
  });
  if (!scope.ok) return scopeErrorResponse(scope);

  /* Roles & Permissions (17-10-2026): ONLY the POS till's scans - a sale
     (SELL) or an exchange (POS_RETURN) - answer to the POS screen: Read,
     Create OR Update lets them through. Every other intent (LOOKUP, TRANSFER,
     ...) is used by other screens and is not checked here, exactly as before. */
  if (intent === 'SELL' || intent === 'POS_RETURN') {
    const allowedScreens = intent === 'POS_RETURN'
      ? [SCREENS.POS_RETURN, SCREENS.POS]
      : [SCREENS.POS];
    const denied = await screenDenialAnyAction({
      session,
      screens: allowedScreens,
      actions: [PERM.READ, PERM.CREATE, PERM.UPDATE],
      businessId: scope.businessId || business,
      label: intent === 'POS_RETURN' ? 'POS Return' : 'POS',
    });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);
  } else {
    const denied = await screenDenialAnyAction({
      session,
      screens: NON_POS_SCAN_SCREENS,
      actions: [PERM.READ, PERM.CREATE, PERM.UPDATE],
      businessId: scope.businessId || business,
      label: 'barcode scan',
    });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);
  }

  const unit = await scanBarcode({
    code,
    businessId: scope.businessId || business,
    locationId: scope.locationId || location,
    intent,
    invoiceId,
    transferId,
    alreadyScanned: Array.isArray(scanned) ? scanned : [],
  });

  void session;
  const fullUnit = shape(unit);
  if (intent === 'SELL' || intent === 'POS_RETURN') {
    const invDenied = await screenDenialAny({
      session,
      screens: [
        SCREENS.GRC,
        SCREENS.GRT,
        SCREENS.BARCODE_ITEM,
        SCREENS.PRINT_LABEL,
        SCREENS.MASTER_STOCK_REPORT,
        SCREENS.ITEM,
      ],
      action: PERM.READ,
      businessId: scope.businessId || business,
      label: 'inventory cost details',
    });
    if (invDenied) {
      const { rate, wsp, supplierId, grcId, grcNo, serialNo, batchNo, transferNo, ...posSafeUnit } = fullUnit;
      return json({ ok: true, unit: posSafeUnit });
    }
  }
  return json({ ok: true, unit: fullUnit });
});
