import dbConnect from '@/lib/db';
import { json, guard, sessionAndScope } from '@/lib/accounting/route';
import { SCREENS, ACTIONS } from '@/lib/screenPermission';
import { syncSourcePosting, GRC_SOURCE } from '@/lib/accounting/posting';

/* POST /api/accounting/post-source  { source: 'purchase', id: '<grc id>' }

   Posts a document that could not be posted when it was raised (no mapping
   yet, accounting settings added later) - or re-posts one whose value
   changed. The work itself is lib/accounting/posting.js, so pressing this
   twice cannot produce two journals.

   A failed posting answers 200 with `status: 'failed'` and the reason: the
   document exists and is valid, only its books are missing, and the screen
   shows that as a message rather than as a request that went wrong. */

export async function POST(req) {
  const denied = await guard(req, SCREENS.ACCOUNTS_JOURNAL, ACTIONS.UPDATE);
  if (denied) return denied;

  await dbConnect();
  const body = await req.json().catch(() => ({}));
  const { session } = await sessionAndScope(req);

  const source = String(body.source || '').trim();
  const id = String(body.id || '').trim();

  if (source !== GRC_SOURCE) {
    return json({ error: 'Only Purchase GRC postings can be posted from this screen today.' }, 422);
  }
  if (!id) return json({ error: 'Choose the document to post.' }, 422);

  const result = await syncSourcePosting(source, id, { actor: session });
  return json({
    ok: result.status === 'posted',
    ...result,
  });
}
