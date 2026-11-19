/* POST /api/item/validate

   Exact item-code verification for the GRC Barcode Generation sheet and its
   save route. The autocomplete list is a search: it can show a partial match,
   but a code is only VALID when it equals an Item Master code (or the item
   name older records keep their code in - see /api/item/[id]/detail).

   Body: { codes: string[], business?: ObjectId }

   Answers:
     { items: [ ...master rows... ], missing: [codes], masterEmpty: boolean }

   Read-only. The same ITEM_LOOKUP_SCREENS permission every screen that
   resolves item codes already uses, so a GRC operator who may pick an item can
   verify it without holding Item administration rights. */

import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Item from '@/models/Item';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { screenDenialAny, ACTIONS as PERM, ITEM_LOOKUP_SCREENS } from '@/lib/screenPermission';
import { masterItemOf, normaliseItemCode } from '@/lib/itemMasterValidation';

const json = (d, s = 200) => Response.json(d, { status: s });

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const business = String(body?.business || '').trim();
  const codes = [...new Set(
    (Array.isArray(body?.codes) ? body.codes : [])
      .map((code) => String(code ?? '').trim())
      .filter(Boolean)
  )].slice(0, 300);

  await dbConnect();

  const denied = await screenDenialAny({
    session, screens: ITEM_LOOKUP_SCREENS, action: PERM.READ,
    businessId: isValidObjectId(business) ? business : null, label: 'items',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (!codes.length) return json({ items: [], missing: [], masterEmpty: false });

  const clauses = codes.flatMap((code) => {
    const rx = { $regex: `^${escapeRegex(code)}$`, $options: 'i' };
    return [{ itemCode: rx }, { name: rx }];
  });
  const filter = { $or: clauses };
  if (isValidObjectId(business)) filter.businessId = business;

  const [rows, anyMaster] = await Promise.all([
    Item.find(filter)
      .select('_id itemCode name description rsp wsp rspOfferPercent markupRSP markupWSP markupDP hsnId')
      .limit(500)
      .lean(),
    Item.exists(isValidObjectId(business) ? { businessId: business } : {}),
  ]);

  const wanted = new Set(codes.map(normaliseItemCode));
  const found = rows
    .map((row) => masterItemOf(row))
    .filter((item) => item && (wanted.has(normaliseItemCode(item.itemCode)) || wanted.has(normaliseItemCode(item.name))));
  const foundKeys = new Set(found.flatMap((item) => [normaliseItemCode(item.itemCode), normaliseItemCode(item.name)]));
  const missing = codes.filter((code) => !foundKeys.has(normaliseItemCode(code)));

  return json({
    items: found,
    missing,
    masterEmpty: !anyMaster,
  });
}
