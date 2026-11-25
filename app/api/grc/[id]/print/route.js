import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { loadGrcPrintPayload } from '@/lib/grcPrintData';
import { buildGrcPrintHtml } from '@/lib/grcPrintLayout';
import { assertDocumentLocationAccess } from '@/lib/locationAccess';

/* /api/grc/<id>/print

   The same Goods Receipt Challan document as /api/grc/<id>/download, served
   inline so it can be opened in a tab and printed with the browser's
   Print -> Save as PDF. No other GRC print URL builds a different layout. */

const json = (data, status = 200) => Response.json(data, { status });

export async function GET(_req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const payload = await loadGrcPrintPayload(id);
  if (!payload) return json({ error: 'GRC not found' }, 404);

  const locDenied = await assertDocumentLocationAccess(session, {
    businessId: payload.grc?.businessId || payload.branch?.businessId,
    locationId: payload.grc?.locationId || payload.branch?.locationId,
  });
  if (locDenied) return locDenied;

  const denied = await screenDenialAnyAction({
    session,
    screens: [SCREENS.GRC],
    actions: [PERM.READ, PERM.CREATE, PERM.UPDATE],
    businessId: payload.branch.businessId || null,
    label: 'GRC',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const html = buildGrcPrintHtml(payload, {
    title: 'GRC ' + (payload.grc.grcNumber || id),
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}
