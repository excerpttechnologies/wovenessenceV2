// // // 'use client';
// // // import { useEffect, useState } from 'react';
// // // import Icon from './Icon';

// // // export default function SignInForm() {
// // //   /* ?next= is read from the URL on mount rather than with useSearchParams(),
// // //      so this card renders in the server HTML instead of behind a Suspense
// // //      fallback - the form is visible before hydration. */
// // //   const [next, setNext] = useState('/admin');

// // //   useEffect(() => {
// // //     const q = new URLSearchParams(window.location.search).get('next');
// // //     if (q && q.startsWith('/admin')) setNext(q);
// // //   }, []);

// // //   const [email, setEmail] = useState('');
// // //   const [password, setPassword] = useState('');
// // //   const [show, setShow] = useState(false);
// // //   const [error, setError] = useState('');
// // //   const [busy, setBusy] = useState(false);

// // //   async function submit() {
// // //     setBusy(true);
// // //     setError('');
// // //     try {
// // //       const r = await fetch('/api/auth/login', {
// // //         method: 'POST',
// // //         headers: { 'Content-Type': 'application/json' },
// // //         body: JSON.stringify({ email, password }),
// // //       });
// // //       const d = await r.json();
// // //       if (!r.ok) { setError(d.error || 'Sign in failed.'); return; }
// // //       /* full navigation so middleware sees the fresh cookie */
// // //       window.location.href = next;
// // //     } catch {
// // //       setError('Could not reach the server.');
// // //     } finally {
// // //       setBusy(false);
// // //     }
// // //   }

// // //   const onKey = (e) => { if (e.key === 'Enter') submit(); };

// // //   return (
// // //     <div className="w-full max-w-[480px] rounded-2xl border border-white/10 bg-[#0f1621]/80 p-10 shadow-[0_20px_60px_rgba(0,0,0,.45)]">
// // //       <h1 className="text-[32px] font-bold text-white">Sign in</h1>
// // //       <p className="mt-1 text-[15px] text-[#8c9ab0]">Enter your credentials to access your workspace.</p>

// // //       {error && (
// // //         <div className="mt-5 rounded-lg border border-[#5b2b2b] bg-[#2a1618] px-3.5 py-2.5 text-[13px] text-[#f0a8a4]">
// // //           {error}
// // //         </div>
// // //       )}

// // //       <label className="mt-7 block text-[13px] font-bold text-[#c7d2e2]">Email</label>
// // //       <div className="mt-2 flex items-center gap-3">
// // //         <span className="text-[#7f8da3]"><Icon name="mail" size={18} /></span>
// // //         <input
// // //           type="email"
// // //           className="h-11 flex-1 rounded-md border border-white/10 bg-[#dfe6ef] px-3.5 text-[14px] text-[#1b2430] outline-none placeholder:text-[#8b97a8] focus:border-[#3b82f6]"
// // //           placeholder="you@company.com"
// // //           value={email}
// // //           onChange={(e) => setEmail(e.target.value)}
// // //           onKeyDown={onKey}
// // //           autoComplete="email"
// // //         />
// // //       </div>

// // //       <label className="mt-6 block text-[13px] font-bold text-[#c7d2e2]">Password</label>
// // //       <div className="mt-2 flex items-center gap-3 rounded-md border border-[#2c6bd8] bg-[#111a26] px-3.5">
// // //         <span className="text-[#7f8da3]"><Icon name="register" size={18} /></span>
// // //         <input
// // //           type={show ? 'text' : 'password'}
// // //           className="h-11 flex-1 border-0 bg-transparent text-[14px] text-white outline-none placeholder:text-[#6e7c92]"
// // //           placeholder="........"
// // //           value={password}
// // //           onChange={(e) => setPassword(e.target.value)}
// // //           onKeyDown={onKey}
// // //           autoComplete="current-password"
// // //         />
// // //         <button
// // //           type="button"
// // //           className="text-[#8c9ab0] hover:text-white"
// // //           onClick={() => setShow((s) => !s)}
// // //           aria-label={show ? 'Hide password' : 'Show password'}
// // //         >
// // //           <Icon name="eye" size={18} />
// // //         </button>
// // //       </div>

// // //       <button
// // //         type="button"
// // //         onClick={submit}
// // //         disabled={busy}
// // //         className="mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#2f7df6] text-[16px] font-bold text-white hover:bg-[#2568d6] disabled:opacity-70"
// // //       >
// // //         {busy ? 'Signing in...' : <>Sign in <span aria-hidden="true">&rarr;</span></>}
// // //       </button>

// // //       <p className="mt-7 text-[13.5px] leading-relaxed text-[#7f8da3]">
// // //         Admin Portal access uses the same form &mdash; sign in with your super admin
// // //         credentials to reach global company management.
// // //       </p>
// // //     </div>
// // //   );
// // // }











// // "use client";
// // import { useEffect, useState } from "react";
// // import { Mail, Lock, Eye, EyeOff, LogIn } from "lucide-react";

// // export default function SignInForm() {
// //   /* ?next= is read from the URL on mount rather than with useSearchParams(),
// //      so this card renders in the server HTML instead of behind a Suspense
// //      fallback - the form is visible before hydration. */
// //   const [next, setNext] = useState("/admin");

// //   useEffect(() => {
// //     const q = new URLSearchParams(window.location.search).get("next");
// //     if (q && q.startsWith("/admin")) setNext(q);
// //   }, []);

// //   const [email, setEmail] = useState("");
// //   const [password, setPassword] = useState("");
// //   const [show, setShow] = useState(false);
// //   const [error, setError] = useState("");
// //   const [busy, setBusy] = useState(false);
// //   const [emailFocused, setEmailFocused] = useState(false);
// //   const [passwordFocused, setPasswordFocused] = useState(false);

// //   async function submit() {
// //     setBusy(true);
// //     setError("");
// //     try {
// //       const r = await fetch("/api/auth/login", {
// //         method: "POST",
// //         headers: { "Content-Type": "application/json" },
// //         body: JSON.stringify({ email, password }),
// //       });
// //       const d = await r.json();
// //       if (!r.ok) {
// //         setError(d.error || "Sign in failed.");
// //         return;
// //       }
// //       /* full navigation so middleware sees the fresh cookie */
// //       window.location.href = next;
// //     } catch {
// //       setError("Could not reach the server.");
// //     } finally {
// //       setBusy(false);
// //     }
// //   }

// //   const onKey = (e) => {
// //     if (e.key === "Enter") submit();
// //   };

// //   return (
// //     <div className="w-full max-w-[480px]">
// //       {error && (
// //         <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
// //           <span className="mt-0.5">⚠️</span>
// //           <span>{error}</span>
// //         </div>
// //       )}

// //       <div className="space-y-5">
// //         <div>
// //           <label className="block text-[13px] font-medium text-slate-700">
// //             Email address
// //           </label>
// //           <div
// //             className={`mt-1.5 flex items-center gap-3 rounded-xl border bg-white px-4 transition-all duration-200 ${
// //               emailFocused
// //                 ? "border-indigo-500 ring-2 ring-indigo-500/20"
// //                 : "border-slate-200 hover:border-slate-300"
// //             }`}
// //           >
// //             <Mail className="h-4 w-4 text-slate-400" />
// //             <input
// //               type="email"
// //               className="h-11 w-full border-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
// //               placeholder="you@company.com"
// //               value={email}
// //               onChange={(e) => setEmail(e.target.value)}
// //               onKeyDown={onKey}
// //               onFocus={() => setEmailFocused(true)}
// //               onBlur={() => setEmailFocused(false)}
// //               autoComplete="email"
// //             />
// //           </div>
// //         </div>

// //         <div>
// //           <div className="flex items-center justify-between">
// //             <label className="block text-[13px] font-medium text-slate-700">
// //               Password
// //             </label>
// //           </div>
// //           <div
// //             className={`mt-1.5 flex items-center gap-3 rounded-xl border bg-white px-4 transition-all duration-200 ${
// //               passwordFocused
// //                 ? "border-indigo-500 ring-2 ring-indigo-500/20"
// //                 : "border-slate-200 hover:border-slate-300"
// //             }`}
// //           >
// //             <Lock className="h-4 w-4 text-slate-400" />
// //             <input
// //               type={show ? "text" : "password"}
// //               className="h-11 w-full border-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
// //               placeholder="Enter your password"
// //               value={password}
// //               onChange={(e) => setPassword(e.target.value)}
// //               onKeyDown={onKey}
// //               onFocus={() => setPasswordFocused(true)}
// //               onBlur={() => setPasswordFocused(false)}
// //               autoComplete="current-password"
// //             />
// //             <button
// //               type="button"
// //               className="text-slate-400 transition-colors hover:text-slate-600"
// //               onClick={() => setShow((s) => !s)}
// //               aria-label={show ? "Hide password" : "Show password"}
// //             >
// //               {show ? (
// //                 <EyeOff className="h-4 w-4" />
// //               ) : (
// //                 <Eye className="h-4 w-4" />
// //               )}
// //             </button>
// //           </div>
// //         </div>
// //       </div>

// //       <button
// //         type="button"
// //         onClick={submit}
// //         disabled={busy}
// //         className="group mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 text-[15px] font-bold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/40 hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
// //       >
// //         {busy ? (
// //           <>
// //             <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
// //             Signing in...
// //           </>
// //         ) : (
// //           <>
// //             Sign in
// //             <LogIn className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
// //           </>
// //         )}
// //       </button>

// //       <div className="mt-6 text-center">
// //         <p className="text-[13.5px] leading-relaxed text-slate-500">
// //           Admin Portal access uses the same form — sign in with your super admin
// //           credentials to reach global company management.
// //         </p>
// //       </div>
// //     </div>
// //   );
// // }












// "use client";
// import { useEffect, useState } from "react";
// import { Mail, Lock, Eye, EyeOff, LogIn } from "lucide-react";

// export default function SignInForm() {
//   /* ?next= is read from the URL on mount rather than with useSearchParams(),
//      so this card renders in the server HTML instead of behind a Suspense
//      fallback - the form is visible before hydration. */
//   const [next, setNext] = useState("/admin");

//   useEffect(() => {
//     const q = new URLSearchParams(window.location.search).get("next");
//     if (q && q.startsWith("/admin")) setNext(q);
//   }, []);

//   const [email, setEmail] = useState("");
//   const [password, setPassword] = useState("");
//   const [show, setShow] = useState(false);
//   const [error, setError] = useState("");
//   const [busy, setBusy] = useState(false);
//   const [emailFocused, setEmailFocused] = useState(false);
//   const [passwordFocused, setPasswordFocused] = useState(false);

//   async function submit() {
//     const normalizedEmail = email.trim();
//     if (busy) return;
//     if (!normalizedEmail || !password) {
//       setError("Enter your email and password.");
//       return;
//     }

//     setBusy(true);
//     setError("");
//     try {
//       const r = await fetch("/api/auth/login", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ email: normalizedEmail, password }),
//       });
//       const d = await r.json();
//       if (!r.ok) {
//         setError(d.error || "Sign in failed.");
//         return;
//       }
//       /* full navigation so middleware sees the fresh cookie */
//       window.location.href = next;
//     } catch {
//       setError("Could not reach the server.");
//     } finally {
//       setBusy(false);
//     }
//   }

//   const onKey = (e) => {
//     if (e.key === "Enter") submit();
//   };

//   return (
//     <div className="w-full max-w-[480px]">
//       {error && (
//         <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
//           <span className="mt-0.5">⚠️</span>
//           <span>{error}</span>
//         </div>
//       )}

//       <div className="space-y-5">
//         <div>
//           <label className="block text-[13px] font-medium text-slate-700">
//             Email address
//           </label>
//           <div
//             className={`mt-1.5 flex items-center gap-3 rounded-xl border bg-white px-4 transition-all duration-200 ${
//               emailFocused
//                 ? "border-emerald-500 ring-2 ring-emerald-500/20"
//                 : "border-slate-200 hover:border-slate-300"
//             }`}
//           >
//             <Mail className="h-4 w-4 text-slate-400" />
//             <input
//               type="email"
//               className="h-11 w-full border-0 bg-transparent text-[14px] !uppercase text-slate-900 outline-none placeholder:normal-case placeholder:text-slate-400"
//               placeholder="you@company.com"
//               value={email}
//               onChange={(e) => setEmail(e.target.value)}
//               onKeyDown={onKey}
//               onFocus={() => setEmailFocused(true)}
//               onBlur={() => setEmailFocused(false)}
//               autoComplete="email"
//             />
//           </div>
//         </div>

//         <div>
//           <div className="flex items-center justify-between">
//             <label className="block text-[13px] font-medium text-slate-700">
//               Password
//             </label>
//           </div>
//           <div
//             className={`mt-1.5 flex items-center gap-3 rounded-xl border bg-white px-4 transition-all duration-200 ${
//               passwordFocused
//                 ? "border-emerald-500 ring-2 ring-emerald-500/20"
//                 : "border-slate-200 hover:border-slate-300"
//             }`}
//           >
//             <Lock className="h-4 w-4 text-slate-400" />
//             <input
//               type={show ? "text" : "password"}
//               className="h-11 w-full border-0 bg-transparent text-[14px] !uppercase text-slate-900 outline-none placeholder:normal-case placeholder:text-slate-400"
//               placeholder="Enter your password"
//               value={password}
//               onChange={(e) => setPassword(e.target.value)}
//               onKeyDown={onKey}
//               onFocus={() => setPasswordFocused(true)}
//               onBlur={() => setPasswordFocused(false)}
//               autoComplete="current-password"
//             />
//             <button
//               type="button"
//               className="text-slate-400 transition-colors hover:text-slate-600"
//               onClick={() => setShow((s) => !s)}
//               aria-label={show ? "Hide password" : "Show password"}
//             >
//               {show ? (
//                 <EyeOff className="h-4 w-4" />
//               ) : (
//                 <Eye className="h-4 w-4" />
//               )}
//             </button>
//           </div>
//         </div>
//       </div>

//       <button
//         type="button"
//         onClick={submit}
//         disabled={busy}
//         className="group mt-8 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-[15px] font-bold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/40 hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
//       >
//         {busy ? (
//           <>
//             <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
//             Signing in...
//           </>
//         ) : (
//           <>
//             Sign in
//             <LogIn className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
//           </>
//         )}
//       </button>

//       <div className="mt-6 text-center">
//         <p className="text-[13.5px] leading-relaxed text-slate-500">
//           Admin Portal access uses the same form — sign in with your super admin
//           credentials to reach global company management.
//         </p>
//       </div>
//     </div>
//   );
// }










"use client";
import { useEffect, useState } from "react";
import { Mail, Lock, Eye, EyeOff, LogIn, Phone, ArrowRight, RefreshCw } from "lucide-react";

/* Labelled input: label above, icon inside, green ring on focus. */
function Field({ label, placeholder, icon: Icon, type = "text", value, onChange, onKeyDown, autoComplete, right }) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label className="mb-1.5 block text-[13.5px] font-semibold text-slate-800">{label}</label>
      <div
        className={`flex h-11 items-center gap-3 rounded-lg border bg-white px-3.5 transition-all duration-200 ${
          focused
            ? "border-emerald-600 shadow-[0_0_0_4px_rgba(5,150,105,.12)]"
            : "border-slate-200 hover:border-slate-300"
        }`}
      >
        <Icon className={`h-[18px] w-[18px] shrink-0 transition-colors ${focused ? "text-emerald-700" : "text-slate-400"}`} />
        <input
          type={type}
          className="h-full w-full border-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400 [&:-webkit-autofill]:[-webkit-box-shadow:0_0_0_1000px_#fff_inset]"
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
        />
        {right}
      </div>
    </div>
  );
}

export default function SignInForm() {
  /* ?next= is read from the URL on mount rather than with useSearchParams(),
     so this card renders in the server HTML instead of behind a Suspense
     fallback - the form is visible before hydration. */
  const [next, setNext] = useState("/admin");
  const [loginMethod, setLoginMethod] = useState("email"); // 'email' or 'otp'

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("next");
    if (q && q.startsWith("/admin")) setNext(q);
  }, []);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown timer for OTP resend
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown((c) => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);

  // Email/Password login
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

  // Request OTP for admin login
  async function requestOtp() {
    if (busy) return;
    
    const phoneDigits = phone.replace(/\D/g, '');
    if (!phoneDigits || phoneDigits.length < 10) {
      setError('Enter a valid 10-digit phone number');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/auth/admin/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phoneDigits }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to send OTP');
        if (data.cooldownSeconds) {
          setResendCooldown(data.cooldownSeconds);
        }
        return;
      }

      setOtpSent(true);
      setResendCooldown(60);
      setError('');
    } catch (err) {
      setError('Could not reach the server. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  // Verify OTP for admin login
  async function verifyOtp() {
    if (busy) return;
    
    if (!otp || otp.length !== 6) {
      setError('Enter the 6-digit OTP');
      return;
    }

    setBusy(true);
    setError('');

    try {
      const res = await fetch('/api/auth/admin/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone.replace(/\D/g, ''),
          otp: otp,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Invalid OTP');
        return;
      }

      // Success - redirect
      window.location.href = next;
    } catch (err) {
      setError('Could not reach the server. Please check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const onKey = (e) => {
    if (e.key === "Enter") {
      if (loginMethod === 'email') {
        submit();
      } else if (loginMethod === 'otp') {
        if (otpSent) verifyOtp();
        else requestOtp();
      }
    }
  };

  return (
    <div className="w-full max-w-[480px]">
      {error && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          <span className="mt-0.5">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      {/* Login Method Toggle */}
      <div className="mb-5 flex gap-2 rounded-lg bg-slate-100 p-1">
        <button
          type="button"
          onClick={() => {
            setLoginMethod('email');
            setError('');
            setOtpSent(false);
          }}
          className={`flex-1 rounded-md px-4 py-2 text-[13px] font-semibold transition-all ${
            loginMethod === 'email'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Mail className="mx-auto mb-1 h-4 w-4" />
          Email / Password
        </button>
        <button
          type="button"
          onClick={() => {
            setLoginMethod('otp');
            setError('');
          }}
          className={`flex-1 rounded-md px-4 py-2 text-[13px] font-semibold transition-all ${
            loginMethod === 'otp'
              ? 'bg-white text-emerald-700 shadow-sm'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Phone className="mx-auto mb-1 h-4 w-4" />
          WhatsApp OTP
        </button>
      </div>

      {loginMethod === 'email' ? (
        /* Email/Password Login */
        <div className="space-y-4">
          <Field
            label="Email address"
            placeholder="Enter your email address"
            icon={Mail}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={onKey}
            autoComplete="email"
          />
          <Field
            label="Password"
            placeholder="Enter your password"
            icon={Lock}
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={onKey}
            autoComplete="current-password"
            right={
              <button
                type="button"
                className="text-slate-400 transition-colors hover:text-slate-600"
                onClick={() => setShow((s) => !s)}
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            }
          />

          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="group mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-800 to-teal-700 text-[15px] font-bold text-white shadow-lg shadow-emerald-900/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-900/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] disabled:opacity-70 disabled:hover:translate-y-0"
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
        </div>
      ) : !otpSent ? (
        /* Phone Number Entry for OTP */
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-[13.5px] font-semibold text-slate-800">
              Phone Number
            </label>
            <div className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 transition-all focus-within:border-emerald-600 focus-within:shadow-[0_0_0_4px_rgba(5,150,105,.12)] hover:border-slate-300">
              <Phone className="h-[18px] w-[18px] shrink-0 text-slate-400" />
              <span className="text-[14px] font-medium text-slate-600">+91</span>
              <input
                type="tel"
                className="h-full w-full border-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
                placeholder="98765 43210"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onKeyDown={onKey}
                maxLength={10}
                autoFocus
              />
            </div>
          </div>

          <button
            type="button"
            onClick={requestOtp}
            disabled={busy || resendCooldown > 0}
            className="group mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-800 to-teal-700 text-[15px] font-bold text-white shadow-lg shadow-emerald-900/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-900/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Sending OTP...
              </>
            ) : resendCooldown > 0 ? (
              <>Wait {resendCooldown}s</>
            ) : (
              <>
                Send OTP
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </>
            )}
          </button>

          <p className="mt-4 text-center text-[12.5px] text-slate-500">
            You'll receive a 6-digit OTP on WhatsApp
          </p>
        </div>
      ) : (
        /* OTP Verification */
        <div className="space-y-4">
          <button
            type="button"
            onClick={() => {
              setOtpSent(false);
              setOtp('');
              setError('');
            }}
            className="mb-4 text-[13px] font-medium text-emerald-700 hover:text-emerald-800"
          >
            ← Change number
          </button>

          <div>
            <label className="mb-1.5 block text-[13.5px] font-semibold text-slate-800">
              6-Digit OTP
            </label>
            <p className="mb-2 text-[12.5px] text-slate-600">
              Sent to +91 {phone.slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2')}
            </p>
            <div className="flex h-11 items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 transition-all focus-within:border-emerald-600 focus-within:shadow-[0_0_0_4px_rgba(5,150,105,.12)] hover:border-slate-300">
              <Lock className="h-[18px] w-[18px] shrink-0 text-slate-400" />
              <input
                type="text"
                inputMode="numeric"
                className="h-full w-full border-0 bg-transparent text-[16px] font-semibold tracking-[0.3em] text-slate-900 outline-none placeholder:tracking-normal placeholder:font-normal placeholder:text-slate-400"
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={onKey}
                maxLength={6}
                autoFocus
              />
            </div>
          </div>

          <button
            type="button"
            onClick={verifyOtp}
            disabled={busy || otp.length !== 6}
            className="group mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-800 to-teal-700 text-[15px] font-bold text-white shadow-lg shadow-emerald-900/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-900/40 hover:-translate-y-0.5 active:translate-y-0 active:scale-[.99] disabled:opacity-60 disabled:hover:translate-y-0"
          >
            {busy ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Verifying...
              </>
            ) : (
              <>
                Verify & Login
                <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
              </>
            )}
          </button>

          {/* Resend button */}
          <div className="mt-4 text-center">
            {resendCooldown > 0 ? (
              <p className="text-[13px] text-slate-500">
                Resend OTP in {resendCooldown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setOtp('');
                  setError('');
                  requestOtp();
                }}
                disabled={busy}
                className="inline-flex items-center gap-2 text-[13px] font-medium text-emerald-700 hover:text-emerald-800 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Resend OTP
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-5 text-center">
        <p className="text-[12.5px] leading-relaxed text-slate-500">
          Admin Portal access uses the same form — sign in with your super admin
          credentials to reach global company management.
        </p>
      </div>
    </div>
  );
}










