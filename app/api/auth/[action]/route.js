import { cookies } from 'next/headers';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { COOKIE, cookieOptions, signSession, verifyPassword } from '@/lib/auth';
import { requireSession } from '@/lib/session';
import { getSessionLocationAccess } from '@/lib/locationAccess';
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
    const locationIds = (user.locationIds || []).map(String);
    const businessId = user.businessId ? String(user.businessId) : '';
    jar.set(COOKIE, signSession({
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      businessId,
      locationIds,
      allow: user.allow || [],
      deny: user.deny || [],
    }), cookieOptions);

    const access = await getSessionLocationAccess({ role: user.role, locationIds, businessId });
    return json({
      ok: true,
      user: {
        id: String(user._id),
        name: user.name,
        email: user.email,
        role: user.role,
        businessId,
        locationIds,
        defaultLocationId: access.defaultLocationId,
        isRestricted: access.isRestricted,
        needsAssignment: access.needsAssignment,
        isLocationLocked: access.isSingleLocation,
        isCompanyLocked: access.isCompanyLocked,
        allowedBusinessIds: access.allowedBusinessIds,
        allowedLocations: access.allowedLocations,
      },
    });
  }

  return json({ error: 'Unknown action' }, 404);
}

export async function GET(req, { params }) {
  const { action } = await params;
  if (action !== 'me') return json({ error: 'Unknown action' }, 404);
  const session = await requireSession();
  if (!session) return json({ user: null }, 401);
  const access = await getSessionLocationAccess(session);
  return json({
    user: {
      id: session.id || '',
      name: session.name,
      email: session.email,
      role: session.role,
      businessId: session.businessId || '',
      locationIds: session.locationIds || [],
      counterId: session.counterId || '',
      isRestricted: access.isRestricted,
      needsAssignment: access.needsAssignment,
      isLocationLocked: access.isSingleLocation,
      isCompanyLocked: access.isCompanyLocked,
      defaultLocationId: access.defaultLocationId,
      allowedLocationIds: access.allowedLocationIds,
      allowedBusinessIds: access.allowedBusinessIds,
      allowedLocations: access.allowedLocations,
    },
  });
}
