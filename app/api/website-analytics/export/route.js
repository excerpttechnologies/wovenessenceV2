import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { buildWebsiteAnalytics } from '@/lib/website-analytics/service';
import { websiteAnalyticsBuffer, websiteAnalyticsFilename } from '@/lib/website-analytics/export';

export const dynamic = 'force-dynamic';

function fail(err) {
  if (err && err.status && err.message) {
    return Response.json(
      { error: err.message, code: err.code || 'ERROR' },
      { status: err.status, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  console.error('[website-analytics/export]', err);
  return Response.json(
    { error: 'Could not build the website analytics report. Please retry.', code: 'INTERNAL' },
    { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

/* Same query string as the screen, same builder, same figures. */
export async function GET(req) {
  try {
    const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = new URL(req.url).searchParams;
    const data = await buildWebsiteAnalytics(session, sp);
    const buffer = websiteAnalyticsBuffer(data);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${websiteAnalyticsFilename(data)}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Cookie',
      },
    });
  } catch (err) {
    return fail(err);
  }
}
