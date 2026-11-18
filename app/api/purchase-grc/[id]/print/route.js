import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { loadGrcPrintPayload } from '@/lib/grcPrintData';

/* /api/purchase-grc/<id>/print

   The GRC print document's data, in one call:

     { grc, branch, supplier, items, totals }

   `branch` is resolved from the GRC's own businessId / locationId (see
   lib/grcPrintData.js), so the print view shows the branch that received
   this challan - not the branch selected in the application header.

   The markup that consumes this payload lives in lib/grcPrintLayout.js and
   is shared with /api/grc/<id>/print and /api/grc/<id>/download. */

const json = (data, status = 200) => Response.json(data, { status });

export async function GET(_req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const payload = await loadGrcPrintPayload(id);
  if (!payload) return json({ error: 'Not found' }, 404);

  /* Roles & Permissions (17-10-2026): printing a GRC - its Read (or Update,
     printed from the edit page) */
  const denied = await screenDenialAnyAction({
    session,
    screens: [SCREENS.GRC],
    actions: [PERM.READ, PERM.UPDATE],
    businessId: payload.branch.businessId || null,
    label: 'GRC',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return json(payload);
}
