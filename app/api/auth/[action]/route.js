import { cookies } from 'next/headers';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { COOKIE, cookieOptions, signSession, readSession, verifyPassword } from '@/lib/auth';
import User from '@/models/User';

/* The user schema used to be declared inline here. It now lives in
   models/User.js so the RBAC layer and the user-management screen can read
   the same definition - two declarations of one model name is a bug waiting
   to happen. Behaviour is unchanged. */
void mongoose;

const json = (d, s = 200) => Response.json(d, { status: s });

export async function POST(req, { params }) {
  const { action } = await params;
  const jar = await cookies();

  if (action === 'logout') {
    jar.delete(COOKIE);
    return json({ ok: true });
  }

  if (action === 'login') {
    const { email, password } = await req.json();
    if (!email || !password) return json({ error: 'Enter your email and password.' }, 422);

    await dbConnect();
    const user = await User.findOne({ email: String(email).toLowerCase().trim() }).lean();

    /* one generic message either way - never reveal which half was wrong */
    if (!user || !verifyPassword(password, user.password)) {
      return json({ error: 'Those credentials do not match our records.' }, 401);
    }
    if (user.isActive === false) return json({ error: 'This account is disabled.' }, 403);

    /* The session carries the account's LOCATIONS as well as its role.

       lib/rbac.js decides whether a request may touch a location from this
       payload, so without it every account would read as unrestricted and the
       location half of the permission model would never apply. Kept in the
       signed cookie rather than re-read per request: the payload is
       tamper-proof (HMAC), and a per-request lookup on every one of 150
       routes is a cost with nothing to show for it.

       Changing an account's locations therefore takes effect at its next
       sign-in. That is the standard trade for a stateless session and is
       noted here so it is a decision rather than a surprise. */
    jar.set(COOKIE, signSession({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      locationIds: (user.locationIds || []).map(String),
      allow: user.allow || [],
      deny: user.deny || [],
    }), cookieOptions);

    return json({
      ok: true,
      user: {
        name: user.name, email: user.email, role: user.role,
        locationIds: (user.locationIds || []).map(String),
      },
    });
  }

  return json({ error: 'Unknown action' }, 404);
}

export async function GET(req, { params }) {
  const { action } = await params;
  if (action !== 'me') return json({ error: 'Unknown action' }, 404);
  const jar = await cookies();
  const session = readSession(jar.get(COOKIE)?.value);
  if (!session) return json({ user: null }, 401);
  return json({
    user: {
      name: session.name, email: session.email, role: session.role,
      locationIds: session.locationIds || [],
    },
  });
}
