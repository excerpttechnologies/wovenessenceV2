import { cookies } from 'next/headers';
import { COOKIE, readSession } from '@/lib/auth';

/* ==========================================================================
   POST /api/auth/customer/logout
   
   Clear customer session
   - Deletes session cookie
   - Returns success regardless of session state
   
   Public endpoint (works with or without session)
   ========================================================================== */

const json = (data, status = 200) => Response.json(data, { status });

export async function POST() {
  try {
    const jar = await cookies();
    const session = readSession(jar.get(COOKIE)?.value);

    // Clear cookie
    jar.delete(COOKIE);

    return json({
      ok: true,
      message: 'Logged out successfully',
      wasAuthenticated: !!session && session.type === 'customer',
    });

  } catch (error) {
    console.error('[Customer Logout Error]:', error);
    // Even if error occurs, clear the cookie
    const jar = await cookies();
    jar.delete(COOKIE);
    return json({ ok: true, message: 'Logged out' });
  }
}

// Only POST allowed
export async function GET() {
  return json({ error: 'Method not allowed' }, 405);
}

export async function PUT() {
  return json({ error: 'Method not allowed' }, 405);
}

export async function DELETE() {
  return json({ error: 'Method not allowed' }, 405);
}
