// import { redirect } from 'next/navigation';

// /* /admin is gated by middleware.js, which bounces signed-out visitors to /login. */
// export default function Home() {
//   redirect('/admin');
// }




"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useMotionValue } from "motion/react";
import {
  ShoppingCart,
  BarChart3,
  Box,
  ShoppingBag,
  Users,
  IndianRupee,
  ClipboardList,
  UserCircle2,
  Shield,
  Headphones,
  Store,
  Zap,
  ChevronDown,
  ArrowRight,
  Rocket,
  Heart,
  Quote,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
  Sparkles,
  Star,
  BadgeCheck,
  Boxes,
  Truck,
} from "lucide-react";
import Link from "next/link";

/* -------------------------------------------------------------------------- */
/*  Shared data                                                               */
/* -------------------------------------------------------------------------- */

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "Industries", href: "#industries" },
];

const brandLogos = [
  "Raymond",
  "PETER ENGLAND",
  "Allen Solly",
  "LOUIS PHILIPPE",
  "Van Heusen",
  "JOCKEY",
  "spykar",
];

const features = [
  {
    icon: ShoppingCart,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
    title: "Sales Management",
    desc: "Manage leads, orders and sales efficiently.",
  },
  {
    icon: Box,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
    title: "Inventory Control",
    desc: "Track stock, multi-warehouse and alerts.",
  },
  {
    icon: ShoppingBag,
    color: "text-violet-600",
    bg: "bg-violet-50",
    title: "Purchase Management",
    desc: "Streamline supplier and purchase orders.",
  },
  {
    icon: IndianRupee,
    color: "text-orange-500",
    bg: "bg-orange-50",
    title: "Finance & Accounts",
    desc: "Track payments, expenses and reports.",
  },
  {
    icon: Users,
    color: "text-rose-500",
    bg: "bg-rose-50",
    title: "Customer Management",
    desc: "Build stronger customer relationships.",
  },
  {
    icon: BarChart3,
    color: "text-purple-600",
    bg: "bg-purple-50",
    title: "Reports & Analytics",
    desc: "Get real-time insights for smarter decisions.",
  },
  {
    icon: UserCircle2,
    color: "text-green-600",
    bg: "bg-green-50",
    title: "HR & Payroll",
    desc: "Manage your team with ease.",
  },
  {
    icon: ClipboardList,
    color: "text-indigo-500",
    bg: "bg-indigo-50",
    title: "Projects & Tasks",
    desc: "Plan, track and deliver on time.",
  },
];

const statBar = [
  { icon: Store, value: "500+", label: "Retail Businesses Trust GROO ERP" },
  { icon: Zap, value: "1M+", label: "Transactions Processed Daily" },
  { icon: Shield, value: "99.9%", label: "Uptime & Data Reliability" },
  { icon: Headphones, value: "24/7", label: "Expert Support Always Available" },
];

const heroStats = [
  { icon: Store, value: "500+", label: "Retail Businesses Trust Us" },
  { icon: Shield, value: "99.9%", label: "Uptime" },
  { icon: Headphones, value: "24/7", label: "Expert Support" },
];

const industries = [
  {
    key: "retail",
    label: "Retail",
    icon: Store,
    description:
      "Point-of-sale, inventory sync and loyalty tools built for storefronts of every size.",
    checks: [
      "Higher Efficiency",
      "Lower Operational Costs",
      "Better Customer Experience",
    ],
  },
  {
    key: "wholesale",
    label: "Wholesale",
    icon: Boxes,
    description:
      "Bulk order management, tiered pricing and supplier tracking for wholesale operations.",
    checks: [
      "Faster Order Fulfillment",
      "Bulk Pricing Control",
      "Supplier Visibility",
    ],
  },
  {
    key: "distribution",
    label: "Distribution",
    icon: Truck,
    description:
      "Route planning, multi-warehouse stock and real-time delivery tracking, all in one place.",
    checks: [
      "Multi-Warehouse Sync",
      "Route Optimization",
      "Real-Time Tracking",
    ],
  },
];

const testimonials = [
  {
    quote:
      "GROO ERP has transformed our business operations. It's simple, reliable and powerful.",
    name: "Rahul Sharma",
    role: "Retail Business Owner",
  },
  {
    quote:
      "The best ERP solution we've used. It saves time and reduces manual work by 70%.",
    name: "Priya Mehta",
    role: "Operations Head",
  },
  {
    quote:
      "GROO ERP gives us real-time insights and helps us make smarter business decisions.",
    name: "Amit Verma",
    role: "Finance Manager",
  },
];

const footerColumns = [
  {
    title: "Product",
    links: ["Features", "Pricing", "Integrations"],
  },
  {
    title: "Company",
    links: ["About Us", "Careers", "Contact Us"],
  },
  {
    title: "Resources",
    links: ["Blog", "Help Center", "Documentation"],
  },
  {
    title: "Legal",
    links: ["Privacy Policy", "Terms of Service"],
  },
];

/* -------------------------------------------------------------------------- */
/*  Social icons (lucide-react dropped brand icons, so these are inline)      */
/* -------------------------------------------------------------------------- */

function FacebookIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M13.5 21v-7.6h2.55l.38-2.96h-2.93V8.56c0-.86.24-1.44 1.47-1.44h1.57V4.47C16.2 4.4 15.3 4.33 14.25 4.33c-2.2 0-3.7 1.34-3.7 3.8v2.31H7.98v2.96h2.57V21h2.95z" />
    </svg>
  );
}

function TwitterIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.9 3h3.1l-6.77 7.74L23 21h-6.24l-4.89-6.4L6.24 21H3.13l7.24-8.28L2 3h6.4l4.42 5.85L18.9 3zm-1.09 16.17h1.72L7.28 4.73H5.43l12.38 14.44z" />
    </svg>
  );
}

function LinkedinIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M6.94 8.5H3.56V21h3.38V8.5zM5.25 3a1.96 1.96 0 1 0 0 3.92 1.96 1.96 0 0 0 0-3.92zM20.44 21h-3.37v-6.4c0-1.53-.03-3.5-2.13-3.5-2.14 0-2.47 1.67-2.47 3.39V21H9.1V8.5h3.24v1.71h.05c.45-.86 1.56-1.77 3.21-1.77 3.43 0 4.06 2.26 4.06 5.2V21z" />
    </svg>
  );
}

function YoutubeIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-2C18.88 4 12 4 12 4s-6.88 0-8.59.42a2.78 2.78 0 0 0-1.95 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.95 1.96C5.12 19.5 12 19.5 12 19.5s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33zM9.75 15.02V8.48l5.75 3.27-5.75 3.27z" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*  Logo mark                                                                 */
/* -------------------------------------------------------------------------- */

function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-blue-500">
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-white" fill="none">
          <path
            d="M12 3a9 9 0 1 0 9 9"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path d="M17 3.5 15 7l3.9-.6z" fill="currentColor" />
        </svg>
      </div>
      <span
        className={`text-lg font-bold tracking-tight ${
          light ? "text-white" : "text-slate-900"
        }`}
      >
        GROO <span className="text-indigo-600">ERP</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Navbar                                                                    */
/* -------------------------------------------------------------------------- */

function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-100/80 bg-white/70 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px]  max-w-7xl items-center justify-between px-6">
        <Logo />

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className="group relative rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:text-indigo-600"
            >
              {link.label}
              <span className="absolute inset-x-4 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-to-r from-indigo-600 to-blue-500 transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/login"
            className="group flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/35 active:scale-[0.98]"
          >
            Login
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((v) => !v)}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-700 md:hidden"
        >
          {mobileOpen ? (
            <X className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-slate-100 bg-white md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  {link.label}
                </a>
              ))}

              <Link
                href="/login"
                className="mt-2 flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25"
              >
                Login
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-indigo-50/70 via-white to-white px-6 pb-16 pt-5 md:pb-28 ">
      {/* Ambient gradient mesh */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-indigo-300/25 blur-[100px]" />
        <div className="absolute -right-16 top-40 h-80 w-80 rounded-full bg-blue-300/25 blur-[100px]" />
        <div className="absolute left-1/3 bottom-0 h-72 w-72 rounded-full bg-violet-200/25 blur-[100px]" />
        <div
          className="absolute inset-0 opacity-[0.4]"
          style={{
            backgroundImage:
              "radial-gradient(circle, #c7d2fe 1px, transparent 1px)",
            backgroundSize: "28px 28px",
            maskImage:
              "radial-gradient(ellipse 60% 60% at 50% 0%, black, transparent)",
          }}
        />
      </div>

      <div className="mx-auto grid max-w-7xl items-center gap-12 md:grid-cols-2">
        {/* Left column */}
        <div>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-1.5 rounded-full border border-indigo-100 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm shadow-indigo-100 backdrop-blur"
          >
            <Zap className="h-3 w-3" />
            Retail Management, Simplified
          </motion.span>

          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mt-5 text-4xl font-extrabold leading-[1.1] tracking-tight text-slate-900 md:text-5xl"
          >
            Run Your Business
            <br />
            Smarter with{" "}
            <span className="bg-gradient-to-r from-indigo-600 via-blue-500 to-indigo-500 bg-clip-text text-transparent">
              GROO ERP
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mt-5 max-w-md text-base leading-relaxed text-slate-500"
          >
            All-in-one business management platform to streamline operations,
            boost productivity and grow faster.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mt-8 flex flex-wrap items-center gap-4"
          >
            <a
              href="#demo"
              className="group flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/40 active:scale-[0.98]"
            >
              Book a Demo
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </a>
            <a
              href="#features"
              className="rounded-full border border-indigo-200 bg-white/70 px-6 py-3 text-sm font-semibold text-indigo-600 backdrop-blur transition-all duration-300 hover:border-indigo-300 hover:bg-indigo-50"
            >
              Explore Features
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-10 flex flex-wrap gap-8"
          >
            {heroStats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-2.5">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-indigo-100 to-blue-50 ring-1 ring-indigo-100">
                  <stat.icon className="h-4 w-4 text-indigo-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    {stat.value}
                  </p>
                  <p className="text-xs text-slate-500">{stat.label}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right column — real hero graphic */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          className="relative flex items-center justify-center"
        >
          <div className="absolute h-64 w-64 rounded-full bg-gradient-to-br from-indigo-200/50 to-blue-200/50 blur-3xl md:h-96 md:w-96" />
          <motion.img
            src="/images/hero-graphic.png"
            alt="GROO ERP dashboard preview with sales, inventory and reports"
            className="relative w-full max-w-[600px] select-none drop-shadow-2xl"
            draggable={false}
            animate={{ y: [0, -10, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Trusted-by strip                                                          */
/* -------------------------------------------------------------------------- */

function TrustedBy() {
  const scrollRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);
  const loopedLogos = [...brandLogos, ...brandLogos];

  // Seamless auto-scroll loop
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let raf;
    const step = () => {
      if (!isPaused && el) {
        el.scrollLeft += 0.6;
        if (el.scrollLeft >= el.scrollWidth / 2) {
          el.scrollLeft = 0;
        }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [isPaused]);

  const nudge = (dir) => {
    setIsPaused(true);
    scrollRef.current?.scrollBy({ left: dir * 260, behavior: "smooth" });
    window.clearTimeout(nudge._t);
    nudge._t = window.setTimeout(() => setIsPaused(false), 2200);
  };

  return (
    <section className="relative px-6">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="mx-auto -mt-4 max-w-6xl rounded-2xl border border-slate-100 bg-white/90 px-8 py-6 shadow-xl shadow-slate-200/50 backdrop-blur md:-mt-2"
      >
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <p className="text-center text-sm font-bold uppercase tracking-wide text-zinc-900">
            Trusted by 500+ Retail Businesses
          </p>
        </div>

        <div
          className="relative flex items-center gap-3"
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <button
            aria-label="scroll left"
            onClick={() => nudge(-1)}
            className="z-20 hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 shadow-sm transition-all duration-300 hover:scale-110 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 md:flex"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <div className="relative flex-1 overflow-hidden">
            {/* edge fade masks */}
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-14 bg-gradient-to-r from-white to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-14 bg-gradient-to-l from-white to-transparent" />

            <div
              ref={scrollRef}
              className="flex gap-x-12 overflow-x-hidden scroll-smooth py-1.5"
            >
              {loopedLogos.map((brand, i) => (
                <span
                  key={`${brand}-${i}`}
                  className="flex flex-shrink-0 cursor-default select-none items-center text-sm font-bold tracking-wide text-slate-600 opacity-80 grayscale transition-all duration-300 hover:scale-110 hover:text-slate-800 hover:opacity-100 hover:grayscale-0"
                >
                  {brand === "LOUIS PHILIPPE" ? (
                    <span className="inline-flex items-center gap-1">
                      <span aria-hidden>👑</span> {brand}
                    </span>
                  ) : (
                    brand
                  )}
                </span>
              ))}
            </div>
          </div>

          <button
            aria-label="scroll right"
            onClick={() => nudge(1)}
            className="z-20 hidden h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-slate-100 bg-white text-slate-400 shadow-sm transition-all duration-300 hover:scale-110 hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-600 md:flex"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </motion.div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Features                                                                  */
/* -------------------------------------------------------------------------- */

function Features() {
  return (
    <section id="features" className="relative px-6 py-20 md:py-28">
      <div className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 h-72 bg-gradient-to-b from-indigo-50/60 to-transparent" />
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-xl text-center">
          <p className="text-xs font-bold uppercase tracking-wider text-indigo-600">
            Everything You Need
          </p>
          <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            Powerful Features. Endless Possibilities.
          </h2>
          <p className="mt-3 text-slate-500">
            A complete ERP solution for modern businesses.
          </p>
        </div>

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: (i % 4) * 0.06 }}
              whileHover={{ y: -6 }}
              className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm shadow-slate-100 transition-shadow duration-300 hover:shadow-xl hover:shadow-slate-200/70"
            >
              <span className="absolute inset-x-0 top-0 h-0.5 origin-left scale-x-0 bg-gradient-to-r from-indigo-600 to-blue-500 transition-transform duration-300 group-hover:scale-x-100" />
              <div
                className={`flex h-11 w-11 items-center justify-center rounded-xl ${f.bg} transition-transform duration-300 group-hover:scale-110`}
              >
                <f.icon className={`h-5 w-5 ${f.color}`} />
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">
                {f.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
                {f.desc}
              </p>
              <a
                href="#"
                className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
              >
                Learn more{" "}
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
              </a>
            </motion.div>
          ))}
        </div>

        {/* Stat bar */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.5 }}
          className="mt-14 grid grid-cols-2 gap-6 rounded-2xl border border-slate-100 bg-gradient-to-br from-white to-indigo-50/40 px-8 py-8 shadow-sm shadow-slate-100 sm:grid-cols-4"
        >
          {statBar.map((s) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-100 to-blue-50 ring-1 ring-indigo-100">
                <s.icon className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-lg font-extrabold text-slate-900">
                  {s.value}
                </p>
                <p className="text-xs leading-tight text-slate-500">
                  {s.label}
                </p>
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Industries                                                                */
/* -------------------------------------------------------------------------- */

function Industries() {
  const [active, setActive] = useState(0);
  const current = industries[active];

  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 14);
    rotateX.set(py * -14);
  };

  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <section id="industries" className="px-6">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.6 }}
          className="relative grid items-center gap-10 overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-50 to-blue-50 p-8 shadow-sm shadow-indigo-100 md:grid-cols-2 md:p-14"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-blue-200/40 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-10 -left-10 h-56 w-56 rounded-full bg-indigo-200/40 blur-3xl" />

          {/* Tilt-interactive illustration */}
          <div
            onMouseMove={handleMouseMove}
            onMouseLeave={resetTilt}
            className="relative flex h-56 items-center justify-center [perspective:1000px]"
          >
            <div className="absolute h-40 w-40 rounded-full bg-white/50 blur-2xl" />
            <motion.img
              src="/images/industries-illustration.png"
              alt="Storefront illustration representing retail, wholesale and distribution"
              className="relative w-full max-w-[320px] select-none drop-shadow-xl"
              draggable={false}
              style={{ rotateX, rotateY }}
              transition={{ type: "spring", stiffness: 150, damping: 12 }}
            />

            {/* Floating stat chips */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-2 top-2 hidden items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-lg shadow-indigo-100 backdrop-blur sm:flex"
            >
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              4.9/5 Rated
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{
                duration: 4.5,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5,
              }}
              className="absolute -right-2 bottom-4 hidden items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 shadow-lg shadow-indigo-100 backdrop-blur sm:flex"
            >
              <BadgeCheck className="h-3 w-3 fill-indigo-500 text-white" />
              500+ Businesses
            </motion.div>
          </div>

          <div className="relative">
            <span className="inline-flex rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-indigo-600 shadow-sm backdrop-blur">
              Industries We Serve
            </span>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-4xl">
              Tailored Solutions for Every Business
            </h2>

            {/* Interactive industry tabs */}
            <div className="mt-5 inline-flex flex-wrap gap-2 rounded-full bg-white/70 p-1.5 shadow-sm backdrop-blur">
              {industries.map((ind, i) => (
                <button
                  key={ind.key}
                  onClick={() => setActive(i)}
                  className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors duration-300 ${
                    active === i
                      ? "text-white"
                      : "text-slate-600 hover:text-indigo-600"
                  }`}
                >
                  {active === i && (
                    <motion.span
                      layoutId="industry-pill"
                      className="absolute inset-0 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600"
                      transition={{
                        type: "spring",
                        stiffness: 350,
                        damping: 28,
                      }}
                    />
                  )}
                  <ind.icon className="relative h-3.5 w-3.5" />
                  <span className="relative">{ind.label}</span>
                </button>
              ))}
              <span className="flex items-center px-3 py-2 text-xs font-semibold text-slate-400">
                + More
              </span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={current.key}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <p className="mt-4 text-sm leading-relaxed text-slate-600">
                  {current.description}
                </p>

                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
                  {current.checks.map((c) => (
                    <span
                      key={c}
                      className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
                    >
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-blue-500 text-[10px] text-white shadow-sm shadow-indigo-300">
                        ✓
                      </span>
                      {c}
                    </span>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <a
              href="#"
              className="group mt-7 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-indigo-500/40"
            >
              Learn More
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
/* -------------------------------------------------------------------------- */
/*  Testimonials                                                              */
/* -------------------------------------------------------------------------- */

function Testimonials() {
  const trackRef = useRef(null);
  const [active, setActive] = useState(0);

  const handleScroll = () => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.children[0];
    const gap = 24;
    const cardWidth = (card?.offsetWidth ?? 1) + gap;
    const index = Math.round(el.scrollLeft / cardWidth);
    setActive(Math.max(0, Math.min(index, testimonials.length - 1)));
  };

  const goTo = (i) => {
    const el = trackRef.current;
    const card = el?.children[i];
    card?.scrollIntoView({
      behavior: "smooth",
      inline: "start",
      block: "nearest",
    });
  };

  return (
    <section className="relative overflow-hidden px-6 py-20 md:py-28">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-indigo-100/50 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-blue-100/50 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        <div className="text-center">
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-bold uppercase tracking-wider text-indigo-600"
          >
            <Sparkles className="h-3 w-3" />
            What Our Clients Say
          </motion.span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
            Real Results from{" "}
            <span className="bg-gradient-to-r from-indigo-600 to-blue-500 bg-clip-text text-transparent">
              Real Businesses.
            </span>
          </h2>
        </div>

        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="mt-12 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible md:pb-0"
        >
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              whileHover={{ y: -6 }}
              className="group relative w-[82%] flex-shrink-0 snap-start rounded-3xl bg-gradient-to-br from-indigo-100 via-white to-blue-100 p-px shadow-sm transition-shadow duration-300 hover:shadow-xl hover:shadow-indigo-200/60 sm:w-[65%] md:w-auto"
            >
              <div className="relative h-full overflow-hidden rounded-[calc(1.5rem-1px)] bg-white p-7">
                <Quote
                  className="pointer-events-none absolute -right-3 -top-3 h-24 w-24 text-indigo-50 transition-colors duration-300 group-hover:text-indigo-100"
                  strokeWidth={1}
                />
                <div className="relative flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <Star
                      key={s}
                      className="h-3.5 w-3.5 fill-amber-400 text-amber-400"
                    />
                  ))}
                </div>
                <p className="relative mt-4 text-sm leading-relaxed text-slate-700">
                  {t.quote}
                </p>
                <div className="relative mt-6 flex items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-blue-500 p-0.5 shadow-sm shadow-indigo-300">
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-sm font-bold text-indigo-600">
                      {t.name.charAt(0)}
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-sm font-bold text-slate-900">
                      {t.name}
                      <BadgeCheck className="h-3.5 w-3.5 fill-indigo-500 text-white" />
                    </p>
                    <p className="text-xs text-slate-500">{t.role}</p>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 flex justify-center gap-2 md:hidden">
          {testimonials.map((_, i) => (
            <button
              key={i}
              aria-label={`Go to testimonial ${i + 1}`}
              onClick={() => goTo(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                active === i ? "w-6 bg-indigo-600" : "w-1.5 bg-indigo-200"
              }`}
            />
          ))}
        </div>

        {/* CTA banner */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="relative mt-10 overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-600 px-8 py-7 shadow-xl shadow-indigo-500/30"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-14 left-1/4 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
          <div className="relative flex flex-col items-center justify-between gap-5 sm:flex-row">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <div className="hidden h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-white/15 backdrop-blur sm:flex">
                <Rocket className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-lg font-bold text-white">
                  Ready to Transform Your Business?
                </p>
                <p className="text-sm text-indigo-100">
                  Join thousands of businesses growing smarter with GROO ERP.
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
/* -------------------------------------------------------------------------- */
/*  Footer                                                                    */
/* -------------------------------------------------------------------------- */

function Footer() {
  return (
    <footer className="relative bg-slate-950 px-6 pt-16">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-indigo-500/60 to-transparent" />
      <div className="mx-auto max-w-7xl">
        <div className="grid gap-10 pb-12 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo light />
            <p className="mt-3 max-w-[200px] text-sm text-slate-400">
              Smart Retail. Better Tomorrow.
            </p>
            <div className="mt-5 flex gap-3">
              {[FacebookIcon, TwitterIcon, LinkedinIcon, YoutubeIcon].map(
                (Icon, i) => (
                  <a
                    key={i}
                    href="#"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300 transition-all duration-300 hover:scale-110 hover:bg-gradient-to-br hover:from-indigo-600 hover:to-blue-600 hover:text-white"
                  >
                    <Icon className="h-3.5 w-3.5" />
                  </a>
                ),
              )}
            </div>
          </div>

          {footerColumns.map((col) => (
            <div key={col.title}>
              <p className="text-sm font-bold text-white">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link}>
                    <a
                      href="#"
                      className="text-sm text-slate-400 transition-colors hover:text-white"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-slate-800 py-6 sm:flex-row">
          <p className="text-xs text-slate-500">
            © 2026 GROO ERP. All rights reserved.
          </p>
          <p className="flex items-center gap-1 text-xs text-slate-500">
            Made with <Heart className="h-3 w-3 fill-red-500 text-red-500" />{" "}
            for businesses worldwide
          </p>
        </div>
      </div>
    </footer>
  );
}

/* -------------------------------------------------------------------------- */
/*  Page                                                                      */
/* -------------------------------------------------------------------------- */

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <Navbar />
      <Hero />
      <TrustedBy />
      <Features />
      <Industries />
      <Testimonials />
      <Footer />
    </main>
  );
}
