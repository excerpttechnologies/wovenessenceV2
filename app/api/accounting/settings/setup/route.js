import dbConnect from '@/lib/db';
import { json, guard, writeScope } from '@/lib/accounting/route';
import { SCREENS, ACTIONS } from '@/lib/screenPermission';
import { setupAccounting } from '@/lib/accounting/setup';

/* POST /api/accounting/settings/setup

   Creates the standard chart of accounts for the business and location on
   the request, then fills every EMPTY mapping with the account made for that
   role. Nothing an operator already created or chose is overwritten - see
   lib/accounting/setup.js for why, and the list of accounts it makes.

   A separate route from PUT /api/accounting/settings on purpose: the normal
   save changes one mapping, this one can create twenty-four accounts. Two
   requests, two permissions (create and update), and the screen shows which
   it is doing. */

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const denied = await guard(req, SCREENS.ACCOUNTS_SETTINGS, ACTIONS.CREATE, body?.business);
  if (denied) return denied;

  await dbConnect();
  const scope = writeScope(body, new URL(req.url).searchParams);

  if (!scope.businessId) return json({ error: 'Select a business in the top bar.' }, 422);

  const result = await setupAccounting({
    businessId: scope.businessId,
    locationId: scope.locationId,
    finYear: scope.finYear,
    mode: body?.data?.gstPostingMode || body?.gstPostingMode || 'inclusive',
  });

  if (!result.ok) return json({ error: result.error }, 422);

  return json(result);
}
