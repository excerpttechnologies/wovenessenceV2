// 'use client';
// import Icon from './Icon';
// import NotificationBell from './NotificationBell';
// import { ChatBotButton } from './ChatBot';
// import { useScope, FIN_YEARS } from './ScopeContext';

// export default function Topbar({ onToggleSidebar }) {
//   const { businesses, locations, business, location, finYear, setBusiness, setLocation, setFinYear } = useScope();

//   return (
//     <header className="sticky top-0 z-20 flex h-topbar items-center gap-4 bg-white px-5">
//       <div className="flex items-center gap-2">
//         {/* <span className="grid grid-cols-3 gap-0.5">
//           {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
//             <i key={n} className={'block h-1.5 w-1.5 ' + (n === 1 || n === 5 ? 'bg-[#7ea3dd]' : 'bg-[#2f5fb3]')} />
//           ))}
//         </span> */}
//         <span className="leading-none">
//           <b className="text-[17px] text-brand-logo">RETAIL ERP</b>
//           <span className="block text-[8.5px] text-[#7b8798]">EXCERPT TECHNOLOGIES PVT LTD</span>
//         </span>
//       </div>

//       <div className="flex-1" />

//       {/* Company and Location sit side by side, are styled identically and are
//           both ellipsised at 200px - and here they are named from the same words:
//           the branch TEMPLE FABRICS, SILKS & SAREES holds a location recorded as
//           OMSHREE FABS (TEMPLE FABRICS RRN). With no caption over either box the
//           location reads as though the branch had switched to it. Both selects
//           were already keyed on _id and neither has ever matched on a name; what
//           was missing was saying which box is which. `title` carries the full
//           name, since the visible text is cut off. */}
//       <div>
//         <span className="block text-[11px] leading-tight text-inkmuted">Company</span>
//         <div className="tb-select-wrapper">
//           <select
//             className="tb-select"
//             aria-label="Company"
//             title={businesses.find((b) => b.value === business)?.label || 'Select Business'}
//             value={business}
//             onChange={(e) => setBusiness(e.target.value)}
//           >
//             {businesses.length === 0 && <option value="">Select Business</option>}
//             {businesses.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
//           </select>
//         </div>
//       </div>

//       <div>
//         <span className="block text-[11px] leading-tight text-inkmuted">Location</span>
//         <div className="tb-select-wrapper">
//           <select
//             className="tb-select"
//             aria-label="Location"
//             title={locations.find((l) => l.value === location)?.label || 'Select Location'}
//             value={location}
//             onChange={(e) => setLocation(e.target.value)}
//           >
//             {locations.length === 0 && <option value="">Select Location</option>}
//             {locations.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
//           </select>
//         </div>
//       </div>

//       <div className="flex items-center gap-2">
//         <span className="text-[#56637d]"><Icon name="cal" size={26} /></span>
//         <span>
//           <span className="block text-[11px] leading-tight text-inkmuted">Financial Year</span>
//           <select
//             className="border-0 bg-transparent p-0 text-[15px] font-bold text-ink outline-none"
//             value={finYear}
//             onChange={(e) => setFinYear(e.target.value)}
//           >
//             {FIN_YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
//           </select>
//         </span>
//       </div>

//       {/* bell and help bot as one group, so the pair keeps a tight gap */}
//       <div className="flex shrink-0 items-center gap-1">
//         <NotificationBell />
//         <ChatBotButton />
//       </div>

//       <button type="button" onClick={onToggleSidebar} aria-label="Toggle menu" className="border-0 bg-transparent p-1 text-[#3c4a63]">
//         <Icon name="burger" size={22} />
//       </button>
//     </header>
//   );
// }













"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import erpLogo from "@/erpIMG/erp-logo.png";
import {
  LuMenu,
  LuSlidersHorizontal,
  LuChevronUp,
  LuChevronDown,
  LuLogOut,
} from "react-icons/lu";
import NotificationBell from "./NotificationBell";
import { ChatBotButton } from "./ChatBot";
import { useScope, FIN_YEARS } from "./ScopeContext";

/* Company, Location and Financial Year - the three things every screen below
   is scoped by.

   Rendered twice from one definition: inline on a wide screen, and stacked in
   the drop-down panel on a narrow one. Writing it once is what stops the two
   drifting apart.

   Company and Location are styled identically and are both ellipsised, and
   here they are named from the same words: the branch TEMPLE FABRICS, SILKS &
   SAREES holds a location recorded as OMSHREE FABS (TEMPLE FABRICS RRN). With
   no caption over either box the location reads as though the branch had
   switched to it. Both selects were already keyed on _id and neither has ever
   matched on a name; what was missing was saying which box is which. `title`
   carries the full name, since the visible text is cut off. */
function ScopeControls() {
  const {
    businesses,
    locations,
    business,
    location,
    finYear,
    setBusiness,
    setLocation,
    setFinYear,
  } = useScope();

  return (
    <>
      <div className="tb-field">
        <span className="tb-field-label">Company</span>
        <div className="tb-select-wrapper">
          <select
            className="tb-select"
            aria-label="Company"
            title={
              businesses.find((b) => b.value === business)?.label ||
              "Select Business"
            }
            value={business}
            onChange={(e) => setBusiness(e.target.value)}
          >
            {businesses.length === 0 && (
              <option value="">Select Business</option>
            )}
            {businesses.map((b) => (
              <option key={b.value} value={b.value}>
                {b.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tb-field">
        <span className="tb-field-label">Location</span>
        <div className="tb-select-wrapper">
          <select
            className="tb-select"
            aria-label="Location"
            title={
              locations.find((l) => l.value === location)?.label ||
              "Select Location"
            }
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          >
            {locations.length === 0 && (
              <option value="">Select Location</option>
            )}
            {locations.map((l) => (
              <option key={l.value} value={l.value}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="tb-field">
        <span className="tb-field-label">Financial Year</span>
        <div className="tb-select-wrapper tb-select-wrapper-sm">
          <select
            className="tb-select"
            aria-label="Financial Year"
            value={finYear}
            onChange={(e) => setFinYear(e.target.value)}
          >
            {FIN_YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>
    </>
  );
}

/* The signed-in account, and the one action that belongs to it.

   Logout is also pinned at the foot of the rail; this is the second place
   people look for it, beside their own name. Both point at /logout, the
   route that actually clears the session - neither is a second
   implementation of signing out. */
function UserMenu() {
  const { user } = useScope();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const name = user?.name || "Account";
  const initial = String(name).trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={"um-btn " + (open ? "um-btn-on" : "")}
      >
        <span className="um-avatar">{initial}</span>

        <span className="hidden min-w-0 text-left sm:block">
          <span className="um-name">{name}</span>
          {user?.role && <span className="um-role">{user.role}</span>}
        </span>

        <LuChevronDown
          size={15}
          strokeWidth={2.2}
          className={"um-chev " + (open ? "um-chev-on" : "")}
        />
      </button>

      {open && (
        <div className="um-pop" role="menu">
          <div className="um-head">
            <span className="um-avatar um-avatar-lg">{initial}</span>
            <span className="min-w-0">
              <span className="um-name">{name}</span>
              {user?.email && <span className="um-mail">{user.email}</span>}
            </span>
          </div>

          <Link
            href="/logout"
            role="menuitem"
            className="um-item"
            onClick={() => setOpen(false)}
          >
            <LuLogOut size={15} strokeWidth={2} />
            Logout
          </Link>
        </div>
      )}
    </div>
  );
}

export default function Topbar({ onToggleSidebar }) {
  /* Narrow screens have no room for three selects beside the brand, so they
     fold into a panel under the bar. Wide screens never see this flag. */
  const [scopeOpen, setScopeOpen] = useState(false);

  return (
    <header className="tb no-print">
      <div className="tb-bar">
        {/* Opens the drawer. Desktop collapses from the rail's own edge
            button instead, so this one steps aside there. */}
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Open menu"
          className="tb-icon-btn lg:hidden"
        >
          <LuMenu size={19} strokeWidth={2} />
        </button>

        {/* erp-logo.png is erp.png cropped to the mark and cleared of its
            halo - the source is 1536x1024 with the artwork in the middle,
            which would have been 2.2 MB fetched on every screen. */}
        <div className="tb-brand">
          <Image
            src={erpLogo}
            alt="GROO ERP"
            width={254}
            height={96}
            priority
            className="tb-logo"
          />
        </div>

        <div className="flex-1" />

        <div className="tb-scope hidden lg:flex">
          <ScopeControls />
        </div>

        {/* bell and help bot as one group, so the pair keeps a tight gap */}
        <div className="flex shrink-0 items-center gap-1">
          <NotificationBell />
          <ChatBotButton />
        </div>

        <UserMenu />

        <button
          type="button"
          onClick={() => setScopeOpen((o) => !o)}
          aria-label="Company, location and financial year"
          aria-expanded={scopeOpen}
          className={
            "tb-icon-btn lg:hidden " + (scopeOpen ? "tb-icon-btn-on" : "")
          }
        >
          {scopeOpen ? (
            <LuChevronUp size={19} strokeWidth={2} />
          ) : (
            <LuSlidersHorizontal size={18} strokeWidth={2} />
          )}
        </button>
      </div>

      {scopeOpen && (
        <div className="tb-scope-panel lg:hidden">
          <ScopeControls />
        </div>
      )}
    </header>
  );
}
