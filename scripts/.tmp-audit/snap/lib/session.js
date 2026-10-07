import { cookies } from 'next/headers';
import { COOKIE, readSession } from './auth';

/* Every new per-resource API route calls this first.
   The old /api/settings/[action] handler had NO auth check at all -
   middleware.js only matches /admin/*, so the API was reachable
   unauthenticated. Each route file closes that itself. */

export async function requireSession() {
  const jar = await cookies();
  return readSession(jar.get(COOKIE)?.value);
}
