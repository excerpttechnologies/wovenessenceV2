'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { LuShieldAlert } from 'react-icons/lu';
import { NAV } from '@/config/nav';
import { filterNavItems, screenEntryForPath } from '@/lib/navRegistry';
import { useScope } from './ScopeContext';

const NAV_MAIN = NAV.filter((n) => n.href !== '/logout');

function firstAccessibleLink(items) {
  for (const item of items || []) {
    if (item.href && (!item.children || item.children.length === 0)) {
      return { href: item.href, label: item.label };
    }
    if (Array.isArray(item.children) && item.children.length > 0) {
      const child = firstAccessibleLink(item.children);
      if (child) return child;
    }
    if (item.href) return { href: item.href, label: item.label };
  }
  return null;
}

/* Blocks direct URL navigation to any /admin screen when the signed-in user's
   role does not hold READ permission for it, preventing restricted pages from
   mounting or firing data requests. */
export default function AdminAccessGuard({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, userReady, perms, permsReady, can } = useScope();

  const isSuperAdmin = user?.role === 'Super Admin';
  const isAdminUser = isSuperAdmin || user?.role === 'Admin';
  const ready = userReady && (isSuperAdmin || permsReady);
  const needsAssignment = !isSuperAdmin && Boolean(user?.needsAssignment);
  const isAdminRoot = pathname === '/admin' || pathname === '/admin/';

  const entry = useMemo(() => screenEntryForPath(pathname), [pathname]);

  const allowed = useMemo(() => {
    if (!ready) return false;
    if (needsAssignment) return false;
    if (!entry) return true;
    if (entry.superAdminOnly && !isSuperAdmin) return false;
    if (entry.adminOnly && !isAdminUser) return false;
    if (Array.isArray(entry.anyOf) && entry.anyOf.length > 0) {
      return entry.anyOf.some((href) => can(href, 'read'));
    }
    if (entry.href) {
      return can(entry.href, 'read');
    }
    return true;
  }, [ready, needsAssignment, entry, isSuperAdmin, isAdminUser, can, perms]);

  const fallback = useMemo(() => {
    if (!ready || allowed || needsAssignment) return null;
    const visible = filterNavItems(NAV_MAIN, { can, user, isAdminUser });
    return firstAccessibleLink(visible);
  }, [ready, allowed, needsAssignment, can, user, isAdminUser, perms]);

  const shouldRedirectRoot = Boolean(
    ready && isAdminRoot && !allowed && !needsAssignment && fallback && fallback !== '/admin',
  );

  useEffect(() => {
    if (shouldRedirectRoot) {
      router.replace(fallback);
    }
  }, [shouldRedirectRoot, fallback, router]);

  if (!ready || shouldRedirectRoot) {
    return (
      <div className="flex min-h-[240px] items-center justify-center p-8 text-sm text-inkmuted">
        {shouldRedirectRoot ? 'Redirecting…' : 'Checking permissions…'}
      </div>
    );
  }

  if (needsAssignment) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-danger/30 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fdf1f1] text-danger">
            <LuShieldAlert size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-ink">Business &amp; Location Assignment Required</h2>
            <p className="mt-1 text-sm text-inkmuted">
              Your account (<b>{user?.email}</b>) does not have a valid Business and Location assigned yet.
              Please ask a <b>Super Admin</b> to assign your Business and Location in{' '}
              <b>Staff Management &gt; Roles &amp; Permissions &gt; Users</b>.
            </p>
            <div className="mt-4">
              <Link href="/logout" className="btn btn-primary">
                Logout
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto mt-10 max-w-lg rounded-xl border border-danger/30 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#fdf1f1] text-danger">
            <LuShieldAlert size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-ink">Access Denied</h2>
            <p className="mt-1 text-sm text-inkmuted">
              Your role ({user?.role || 'Unknown'}) does not have <b>Read</b> permission
              to view this screen. Ask an administrator to grant access in{' '}
              <b>Staff Management &gt; Roles &amp; Permissions</b>.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {fallback ? (
                <Link href={fallback.href} className="btn btn-primary">
                  Go to {fallback.label}
                </Link>
              ) : (
                <Link href="/logout" className="btn btn-primary">
                  Sign Out
                </Link>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
