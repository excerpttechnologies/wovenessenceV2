import { PERMISSIONS, requirePermission } from '@/lib/rbac';
import { answerCsv, answerFilename, answerWorkbook } from '@/lib/ai-assistant/export';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const MAX_BODY = 2 * 1024 * 1024;

function fail(status, message, code) {
  return Response.json({ error: message, code }, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

/* Exports the answer the user was given. It accepts only the rendered answer
   shape, caps its size, and writes it - it does not re-run a query, so an
   edited or fabricated payload produces a file containing that payload and
   nothing from the database. Access is still gated by reports.view. */
export async function POST(req) {
  try {
    await requirePermission(PERMISSIONS.REPORTS_VIEW);
  } catch (err) {
    return fail(err?.status || 403, err?.message || 'You are not allowed to export this answer.', err?.code || 'FORBIDDEN');
  }

  let body;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) return fail(413, 'That answer is too large to export.', 'BODY_TOO_LARGE');
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return fail(400, 'Send a JSON body with the answer.', 'INVALID_BODY');
  }

  const answer = body.answer;
  if (!answer || typeof answer !== 'object' || !Array.isArray(answer.kpis)) {
    return fail(422, 'The answer payload is not in a shape this export understands.', 'INVALID_ANSWER');
  }

  const format = String(body.format || 'xlsx').toLowerCase();
  if (format === 'csv') {
    const csv = answerCsv(answer);
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${answerFilename(answer, 'csv')}"`,
        'Cache-Control': 'private, no-store, max-age=0',
      },
    });
  }

  if (format !== 'xlsx') {
    return fail(422, 'Format must be xlsx or csv. PDF is available from the browser print view.', 'INVALID_FORMAT');
  }

  const buffer = answerWorkbook(answer);
  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${answerFilename(answer, 'xlsx')}"`,
      'Content-Length': String(buffer.length),
      'Cache-Control': 'private, no-store, max-age=0',
    },
  });
}
