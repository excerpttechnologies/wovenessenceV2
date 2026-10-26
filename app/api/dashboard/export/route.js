import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { buildDashboardAnalytics } from '@/lib/dashboard/service';
import { dashboardFilename, dashboardWorkbookBuffer } from '@/lib/dashboard/export';

export const dynamic = 'force-dynamic';

function fail(err) {
  if (err && err.status && err.message) {
    return Response.json(
      { error: err.message, code: err.code || 'ERROR', field: err.field || undefined },
      { status: err.status, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
  console.error('[dashboard/export]', err);
  return Response.json(
    { error: 'Could not build the dashboard report. Please retry.', code: 'INTERNAL' },
    { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
  );
}

/* The workbook is generated from the same buildDashboardAnalytics() call as
   the screen for the same query string. It is never cached and never shared
   between sessions. */
export async function GET(req) {
  try {
    const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const sp = new URL(req.url).searchParams;
    const data = await buildDashboardAnalytics(session, sp);
    const buffer = dashboardWorkbookBuffer(data);
    const filename = dashboardFilename(data);

    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, no-store, max-age=0',
        Vary: 'Cookie',
      },
    });
  } catch (err) {
    return fail(err);
  }
}
