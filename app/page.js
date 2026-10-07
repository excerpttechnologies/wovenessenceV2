// import { redirect } from 'next/navigation';

// /* /admin is gated by middleware.js, which bounces signed-out visitors to /login. */
// export default function Home() {
//   redirect('/admin');
// }




"use client";

import { useEffect, useRef, useState } from "react";
import {
  motion,
  AnimatePresence,
  MotionConfig,
  animate,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
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
  ArrowRight,
  Rocket,
  Heart,
  Quote,
  Menu,
  X,
  Sparkles,
  Star,
  BadgeCheck,
  Boxes,
  Truck,
  TrendingUp,
  PackageCheck,
} from "lucide-react";
import Link from "next/link";
import heroGraphic from "@/erpIMG/hero-graphic.png";
import industriesIllustration from "@/erpIMG/industries-illustration.png";

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

/* The same emerald family as the app's sidebar and login screen, with a few
   neighbouring hues so the eight cards don't read as one flat colour. */
const features = [
  { icon: ShoppingCart, tint: "from-emerald-400 to-emerald-600", title: "Sales Management", desc: "Manage leads, orders and sales efficiently." },
  { icon: Box, tint: "from-teal-400 to-teal-600", title: "Inventory Control", desc: "Track stock, multi-warehouse and alerts." },
  { icon: ShoppingBag, tint: "from-lime-400 to-green-600", title: "Purchase Management", desc: "Streamline supplier and purchase orders." },
  { icon: IndianRupee, tint: "from-amber-400 to-orange-500", title: "Finance & Accounts", desc: "Track payments, expenses and reports." },
  { icon: Users, tint: "from-cyan-400 to-sky-600", title: "Customer Management", desc: "Build stronger customer relationships." },
  { icon: BarChart3, tint: "from-emerald-400 to-teal-600", title: "Reports & Analytics", desc: "Get real-time insights for smarter decisions." },
  { icon: UserCircle2, tint: "from-green-400 to-emerald-700", title: "HR & Payroll", desc: "Manage your team with ease." },
  { icon: ClipboardList, tint: "from-teal-300 to-cyan-600", title: "Projects & Tasks", desc: "Plan, track and deliver on time." },
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
    checks: ["Higher Efficiency", "Lower Operational Costs", "Better Customer Experience"],
  },
  {
    key: "wholesale",
    label: "Wholesale",
    icon: Boxes,
    description:
      "Bulk order management, tiered pricing and supplier tracking for wholesale operations.",
    checks: ["Faster Order Fulfillment", "Bulk Pricing Control", "Supplier Visibility"],
  },
  {
    key: "distribution",
    label: "Distribution",
    icon: Truck,
    description:
      "Route planning, multi-warehouse stock and real-time delivery tracking, all in one place.",
    checks: ["Multi-Warehouse Sync", "Route Optimization", "Real-Time Tracking"],
  },
];

const testimonials = [
  {
    quote: "GROO ERP has transformed our business operations. It's simple, reliable and powerful.",
    name: "Rahul Sharma",
    role: "Retail Business Owner",
  },
  {
    quote: "The best ERP solution we've used. It saves time and reduces manual work by 70%.",
    name: "Priya Mehta",
    role: "Operations Head",
  },
  {
    quote: "GROO ERP gives us real-time insights and helps us make smarter business decisions.",
    name: "Amit Verma",
    role: "Finance Manager",
  },
];

const footerColumns = [
  { title: "Product", links: ["Features", "Pricing", "Integrations"] },
  { title: "Company", links: ["About Us", "Careers", "Contact Us"] },
  { title: "Resources", links: ["Blog", "Help Center", "Documentation"] },
  { title: "Legal", links: ["Privacy Policy", "Terms of Service"] },
];

/* -------------------------------------------------------------------------- */
/*  Keyframes the CSS-only animations use. Kept here rather than in           */
/*  globals.css because nothing outside this page needs them.                 */
/* -------------------------------------------------------------------------- */

const PAGE_CSS = `
@keyframes lp-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes lp-pan { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
@keyframes lp-spin { to { transform: rotate(360deg); } }
@keyframes lp-shine { from { transform: translateX(-120%) skewX(-20deg); } to { transform: translateX(220%) skewX(-20deg); } }
.lp-marquee { animation: lp-marquee 32s linear infinite; }
.lp-marquee-wrap:hover .lp-marquee { animation-play-state: paused; }
.lp-pan { background-size: 200% 200%; animation: lp-pan 6s ease-in-out infinite; }
.lp-spin { animation: lp-spin 14s linear infinite; }
.lp-shine::after {
  content: ""; position: absolute; inset: 0; width: 40%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
  transform: translateX(-120%) skewX(-20deg);
}
.lp-shine:hover::after { animation: lp-shine .9s ease; }
@media (prefers-reduced-motion: reduce) {
  .lp-marquee, .lp-pan, .lp-spin, .lp-shine:hover::after { animation: none; }
}
`;

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
/*  Small animated helpers                                                    */
/* -------------------------------------------------------------------------- */

/* Counts a figure like "500+", "99.9%" or "1M+" up from zero the first time
   it scrolls into view. Anything after the number is kept as a suffix. */
function CountUp({ value, className }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduce = useReducedMotion();
  const m = String(value).match(/^([\d.]+)(.*)$/);
  const target = m ? parseFloat(m[1]) : 0;
  const suffix = m ? m[2] : "";
  const decimals = m && m[1].includes(".") ? m[1].split(".")[1].length : 0;
  const [shown, setShown] = useState(m ? (0).toFixed(decimals) : value);

  useEffect(() => {
    if (!m || !inView) return;
    if (reduce) {
      setShown(target.toFixed(decimals));
      return;
    }
    const controls = animate(0, target, {
      duration: 1.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(v.toFixed(decimals)),
    });
    return () => controls.stop();
  }, [inView]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span ref={ref} className={className}>
      {m ? shown + suffix : value}
    </span>
  );
}

/* Section eyebrow + heading that slide in together. */
function SectionHead({ eyebrow, title, accent, sub, dark = false }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="mx-auto max-w-2xl text-center"
    >
      <span
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider ${
          dark ? "bg-emerald-400/10 text-emerald-300 ring-1 ring-emerald-400/20" : "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
        }`}
      >
        <Sparkles className="h-3 w-3" />
        {eyebrow}
      </span>
      <h2 className={`mt-4 text-3xl font-extrabold tracking-tight md:text-[42px] md:leading-[1.15] ${dark ? "text-white" : "text-slate-900"}`}>
        {title}{" "}
        {accent && (
          <span className="lp-pan bg-gradient-to-r from-emerald-500 via-teal-400 to-lime-400 bg-clip-text text-transparent">
            {accent}
          </span>
        )}
      </h2>
      {sub && <p className={`mt-3 ${dark ? "text-emerald-100/70" : "text-slate-500"}`}>{sub}</p>}
    </motion.div>
  );
}

/* Thin bar across the top that fills as the page is scrolled. */
function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });
  return (
    <motion.div
      style={{ scaleX }}
      className="fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-gradient-to-r from-emerald-400 via-teal-300 to-lime-300"
    />
  );
}

/* -------------------------------------------------------------------------- */
/*  Logo mark                                                                 */
/* -------------------------------------------------------------------------- */

function Logo({ light = false }) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/30">
        <svg viewBox="0 0 24 24" className="lp-spin h-4 w-4 text-white" fill="none">
          <path d="M12 3a9 9 0 1 0 9 9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M17 3.5 15 7l3.9-.6z" fill="currentColor" />
        </svg>
      </div>
      <span className={`text-lg font-extrabold tracking-tight ${light ? "text-white" : "text-slate-900"}`}>
        GROO <span className={light ? "text-emerald-400" : "text-emerald-600"}>ERP</span>
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Navbar                                                                    */
/* -------------------------------------------------------------------------- */

/* Transparent over the dark hero, then a white glass bar once the page has
   scrolled past it. */
function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [solid, setSolid] = useState(false);

  useEffect(() => {
    const onScroll = () => setSolid(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const light = !solid && !mobileOpen;

  return (
    <motion.header
      initial={{ y: -80 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
        light ? "bg-transparent" : "border-b border-emerald-100/60 bg-white/80 shadow-sm shadow-emerald-900/5 backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-6">
        <Logo light={light} />

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <a
              key={link.label}
              href={link.href}
              className={`group relative rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                light ? "text-emerald-50/80 hover:text-white" : "text-slate-700 hover:text-emerald-600"
              }`}
            >
              {link.label}
              <span className="absolute inset-x-4 -bottom-0.5 h-0.5 origin-left scale-x-0 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 transition-transform duration-300 group-hover:scale-x-100" />
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-6 md:flex">
          <Link
            href="/login"
            className="lp-shine group relative flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/40 active:scale-[0.98]"
          >
            Login
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <button
          aria-label="Toggle menu"
          onClick={() => setMobileOpen((v) => !v)}
          className={`flex h-9 w-9 items-center justify-center rounded-lg md:hidden ${light ? "text-white" : "text-slate-700"}`}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="overflow-hidden border-t border-emerald-50 bg-white md:hidden"
          >
            <div className="flex flex-col gap-1 px-6 py-4">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-emerald-50 hover:text-emerald-700"
                >
                  {link.label}
                </a>
              ))}

              <Link
                href="/login"
                className="mt-2 flex items-center justify-center gap-1.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25"
              >
                Login
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}

/* -------------------------------------------------------------------------- */
/*  Hero                                                                      */
/* -------------------------------------------------------------------------- */

const heroLine1 = ["Run", "Your", "Business"];
const heroLine2 = ["Smarter", "with"];

const word = {
  hidden: { opacity: 0, y: "0.6em", filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: [0.16, 1, 0.3, 1] } },
};

function Hero() {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const imgY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const glowY = useTransform(scrollYProgress, [0, 1], [0, -80]);

  return (
    <section
      ref={ref}
      className="relative overflow-hidden bg-[#04140f] px-6 pb-28 pt-32 md:pb-40 md:pt-40"
    >
      {/* Aurora: three slow-drifting blobs behind everything */}
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ x: [0, 60, -20, 0], y: [0, 40, 80, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-emerald-500/25 blur-[120px]"
        />
        <motion.div
          animate={{ x: [0, -70, 30, 0], y: [0, 60, -30, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-24 top-20 h-[26rem] w-[26rem] rounded-full bg-teal-400/20 blur-[120px]"
        />
        <motion.div
          style={{ y: glowY }}
          animate={{ scale: [1, 1.15, 1] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-lime-400/10 blur-[110px]"
        />
        {/* grid, fading out toward the edges */}
        <div
          className="absolute inset-0 opacity-[0.18]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(167,243,208,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(167,243,208,.35) 1px, transparent 1px)",
            backgroundSize: "56px 56px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 30%, black, transparent)",
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-14 md:grid-cols-2">
        {/* Left column */}
        <div>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300 backdrop-blur"
          >
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
            </span>
            Retail Management, Simplified
          </motion.span>

          <motion.h1
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}
            className="mt-6 text-[40px] font-extrabold leading-[1.08] tracking-tight text-white md:text-6xl"
          >
            {heroLine1.map((w) => (
              <motion.span key={w} variants={word} className="mr-[0.25em] inline-block">
                {w}
              </motion.span>
            ))}
            <br />
            {heroLine2.map((w) => (
              <motion.span key={w} variants={word} className="mr-[0.25em] inline-block">
                {w}
              </motion.span>
            ))}
            <motion.span
              variants={word}
              className="lp-pan inline-block bg-gradient-to-r from-emerald-300 via-teal-200 to-lime-300 bg-clip-text text-transparent"
            >
              GROO ERP
            </motion.span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.55 }}
            className="mt-6 max-w-md text-base leading-relaxed text-emerald-50/70 md:text-lg"
          >
            All-in-one business management platform to streamline operations,
            boost productivity and grow faster.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.65 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <a
              href="#demo"
              className="lp-shine group relative flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-7 py-3.5 text-sm font-bold text-[#04140f] shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-400/40 active:scale-[0.98]"
            >
              Book a Demo
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </a>
            <a
              href="#features"
              className="rounded-full border border-emerald-300/30 bg-white/5 px-7 py-3.5 text-sm font-semibold text-emerald-50 backdrop-blur transition-all duration-300 hover:border-emerald-300/60 hover:bg-white/10"
            >
              Explore Features
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.75 }}
            className="mt-12 flex flex-wrap gap-8"
          >
            {heroStats.map((stat) => (
              <div key={stat.label} className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-400/10 ring-1 ring-emerald-400/25">
                  <stat.icon className="h-5 w-5 text-emerald-300" />
                </div>
                <div>
                  <CountUp value={stat.value} className="block text-base font-extrabold text-white" />
                  <p className="text-xs text-emerald-100/60">{stat.label}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Right column - hero graphic with orbiting ring and floating chips */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
          className="relative flex items-center justify-center"
        >
          <div className="absolute h-72 w-72 rounded-full bg-gradient-to-br from-emerald-400/30 to-teal-400/20 blur-3xl md:h-[26rem] md:w-[26rem]" />
          <div className="lp-spin absolute h-[19rem] w-[19rem] rounded-full border border-dashed border-emerald-300/20 md:h-[30rem] md:w-[30rem]" />

          <motion.div style={{ y: imgY }} className="relative">
            <motion.img
              src={heroGraphic.src}
              alt="GROO ERP dashboard preview with sales, inventory and reports"
              className="relative w-full max-w-[600px] select-none drop-shadow-[0_30px_60px_rgba(16,185,129,0.25)]"
              draggable={false}
              animate={{ y: [0, -14, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0, y: [0, -10, 0] }}
            transition={{ opacity: { delay: 1 }, x: { delay: 1 }, y: { duration: 4, repeat: Infinity, ease: "easeInOut" } }}
            className="absolute -left-2 top-6 hidden items-center gap-2.5 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:flex"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400/20">
              <TrendingUp className="h-4 w-4 text-emerald-300" />
            </span>
            <span>
              <span className="block text-sm font-extrabold text-white">+24%</span>
              <span className="block text-[11px] text-emerald-100/70">Sales this month</span>
            </span>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0, y: [0, 10, 0] }}
            transition={{ opacity: { delay: 1.2 }, x: { delay: 1.2 }, y: { duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.4 } }}
            className="absolute -right-2 bottom-10 hidden items-center gap-2.5 rounded-2xl border border-white/10 bg-white/10 px-4 py-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:flex"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400/20">
              <PackageCheck className="h-4 w-4 text-teal-200" />
            </span>
            <span>
              <span className="block text-sm font-extrabold text-white">Stock synced</span>
              <span className="block text-[11px] text-emerald-100/70">Across all locations</span>
            </span>
          </motion.div>
        </motion.div>
      </div>

      {/* curved bottom edge into the white page */}
      <svg
        className="pointer-events-none absolute inset-x-0 -bottom-px h-16 w-full text-white md:h-24"
        viewBox="0 0 1440 120"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path fill="currentColor" d="M0,80 C360,140 1080,0 1440,70 L1440,120 L0,120 Z" />
      </svg>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Trusted-by strip                                                          */
/* -------------------------------------------------------------------------- */

function TrustedBy() {
  const loopedLogos = [...brandLogos, ...brandLogos];

  return (
    <section className="relative px-6">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 mx-auto -mt-14 max-w-6xl rounded-2xl border border-emerald-100 bg-white px-8 py-7 shadow-2xl shadow-emerald-900/10 md:-mt-20"
      >
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
          </span>
          <p className="text-center text-sm font-bold uppercase tracking-wide text-slate-900">
            Trusted by 500+ Retail Businesses
          </p>
        </div>

        {/* CSS marquee - pauses while hovered */}
        <div className="lp-marquee-wrap relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-gradient-to-l from-white to-transparent" />
          <div className="lp-marquee flex w-max gap-x-14 py-1.5">
            {loopedLogos.map((brand, i) => (
              <span
                key={`${brand}-${i}`}
                className="flex flex-shrink-0 cursor-default select-none items-center text-base font-extrabold tracking-wide text-slate-400 transition-all duration-300 hover:scale-110 hover:text-emerald-700"
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
      </motion.div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Features                                                                  */
/* -------------------------------------------------------------------------- */

/* A card with a soft emerald spotlight that follows the cursor. */
function FeatureCard({ f, i }) {
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.55, delay: (i % 4) * 0.08, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -8 }}
      onMouseMove={onMove}
      className="group relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-6 shadow-sm transition-shadow duration-300 hover:border-emerald-200 hover:shadow-2xl hover:shadow-emerald-900/10"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background: "radial-gradient(260px circle at var(--mx, 50%) var(--my, 50%), rgba(16,185,129,0.12), transparent 70%)",
        }}
      />
      <div
        className={`relative flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.tint} text-white shadow-lg shadow-emerald-900/10 transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110`}
      >
        <f.icon className="h-5 w-5" />
      </div>
      <h3 className="relative mt-5 text-base font-bold text-slate-900">{f.title}</h3>
      <p className="relative mt-1.5 text-sm leading-relaxed text-slate-500">{f.desc}</p>
      <a
        href="#"
        className="relative mt-4 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 hover:text-emerald-700"
      >
        Learn more
        <ArrowRight className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1" />
      </a>
    </motion.div>
  );
}

function Features() {
  return (
    <section id="features" className="relative scroll-mt-20 px-6 py-24 md:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-1/3 -z-10 h-80 bg-gradient-to-b from-emerald-50/70 to-transparent" />
      <div className="mx-auto max-w-7xl">
        <SectionHead
          eyebrow="Everything You Need"
          title="Powerful Features."
          accent="Endless Possibilities."
          sub="A complete ERP solution for modern businesses."
        />

        <div className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f, i) => (
            <FeatureCard key={f.title} f={f} i={i} />
          ))}
        </div>

        {/* Stat bar */}
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.6 }}
          className="relative mt-16 grid grid-cols-2 gap-8 overflow-hidden rounded-3xl bg-gradient-to-br from-[#05261c] via-[#073a2b] to-[#0a4733] px-8 py-10 shadow-2xl shadow-emerald-900/20 sm:grid-cols-4"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-emerald-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 left-1/4 h-56 w-56 rounded-full bg-teal-400/10 blur-3xl" />
          {statBar.map((s) => (
            <div key={s.label} className="relative flex items-center gap-3">
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-400/15 ring-1 ring-emerald-400/30">
                <s.icon className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <CountUp value={s.value} className="block text-2xl font-extrabold text-white" />
                <p className="text-xs leading-tight text-emerald-100/60">{s.label}</p>
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
  const springX = useSpring(rotateX, { stiffness: 150, damping: 14 });
  const springY = useSpring(rotateY, { stiffness: 150, damping: 14 });

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 16);
    rotateX.set(py * -16);
  };

  const resetTilt = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <section id="industries" className="scroll-mt-20 px-6">
      <div className="mx-auto max-w-7xl">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="relative grid items-center gap-10 overflow-hidden rounded-[2rem] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-teal-50 p-8 shadow-xl shadow-emerald-900/5 md:grid-cols-2 md:p-14"
        >
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -right-10 -top-10 h-64 w-64 rounded-full bg-teal-200/50 blur-3xl"
          />
          <motion.div
            animate={{ scale: [1.2, 1, 1.2], opacity: [0.8, 0.5, 0.8] }}
            transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -bottom-10 -left-10 h-64 w-64 rounded-full bg-emerald-200/50 blur-3xl"
          />

          {/* Tilt-interactive illustration */}
          <div
            onMouseMove={handleMouseMove}
            onMouseLeave={resetTilt}
            className="relative flex h-64 items-center justify-center [perspective:1000px]"
          >
            <div className="absolute h-44 w-44 rounded-full bg-white/70 blur-2xl" />
            <motion.img
              src={industriesIllustration.src}
              alt="Storefront illustration representing retail, wholesale and distribution"
              className="relative w-full max-w-[340px] select-none drop-shadow-xl"
              draggable={false}
              style={{ rotateX: springX, rotateY: springY }}
            />

            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -left-2 top-2 hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-lg shadow-emerald-900/10 sm:flex"
            >
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              4.9/5 Rated
            </motion.div>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute -right-2 bottom-4 hidden items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-lg shadow-emerald-900/10 sm:flex"
            >
              <BadgeCheck className="h-3.5 w-3.5 fill-emerald-500 text-white" />
              500+ Businesses
            </motion.div>
          </div>

          <div className="relative">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700 shadow-sm ring-1 ring-emerald-100">
              <Sparkles className="h-3 w-3" />
              Industries We Serve
            </span>
            <h2 className="mt-4 text-3xl font-extrabold leading-tight tracking-tight text-slate-900 md:text-4xl">
              Tailored Solutions for{" "}
              <span className="lp-pan bg-gradient-to-r from-emerald-500 via-teal-400 to-lime-500 bg-clip-text text-transparent">
                Every Business
              </span>
            </h2>

            {/* Interactive industry tabs */}
            <div className="mt-6 inline-flex flex-wrap gap-1.5 rounded-full bg-white p-1.5 shadow-sm ring-1 ring-emerald-100">
              {industries.map((ind, i) => (
                <button
                  key={ind.key}
                  onClick={() => setActive(i)}
                  className={`relative flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors duration-300 ${
                    active === i ? "text-white" : "text-slate-600 hover:text-emerald-700"
                  }`}
                >
                  {active === i && (
                    <motion.span
                      layoutId="industry-pill"
                      className="absolute inset-0 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 shadow-md shadow-emerald-500/30"
                      transition={{ type: "spring", stiffness: 350, damping: 28 }}
                    />
                  )}
                  <ind.icon className="relative h-3.5 w-3.5" />
                  <span className="relative">{ind.label}</span>
                </button>
              ))}
              <span className="flex items-center px-3 py-2 text-xs font-semibold text-slate-400">+ More</span>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={current.key}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.3 }}
              >
                <p className="mt-5 text-sm leading-relaxed text-slate-600">{current.description}</p>

                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2.5">
                  {current.checks.map((c, i) => (
                    <motion.span
                      key={c}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + i * 0.08 }}
                      className="flex items-center gap-1.5 text-sm font-medium text-slate-700"
                    >
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 text-[10px] text-white shadow-sm shadow-emerald-300">
                        ✓
                      </span>
                      {c}
                    </motion.span>
                  ))}
                </div>
              </motion.div>
            </AnimatePresence>

            <a
              href="#"
              className="lp-shine group relative mt-8 inline-flex items-center gap-1.5 overflow-hidden rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition-all duration-300 hover:shadow-xl hover:shadow-emerald-500/40"
            >
              Learn More
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
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
    card?.scrollIntoView({ behavior: "smooth", inline: "start", block: "nearest" });
  };

  return (
    <section className="relative overflow-hidden px-6 py-24 md:py-32">
      <div className="pointer-events-none absolute -left-20 top-10 h-72 w-72 rounded-full bg-emerald-100/60 blur-3xl" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-72 w-72 rounded-full bg-teal-100/60 blur-3xl" />

      <div className="relative mx-auto max-w-6xl">
        <SectionHead eyebrow="What Our Clients Say" title="Real Results from" accent="Real Businesses." />

        <div
          ref={trackRef}
          onScroll={handleScroll}
          className="mt-14 flex snap-x snap-mandatory gap-6 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-3 md:overflow-visible md:pb-0"
        >
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 30, rotate: i === 1 ? 0 : i === 0 ? -2 : 2 }}
              whileInView={{ opacity: 1, y: 0, rotate: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -8 }}
              className="group relative w-[82%] flex-shrink-0 snap-start rounded-3xl bg-gradient-to-br from-emerald-200 via-white to-teal-200 p-px shadow-sm transition-shadow duration-300 hover:shadow-2xl hover:shadow-emerald-900/10 sm:w-[65%] md:w-auto"
            >
              <div className="relative h-full overflow-hidden rounded-[calc(1.5rem-1px)] bg-white p-7">
                <Quote
                  className="pointer-events-none absolute -right-3 -top-3 h-24 w-24 text-emerald-50 transition-all duration-500 group-hover:rotate-12 group-hover:text-emerald-100"
                  strokeWidth={1}
                />
                <div className="relative flex gap-0.5">
                  {Array.from({ length: 5 }).map((_, s) => (
                    <motion.span
                      key={s}
                      initial={{ opacity: 0, scale: 0 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: 0.3 + i * 0.1 + s * 0.06, type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <Star className="h-4 w-4 fill-amber-400 text-amber-400" />
                    </motion.span>
                  ))}
                </div>
                <p className="relative mt-4 text-[15px] leading-relaxed text-slate-700">{t.quote}</p>
                <div className="relative mt-6 flex items-center gap-3">
                  <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 p-0.5 shadow-sm shadow-emerald-300">
                    <div className="flex h-full w-full items-center justify-center rounded-full bg-white text-sm font-bold text-emerald-700">
                      {t.name.charAt(0)}
                    </div>
                  </div>
                  <div>
                    <p className="flex items-center gap-1 text-sm font-bold text-slate-900">
                      {t.name}
                      <BadgeCheck className="h-3.5 w-3.5 fill-emerald-500 text-white" />
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
              className={`h-1.5 rounded-full transition-all duration-300 ${active === i ? "w-6 bg-emerald-600" : "w-1.5 bg-emerald-200"}`}
            />
          ))}
        </div>

        {/* CTA banner */}
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.98 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="lp-pan relative mt-14 overflow-hidden rounded-3xl bg-gradient-to-r from-[#05261c] via-emerald-700 to-[#0a4733] px-8 py-9 shadow-2xl shadow-emerald-900/25"
        >
          <motion.div
            animate={{ x: [0, 40, 0], y: [0, -20, 0] }}
            transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full bg-emerald-300/20 blur-2xl"
          />
          <div className="pointer-events-none absolute -bottom-14 left-1/4 h-40 w-40 rounded-full bg-teal-300/15 blur-2xl" />
          <div className="relative flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-4 text-center sm:text-left">
              <motion.div
                animate={{ y: [0, -6, 0], rotate: [0, -8, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="hidden h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 backdrop-blur sm:flex"
              >
                <Rocket className="h-6 w-6 text-emerald-200" />
              </motion.div>
              <div>
                <p className="text-xl font-extrabold text-white">Ready to Transform Your Business?</p>
                <p className="text-sm text-emerald-100/70">
                  Join thousands of businesses growing smarter with GROO ERP.
                </p>
              </div>
            </div>
            <Link
              href="/login"
              className="lp-shine group relative flex flex-shrink-0 items-center gap-1.5 overflow-hidden rounded-full bg-white px-6 py-3 text-sm font-bold text-emerald-800 shadow-lg transition-all duration-300 hover:shadow-xl active:scale-[0.98]"
            >
              Get Started
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
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
    <footer className="relative overflow-hidden bg-[#04140f] px-6 pt-16">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[40rem] -translate-x-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
      <div className="relative mx-auto max-w-7xl">
        <div className="grid gap-10 pb-12 md:grid-cols-[1.4fr_1fr_1fr_1fr_1fr]">
          <div>
            <Logo light />
            <p className="mt-3 max-w-[220px] text-sm text-emerald-100/50">Smart Retail. Better Tomorrow.</p>
            <div className="mt-5 flex gap-3">
              {[FacebookIcon, TwitterIcon, LinkedinIcon, YoutubeIcon].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-emerald-100/70 ring-1 ring-white/10 transition-all duration-300 hover:-translate-y-1 hover:bg-gradient-to-br hover:from-emerald-400 hover:to-teal-500 hover:text-white"
                >
                  <Icon className="h-3.5 w-3.5" />
                </a>
              ))}
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
                      className="inline-block text-sm text-emerald-100/50 transition-all duration-300 hover:translate-x-1 hover:text-emerald-300"
                    >
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 py-6 sm:flex-row">
          <p className="text-xs text-emerald-100/40">© 2026 GROO ERP. All rights reserved.</p>
          <p className="flex items-center gap-1 text-xs text-emerald-100/40">
            Made with <Heart className="h-3 w-3 animate-pulse fill-red-500 text-red-500" /> for businesses worldwide
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
    /* reducedMotion="user" turns the motion/react animations off for anyone
       whose system asks for less motion; the CSS ones are handled in PAGE_CSS. */
    <MotionConfig reducedMotion="user">
      <style>{PAGE_CSS}</style>
      <main className="min-h-screen overflow-x-hidden bg-white">
        <ScrollProgress />
        <Navbar />
        <Hero />
        <TrustedBy />
        <Features />
        <Industries />
        <Testimonials />
        <Footer />
      </main>
    </MotionConfig>
  );
}
