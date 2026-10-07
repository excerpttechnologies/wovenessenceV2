// import SignInForm from '@/components/SignInForm';

// export const metadata = { title: 'Sign in | GROO ERP' };

// /* Split sign-in screen: pitch panel on the left, credentials card on the right.
//    Rendered outside the admin shell - no sidebar, no top bar. */
// export default function LoginPage() {
//   return (
//     <div className="grid min-h-screen grid-cols-1 bg-[#0b1017] lg:grid-cols-2">
//       {/* ---------------------------------------------------- left panel -- */}
//       <div className="relative flex flex-col justify-between overflow-hidden border-r border-white/5 bg-gradient-to-br from-[#101b2a] via-[#0d1622] to-[#0b1017] px-10 py-12 lg:px-16">
//         <div className="flex items-center gap-3">
//           <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#c8a24a]/20 text-[10px] font-bold text-[#d8b563]">
//             OT
//           </span>
//           <span className="text-[22px] font-bold text-white">GROO ERP</span>
//         </div>

//         <div className="max-w-[560px]">
//           <span className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[.04] px-3 py-2 font-mono text-[12.5px] tracking-wide text-[#5b9bf8]">
//             <span aria-hidden="true">&#9776;</span> 184,208 SKUS TRACKED LIVE
//           </span>

//           <h2 className="mt-8 text-[30px] font-bold leading-tight text-white">
//             Every SKU, sale and shelf &mdash; tracked in real time.
//           </h2>

//           <p className="mt-5 max-w-[520px] text-[16px] leading-relaxed text-[#8c9ab0]">
//             Inventory, POS, CRM and finance running on one live operational
//             picture of your retail business.
//           </p>

//           <ul className="mt-9 space-y-3.5">
//             {['Live sync across every register',
//               'One source of truth, every store',
//               'Role-based access, built in'].map((t) => (
//               <li key={t} className="flex items-center gap-3 text-[15.5px] text-[#dbe3ee]">
//                 <span className="text-[#3b82f6]" aria-hidden="true">&#10003;</span> {t}
//               </li>
//             ))}
//           </ul>
//         </div>

//         <p className="font-mono text-[13px] text-[#5d6a7e]">v1.0.0 &middot; Enterprise Retail Platform</p>
//       </div>

//       {/* --------------------------------------------------- right panel -- */}
//       <div className="flex items-center justify-center bg-[#0c1219] px-6 py-16">
//         <SignInForm />
//       </div>
//     </div>
//   );
// }












import SignInForm from "@/components/SignInForm";

export const metadata = { title: "Sign in | GROO ERP" };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-2">
      {/* ---------------------------------------------------- left panel -- */}
      <div className="relative flex flex-col justify-between overflow-hidden bg-gradient-to-br from-[#fcfcff] via-[#faf9ff] to-[#f5f3ff] px-8 py-10 lg:px-14">
        {/* Animated gradient orbs */}
        <div className="animate-float absolute -right-32 -top-32 h-96 w-96 rounded-full bg-purple-200/20 blur-3xl" />
        <div className="animate-float-delayed absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-indigo-200/15 blur-3xl" />
        <div className="animate-pulse-slow absolute left-1/3 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-purple-100/15 blur-3xl" />

        {/* Animated dot pattern */}
        <div
          className="absolute inset-0 opacity-[0.06] animate-pattern"
          style={{
            backgroundImage:
              "radial-gradient(circle, #7c3aed 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        />

        {/* Content - positioned above dashboard preview */}
        <div className="relative z-10 flex-1">
          {/* Logo with hover effect */}
          <div className="group flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg shadow-purple-500/25 transition-all duration-300 group-hover:scale-110 group-hover:shadow-purple-500/40">
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5 text-white transition-transform duration-300 group-hover:rotate-12"
                fill="none"
              >
                <path
                  d="M12 3a9 9 0 1 0 9 9"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                />
                <path d="M17 3.5 15 7l3.9-.6z" fill="currentColor" />
              </svg>
            </div>
            <span className="text-2xl font-bold text-slate-900 tracking-tight">
              GROO{" "}
              <span className="bg-gradient-to-r from-purple-600 to-indigo-600 bg-clip-text text-transparent">
                ERP
              </span>
            </span>
          </div>

          {/* Status badge with pulse animation */}
          <div className="group mt-8">
            <span className="inline-flex items-center gap-2.5 rounded-full border border-emerald-100 bg-white/80 px-4 py-1.5 text-xs font-medium tracking-wide text-emerald-700 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-emerald-500/20 hover:border-emerald-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              184,208 SKUS TRACKED LIVE
            </span>
          </div>

          {/* Hero heading with animated gradient */}
          <h2 className="mt-7 uppercase mb-3 max-w-[520px] text-4xl font-bold leading-[1.1] whitespace-nowrap tracking-tight text-slate-900 lg:text-5xl">
            Every SKU, sale <br /> and shelf
            <br />
            <span className="bg-gradient-to-r from-violet-600 via-indigo-500 to-blue-500 bg-clip-text text-transparent animate-gradient bg-[length:200%_auto] ">
              tracked in real time.
            </span>
          </h2>

          {/* Description with fade-in animation */}
          <p className="mt-5 max-w-[480px] text-base leading-relaxed text-slate-500 animate-fade-in">
            Inventory, POS, CRM and finance running on one live operational
            picture of your retail business.
          </p>

          {/* Feature points with staggered animation */}
          <ul className="mt-8 space-y-3">
            {[
              "Live sync across every register",
              "One source of truth, every store",
              "Role-based access, built in",
            ].map((text, index) => (
              <li
                key={text}
                className="group flex items-center gap-3 text-sm text-slate-700 transition-all duration-300 hover:translate-x-1"
                style={{ animationDelay: `${index * 150}ms` }}
              >
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 transition-all duration-300 group-hover:scale-110 group-hover:bg-purple-200">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>

        {/* Dashboard preview with enhanced hover effects */}
        <div className="relative z-10 mt-8 w-full max-w-2xl group/preview">
          <div className="rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-xl shadow-purple-500/5 backdrop-blur-sm rotate-[-2deg] hover:rotate-0 transition-all duration-700 group-hover/preview:shadow-2xl group-hover/preview:shadow-purple-500/10 group-hover/preview:scale-[1.02]">
            {/* Dashboard header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-100 transition-colors group-hover/preview:bg-purple-200">
                  <div className="h-3 w-3 rounded-full bg-purple-600" />
                </div>
                <span className="text-xs font-semibold text-slate-700">
                  Dashboard
                </span>
              </div>
              <div className="flex gap-1">
                <div className="h-1.5 w-1.5 rounded-full bg-slate-300 transition-all hover:bg-slate-400" />
                <div className="h-1.5 w-1.5 rounded-full bg-slate-300 transition-all hover:bg-slate-400" />
                <div className="h-1.5 w-1.5 rounded-full bg-slate-300 transition-all hover:bg-slate-400" />
              </div>
            </div>

            {/* Stats cards with hover effects */}
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[
                { label: "Total Sales", value: "₹ 8,62,325", change: "+12.5%" },
                { label: "Orders", value: "2,450", change: "+8.2%" },
                { label: "Low Stock", value: "128", change: "-5.4%" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-lg border border-slate-100 bg-white p-2.5 transition-all duration-300 hover:shadow-md hover:border-purple-200 hover:bg-purple-50/30"
                >
                  <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
                    {stat.label}
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    {stat.value}
                  </p>
                  <p
                    className={`text-[9px] font-medium ${
                      stat.change.startsWith("+")
                        ? "text-emerald-600"
                        : "text-red-500"
                    }`}
                  >
                    {stat.change}
                  </p>
                </div>
              ))}
            </div>

            {/* Charts area with animated bars */}
            <div className="mt-2.5 grid grid-cols-3 gap-2">
              <div className="col-span-2 rounded-lg border border-slate-100 bg-white p-2.5 transition-all hover:shadow-md hover:border-purple-200">
                <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
                  Sales Overview
                </p>
                <div className="mt-1.5 flex items-end gap-0.5 h-8">
                  {[30, 45, 35, 55, 40, 60, 50, 45, 65, 55, 70, 60].map(
                    (height, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm bg-gradient-to-t from-purple-400 to-indigo-400 transition-all duration-500 hover:opacity-80"
                        style={{
                          height: `${height}%`,
                          animationDelay: `${i * 50}ms`,
                        }}
                      />
                    ),
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-slate-100 bg-white p-2.5 transition-all hover:shadow-md hover:border-purple-200">
                <p className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
                  Categories
                </p>
                <div className="mt-1.5 flex items-center justify-center h-8">
                  <div className="relative h-8 w-8">
                    <svg
                      viewBox="0 0 32 32"
                      className="h-8 w-8 -rotate-90 transition-transform hover:rotate-0 duration-500"
                    >
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth="3"
                        strokeDasharray="25 50"
                        className="transition-all hover:stroke-purple-500"
                      />
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        fill="none"
                        stroke="#6366f1"
                        strokeWidth="3"
                        strokeDasharray="15 50"
                        strokeDashoffset="-25"
                        className="transition-all hover:stroke-indigo-500"
                      />
                      <circle
                        cx="16"
                        cy="16"
                        r="12"
                        fill="none"
                        stroke="#8b5cf6"
                        strokeWidth="3"
                        strokeDasharray="10 50"
                        strokeDashoffset="-40"
                        className="transition-all hover:stroke-purple-400"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom nav with hover effects */}
            <div className="mt-2.5 flex items-center gap-3 border-t border-slate-100 pt-2.5">
              {["Home", "Sales", "Inventory", "Analytics"].map((item) => (
                <span
                  key={item}
                  className="text-[8px] font-medium uppercase tracking-wider text-slate-400 transition-all hover:text-purple-600 hover:scale-110 cursor-pointer"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Version with subtle animation */}
        <p className="relative z-10 mt-4 font-mono text-[11px] text-slate-400 animate-pulse-slow">
          v1.0.0 · Enterprise Retail Platform
        </p>
      </div>

      {/* --------------------------------------------------- right panel -- */}
      <div className="relative flex items-center justify-center bg-white px-6 py-16">
        {/* Subtle background pattern with animation */}
        <div
          className="absolute inset-0 opacity-[0.03] animate-pattern-slow"
          style={{
            backgroundImage:
              "radial-gradient(circle, #7c3aed 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />

        <div className="relative z-10 w-full max-w-md">
          <div className="rounded-3xl border border-slate-200/60 bg-white/95 p-8 shadow-[0_20px_60px_-20px_rgba(79,70,229,0.15)] backdrop-blur-sm transition-all duration-500 hover:shadow-[0_30px_80px_-20px_rgba(79,70,229,0.25)] lg:p-10">
            {/* Card header with animation */}
            <div className="mb-8 text-center">
              <div className="group mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-50 shadow-sm shadow-purple-500/10 transition-all duration-300 hover:scale-110 hover:shadow-purple-500/20">
                <svg
                  viewBox="0 0 24 24"
                  className="h-7 w-7 text-purple-600 transition-transform duration-300 group-hover:rotate-12"
                  fill="none"
                >
                  <path
                    d="M12 3a9 9 0 1 0 9 9"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                  <path d="M17 3.5 15 7l3.9-.6z" fill="currentColor" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">
                Welcome back
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 transition-all hover:text-slate-600">
                Sign in to your account to continue
              </p>
            </div>

            {/* Enhanced SignInForm with animation */}
            <div className="animate-slide-up">
              <SignInForm />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
