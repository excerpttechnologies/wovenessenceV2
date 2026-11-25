import { cookies } from 'next/headers';
import { isValidObjectId } from 'mongoose';
import dbConnect from './db';
import User from '@/models/User';
import { COOKIE, readSession } from './auth';

/* Every API route calls requireSession() first. Refresh the user's current
   role, businessId, locationIds, overrides, and active flag from MongoDB so
   that changes made by an administrator take effect immediately on the next
   authenticated request rather than waiting for a new login cookie. */

export async function requireSession() {
  const jar = await cookies();
  const session = readSession(jar.get(COOKIE)?.value);
  if (!session) return null;

  if (session.id && isValidObjectId(String(session.id))) {
    try {
      await dbConnect();
      const user = await User.findById(session.id)
        .select('name email role isActive businessId locationIds allow deny counterId')
        .lean();
      if (user) {
        if (user.isActive === false) return null;
        return {
          ...session,
          name: user.name ?? session.name,
          email: user.email ?? session.email,
          role: user.role ?? session.role,
          businessId: user.businessId ? String(user.businessId) : '',
          locationIds: (user.locationIds || []).map(String),
          allow: Array.isArray(user.allow) ? user.allow : [],
          deny: Array.isArray(user.deny) ? user.deny : [],
          counterId: user.counterId ? String(user.counterId) : '',
        };
      }
    } catch {
      /* fall back to signed session payload if transient DB lookup cannot run */
    }
  }

  return session;
}
