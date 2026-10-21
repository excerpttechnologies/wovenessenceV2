// 'use client';
// import { useEffect, useState } from 'react';
// import Icon from './Icon';

// export default function SignInForm() {
//   /* ?next= is read from the URL on mount rather than with useSearchParams(),
//      so this card renders in the server HTML instead of behind a Suspense
//      fallback - the form is visible before hydration. */
//   const [next, setNext] = useState('/admin');

//   useEffect(() => {
//     const q = new URLSearchParams(window.location.search).get('next');
//     if (q && q.startsWith('/admin')) setNext(q);
//   }, []);

//   const [email, setEmail] = useState('');
//   const [password, setPassword] = useState('');
//   const [show, setShow] = useState(false);
//   const [error, setError] = useState('');
//   const [busy, setBusy] = useState(false);

//   async function submit() {
//     setBusy(true);
//     setError('');
//     try {
//       const r = await fetch('/api/auth/login', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({ email, password }),
//       });
//       const d = await r.json();
//       if (!r.ok) { setError(d.error || 'Sign in failed.'); return; }
//       /* full navigation so middleware sees the fresh cookie */
//       window.location.href = next;
//     } catch {
//       setError('Could not reach the server.');
//     } finally {
//       setBusy(false);
//     }
//   }

//   const onKey = (e) => { if (e.key === 'Enter') submit(); };

//   return (
//     <div className="w-full max-w-[480px] rounded-2xl border border-white/10 bg-[#0f1621]/80 p-10 shadow-[0_20px_60px_rgba(0,0,0,.45)]">
//       <h1 className="text-[32px] font-bold text-white">Sign in</h1>
//       <p className="mt-1 text-[15px] text-[#8c9ab0]">Enter your credentials to access your workspace.</p>

//       {error && (
//         <div className="mt-5 rounded-lg border border-[#5b2b2b] bg-[#2a1618] px-3.5 py-2.5 text-[13px] text-[#f0a8a4]">
//           {error}
//         </div>
//       )}

//       <label className="mt-7 block text-[13px] font-bold text-[#c7d2e2]">Email</label>
//       <div className="mt-2 flex items-center gap-3">
//         <span className="text-[#7f8da3]"><Icon name="mail" size={18} /></span>
//         <input
//           type="email"
//           className="h-11 flex-1 rounded-md border border-white/10 bg-[#dfe6ef] px-3.5 text-[14px] text-[#1b2430] outline-none placeholder:text-[#8b97a8] focus:border-[#3b82f6]"
//           placeholder="you@company.com"
//           value={email}
//           onChange={(e) => setEmail(e.target.value)}
//           onKeyDown={onKey}
//           autoComplete="email"
//         />
//       </div>

//       <label className="mt-6 block text-[13px] font-bold text-[#c7d2e2]">Password</label>
//       <div className="mt-2 flex items-center gap-3 rounded-md border border-[#2c6bd8] bg-[#111a26] px-3.5">
//         <span className="text-[#7f8da3]"><Icon name="register" size={18} /></span>
//         <input
//           type={show ? 'text' : 'password'}
//           className="h-11 flex-1 border-0 bg-transparent text-[14px] text-white outline-none placeholder:text-[#6e7c92]"
//           placeholder="........"
//           value={password}
//           onChange={(e) => setPassword(e.target.value)}
//           onKeyDown={onKey}
//           autoComplete="current-password"
//         />
//         <button
//           type="button"
//           className="text-[#8c9ab0] hover:text-white"
//           onClick={() => setShow((s) => !s)}
//           aria-label={show ? 'Hide password' : 'Show password'}
//         >
//           <Icon name="eye" size={18} />
//         </button>
//       </div>

//       <button
//         type="button"
//         onClick={submit}
//         disabled={busy}
//         className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2f7df6] text-[16px] font-bold text-white hover:bg-[#2568d6] disabled:opacity-70"
//       >
//         {busy ? 'Signing in...' : <>Sign in <span aria-hidden="true">&rarr;</span></>}
//       </button>

//       <p className="mt-7 text-[13.5px] leading-relaxed text-[#7f8da3]">
//         Admin Portal access uses the same form &mdash; sign in with your super admin
//         credentials to reach global company management.
//       </p>
//     </div>
//   );
// }











"use client";
import { useEffect, useState } from "react";
import { Mail, Lock, Eye, EyeOff, LogIn } from "lucide-react";

export default function SignInForm() {
  /* ?next= is read from the URL on mount rather than with useSearchParams(),
     so this card renders in the server HTML instead of behind a Suspense
     fallback - the form is visible before hydration. */
  const [next, setNext] = useState("/admin");

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("next");
    if (q && q.startsWith("/admin")) setNext(q);
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d.error || "Sign in failed.");
        return;
      }
      /* full navigation so middleware sees the fresh cookie */
      window.location.href = next;
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  const onKey = (e) => {
    if (e.key === "Enter") submit();
  };

  return (
    <div className="w-full max-w-[480px]">
      {error && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          <span className="mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div className="space-y-5">
        <div>
          <label className="block text-[13px] font-medium text-slate-700">
            Email address
          </label>
          <div
            className={`mt-1.5 flex items-center gap-3 rounded-xl border bg-white px-4 transition-all duration-200 ${
              emailFocused
                ? "border-indigo-500 ring-2 ring-indigo-500/20"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <Mail className="h-4 w-4 text-slate-400" />
            <input
              type="email"
              className="h-11 w-full border-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={onKey}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              autoComplete="email"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="block text-[13px] font-medium text-slate-700">
              Password
            </label>
          </div>
          <div
            className={`mt-1.5 flex items-center gap-3 rounded-xl border bg-white px-4 transition-all duration-200 ${
              passwordFocused
                ? "border-indigo-500 ring-2 ring-indigo-500/20"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <Lock className="h-4 w-4 text-slate-400" />
            <input
              type={show ? "text" : "password"}
              className="h-11 w-full border-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={onKey}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="text-slate-400 transition-colors hover:text-slate-600"
              onClick={() => setShow((s) => !s)}
              aria-label={show ? "Hide password" : "Show password"}
            >
              {show ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={busy}
        className="group mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-[15px] font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
      >
        {busy ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
            Signing in...
          </>
        ) : (
          <>
            Sign in
            <LogIn className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </>
        )}
      </button>

      <div className="mt-6 text-center">
        <p className="text-[13.5px] leading-relaxed text-slate-500">
          Admin Portal access uses the same form — sign in with your super admin
          credentials to reach global company management.
        </p>
      </div>
    </div>
  );
}








