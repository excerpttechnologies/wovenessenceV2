import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { loadGrcPrintPayload } from '@/lib/grcPrintData';
import { buildGrcPrintHtml } from '@/lib/grcPrintLayout';

/* /api/grc/<id>/download

   The Goods Receipt Challan as a PDF file, converted from HTML using html2pdf.js.
   The branch letterhead comes from the GRC's own saved businessId / locationId
   (lib/grcPrintData.js) - never from the currently selected branch. */

const json = (data, status = 200) => Response.json(data, { status });

export async function GET(_req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const payload = await loadGrcPrintPayload(id);
  if (!payload) return json({ error: 'GRC not found' }, 404);

  /* Roles & Permissions (17-10-2026): printing a GRC - GRC Read, Create or
     Update, exactly as this route has always required. */
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
  const filename = 'GRC_' + String(payload.grc.grcNumber || id).replace(/[^\w.-]+/g, '_') + '.pdf';

  // Convert HTML to PDF using html2pdf.js
  const { default: html2pdf } = await import('html2pdf.js');
  const pdfBuffer = await html2pdf().set({
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(html).toPdf().get('pdfarraybuffer');

  return new Response(pdfBuffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}
