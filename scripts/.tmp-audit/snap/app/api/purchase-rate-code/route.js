import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import PurchaseRateCode from '@/models/PurchaseRateCode';
import { requireSession } from '@/lib/session';
import { normaliseMapping, validateMapping } from '@/lib/purchaseRateCode';

/* /api/purchase-rate-code - single document per scope: read + upsert.

   Shaped after /api/barcode-label-setting, which is this project's pattern for
   a one-record-per-scope master: GET returns { doc } or { doc: null }, POST
   upserts. POST rather than PUT because that is what every other settings
   master here uses. */

const json = (d, s = 200) => Response.json(d, { status: s });

function scopeOf(sp) {
  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  return filter;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const doc = await PurchaseRateCode.findOne(scopeOf(sp)).lean();

  /* digitMappings is re-normalised on the way out as well as in. A record
     written by an earlier build, or edited straight in the database, would
     otherwise hand the encoder untrimmed or lower-case codes and quietly
     produce a value that will not decode. */
  return json({
    doc: doc
      ? { ...doc, _id: String(doc._id), digitMappings: normaliseMapping(doc.digitMappings) }
      : null,
  });
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  await dbConnect();

  /* Validated server-side as well as in the page: the browser is not trusted
     to have run the duplicate check, and an incomplete or ambiguous mapping
     saved here would break decoding everywhere it is used. */
  const { ok, errors, mapping } = validateMapping(body.digitMappings);
  if (!ok) return json({ error: errors[0], errors }, 422);

  const doc = {
    digitMappings: mapping,
    isActive: body.isActive === undefined ? true : Boolean(body.isActive),
  };
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;

  const sp = new URLSearchParams({
    business: body.business || '', location: body.location || '',
  });
  await PurchaseRateCode.findOneAndUpdate(scopeOf(sp), doc, { upsert: true, new: true });

  return json({ ok: true });
}
