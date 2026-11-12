import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { loadMergeSources, validateMergeSources } from '@/lib/barcodeMerge';
import { handler } from '@/lib/apiError';

/* POST /api/barcode-merge/validate

   Fetches the selected source barcodes and answers whether they may be
   merged: same item, supplier, HSN/GST, batch and location, with an approved
   UOM conversion where the units differ. Read-only - no number is issued and
   no stock moves until the merge is saved. */

const json = (d, s = 200) => Response.json(d, { status: s });

export const POST = handler(async (req) => {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();

  const body = await req.json().catch(() => ({}));
  const denied = await screenDenialAnyAction({
    session, screens: [SCREENS.BARCODE_MERGE], actions: [PERM.CREATE, PERM.READ],
    businessId: body.business, label: 'barcode merges',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const businessId = body.business && isValidObjectId(String(body.business)) ? body.business : null;

  const units = await loadMergeSources({
    businessId,
    barcodeIds: body.barcodeIds,
    codes: body.barcodes,
  });

  const checked = await validateMergeSources({ businessId, units, targetUom: body.uom });

  return json({
    ok: checked.errors.length === 0,
    sources: checked.sources,
    totalQty: checked.totalQty,
    uom: checked.uom,
    uomType: checked.uomType,
    errors: checked.errors,
  });
});
