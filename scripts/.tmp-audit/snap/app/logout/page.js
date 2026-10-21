'use client';
import { useEffect } from 'react';

/* The sidebar's Logout item lands here: clear the cookie, then bounce to /login. */
export default function LogoutPage() {
  useEffect(() => {
    fetch('/api/auth/logout', { method: 'POST' })
      .finally(() => { window.location.href = '/login'; });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0b1017] text-[#8c9ab0]">
      Signing out...
    </div>
  );
}
