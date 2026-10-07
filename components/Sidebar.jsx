// // 'use client';
// // import Link from 'next/link';
// // import { usePathname } from 'next/navigation';
// // import { useEffect, useState } from 'react';
// // import { NAV } from '@/config/nav';
// // import Icon from './Icon';
// // import { useScope } from './ScopeContext';

// // export default function Sidebar({ collapsed }) {
// //   const pathname = usePathname();
// //   const { user } = useScope();
// //   const [open, setOpen] = useState(null);

// //   /* keep the parent of the current route expanded, like the original */
// //   useEffect(() => {
// //     const idx = NAV.findIndex(
// //       (n) => n.children && n.children.some((c) => pathname === c.href || pathname.startsWith(c.href + '/'))
// //     );
// //     if (idx >= 0) setOpen(idx);
// //   }, [pathname]);

// //   return (
// //     <aside
// //       className={
// //         'fixed inset-y-0 left-0 z-30 flex flex-col bg-sidebar text-sidebar-text ' +
// //         (collapsed ? 'w-0 overflow-hidden' : 'w-sidebar')
// //       }
// //     >
// //       <div className="flex items-center gap-3.5 px-5 py-[22px]">
// //         <span className="relative h-[34px] w-[34px] rounded-full bg-[#6d7789]">
// //           <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-[#2ecc71]" />
// //         </span>
// //         <span className="text-[17px] font-bold text-white">{user?.name || 'Loading...'}</span>
// //       </div>

// //       <nav className="sb-nav flex-1 overflow-y-auto pb-8">
// //         {NAV.map((item, i) => {
// //           const hasKids = Array.isArray(item.children);
// //           const isOpen = open === i;
// //           const isActive = item.href
// //             ? pathname === item.href
// //             : (item.children || []).some((c) => pathname === c.href);

// //           if (!hasKids) {
// //             return (
// //               <Link
// //                 key={item.label}
// //                 href={item.href}
// //                 className={'sb-item ' + (isActive ? 'sb-item-active' : '')}
// //               >
// //                 <Icon name={item.icon} size={20} />
// //                 <span className="flex-1">{item.label}</span>
// //                 <Icon name="chevR" size={13} />
// //               </Link>
// //             );
// //           }

// //           return (
// //             <div key={item.label}>
// //               <button
// //                 type="button"
// //                 onClick={() => setOpen(isOpen ? null : i)}
// //                 className={'sb-item ' + (isOpen || isActive ? 'sb-item-active' : '')}
// //               >
// //                 <Icon name={item.icon} size={20} />
// //                 <span className="flex-1">{item.label}</span>
// //                 <Icon name={isOpen ? 'chevL' : 'chevR'} size={13} />
// //               </button>

// //               {isOpen && item.children.length > 0 && (
// //                 <div className="pb-2 pt-0.5">
// //                   {item.children.map((c) => (
// //                     <Link
// //                       key={c.href}
// //                       href={c.href}
// //                       className={
// //                         'sb-sub-link ' +
// //                         (pathname === c.href || pathname.startsWith(c.href + '/') ? 'sb-sub-link-active' : '')
// //                       }
// //                     >
// //                       {c.label}
// //                     </Link>
// //                   ))}
// //                 </div>
// //               )}
// //             </div>
// //           );
// //         })}
// //       </nav>
// //     </aside>
// //   );
// // }






// 'use client';

// import Link from 'next/link';
// import { usePathname } from 'next/navigation';
// import { useEffect, useState } from 'react';
// import { NAV } from '@/config/nav';
// import { LuChevronRight, LuChevronDown } from 'react-icons/lu';
// import { useScope } from './ScopeContext';

// export default function Sidebar({ collapsed }) {
//   const pathname = usePathname();
//   const { user } = useScope();
//   const [open, setOpen] = useState(null);

//   /* Keep the parent of the current route expanded */
//   useEffect(() => {
//     const idx = NAV.findIndex(
//       (n) =>
//         n.children &&
//         n.children.some(
//           (c) =>
//             pathname === c.href ||
//             pathname.startsWith(c.href + '/')
//         )
//     );

//     if (idx >= 0) {
//       setOpen(idx);
//     }
//   }, [pathname]);

//   return (
//     <aside
//       className={
//         'fixed inset-y-0 left-0 z-30 flex flex-col bg-sidebar text-sidebar-text ' +
//         (collapsed
//           ? 'w-0 overflow-hidden'
//           : 'w-sidebar')
//       }
//     >
//       {/* User Header */}
//       <div className="flex items-center gap-3.5 px-5 py-[22px]">
//         <span className="relative h-[34px] w-[34px] rounded-full bg-[#6d7789]">
//           <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-[#2ecc71]" />
//         </span>

//         <span className="text-[17px] font-bold text-white">
//           {user?.name || 'Loading...'}
//         </span>
//       </div>

//       {/* Navigation */}
//       <nav className="sb-nav flex-1 overflow-y-auto pb-8">
//         {NAV.map((item, i) => {
//           const hasKids = Array.isArray(item.children);
//           const isOpen = open === i;

//           const isActive = item.href
//             ? pathname === item.href ||
//               pathname.startsWith(item.href + '/')
//             : (item.children || []).some(
//                 (c) =>
//                   pathname === c.href ||
//                   pathname.startsWith(c.href + '/')
//               );

//           /* Main icon */
//           const ItemIcon = item.icon;

//           /* =========================
//              SINGLE MENU ITEM
//              ========================= */
//           if (!hasKids) {
//             return (
//               <Link
//                 key={item.label}
//                 href={item.href}
//                 className={
//                   'sb-item ' +
//                   (isActive ? 'sb-item-active' : '')
//                 }
//               >
//                 {ItemIcon && (
//                   <ItemIcon
//                     size={20}
//                     strokeWidth={1.8}
//                   />
//                 )}

//                 <span className="flex-1">
//                   {item.label}
//                 </span>

//                 <LuChevronRight
//                   size={15}
//                   strokeWidth={1.8}
//                 />
//               </Link>
//             );
//           }

//           /* =========================
//              MENU WITH CHILDREN
//              ========================= */
//           return (
//             <div key={item.label}>
//               <button
//                 type="button"
//                 onClick={() =>
//                   setOpen(isOpen ? null : i)
//                 }
//                 className={
//                   'sb-item ' +
//                   (isOpen || isActive
//                     ? 'sb-item-active'
//                     : '')
//                 }
//               >
//                 {ItemIcon && (
//                   <ItemIcon
//                     size={20}
//                     strokeWidth={1.8}
//                   />
//                 )}

//                 <span className="flex-1">
//                   {item.label}
//                 </span>

//                 {isOpen ? (
//                   <LuChevronDown
//                     size={15}
//                     strokeWidth={1.8}
//                   />
//                 ) : (
//                   <LuChevronRight
//                     size={15}
//                     strokeWidth={1.8}
//                   />
//                 )}
//               </button>

//               {/* =========================
//                   SUB MODULES
//                  ========================= */}
//               {isOpen && item.children.length > 0 && (
//                 <div className="pb-2 pt-0.5">
//                   {item.children.map((c) => {
//                     const ChildIcon = c.icon;

//                     const childActive =
//                       pathname === c.href ||
//                       pathname.startsWith(c.href + '/');

//                     return (
//                       <Link
//                         key={c.href}
//                         href={c.href}
//                         className={
//                           'sb-sub-link ' +
//                           (childActive
//                             ? 'sb-sub-link-active'
//                             : '')
//                         }
//                       >
//                         {ChildIcon && (
//                           <ChildIcon
//                             size={16}
//                             strokeWidth={1.7}
//                           />
//                         )}

//                         <span>{c.label}</span>
//                       </Link>
//                     );
//                   })}
//                 </div>
//               )}
//             </div>
//           );
//         })}
//       </nav>
//     </aside>
//   );
// }













'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NAV } from '@/config/nav';
import { LuChevronRight, LuChevronDown, LuChevronLeft, LuX } from 'react-icons/lu';
import { useScope } from './ScopeContext';
import BrandMark from './BrandMark';

/* Logout is pinned to the foot of the rail rather than left as the last row
   of a list you have to scroll to reach. Split by href so the entry stays
   declared in one place - config/nav.js - and this file does not carry a
   second copy of its label or icon. */
const NAV_MAIN = NAV.filter((n) => n.href !== '/logout');
const NAV_LOGOUT = NAV.find((n) => n.href === '/logout');

export default function Sidebar({ collapsed, onToggle, mobileOpen, onCloseMobile }) {
  const pathname = usePathname();
  const { user } = useScope();
  const [open, setOpen] = useState(null);

  /* Which row's flyout is showing on the mini rail, and where to put it:
     { i, top, left, pad }. Null when nothing is hovered. */
  const [flyout, setFlyout] = useState(null);
  const railRef = useRef(null);
  const hideTimer = useRef(null);

  /* THE LONGEST href THAT THE CURRENT PATH MATCHES, not every href it
     happens to begin with. Dashboard is /admin, which prefixes every screen
     in the application - matching on startsWith lit it up on all of them, so
     the rail claimed you were on the dashboard while you were anywhere else.
     Taking the longest match means the most specific entry wins, and exactly
     one entry is ever active. */
  const activeHref = useMemo(() => {
    let best = '';
    const consider = (href) => {
      if (!href) return;
      if (pathname !== href && !pathname.startsWith(href + '/')) return;
      if (href.length > best.length) best = href;
    };

    NAV.forEach((n) => {
      consider(n.href);
      (n.children || []).forEach((c) => consider(c.href));
    });

    return best;
  }, [pathname]);

  /* Keep the parent of the current route expanded. Declared after
     activeHref, which it reads. */
  useEffect(() => {
    const idx = NAV_MAIN.findIndex(
      (n) => n.children && n.children.some((c) => c.href === activeHref)
    );

    if (idx >= 0) {
      setOpen(idx);
    }
  }, [activeHref]);

  /* Nothing to fly out of once the labels are back. */
  useEffect(() => {
    if (!collapsed) setFlyout(null);
  }, [collapsed]);

  const isMini = () =>
    collapsed &&
    typeof window !== 'undefined' &&
    window.matchMedia('(min-width: 1024px)').matches;

  /* The panel is measured off the hovered row and the rail's own right edge,
     both in viewport coordinates. It has to be position:fixed, because the
     nav scrolls and a scroll container clips anything absolute that leaves
     it. The rail itself is transformed, which makes it the containing block
     for a fixed child - but it is pinned at inset-y-0 left-0, so its origin
     is the viewport's and the two coordinate systems coincide.

     `rows` is only used to estimate the height, so a group near the foot of
     the rail opens far enough up to stay on screen, rather than running off
     the bottom and scrolling inside a sliver. */
  const showFlyout = useCallback(
    (i, el, rows) => {
      if (!isMini() || !railRef.current) return;
      clearTimeout(hideTimer.current);

      const r = el.getBoundingClientRect();
      const railRight = railRef.current.getBoundingClientRect().right;
      const vh = window.innerHeight;
      const est = Math.min(rows * 36 + 16, vh - 24);
      const top = Math.max(12, Math.min(r.top, vh - 12 - est));

      /* The row stops at the nav's inner padding, not at the rail's edge, so
         the panel starts at the ROW's right edge and pads itself out past the
         rail. Anchoring it to the rail instead left a dead strip between the
         two that belonged to neither, and crossing it closed the panel. */
      setFlyout({
        i,
        top,
        left: r.right,
        pad: railRight - r.right + 10,
        /* where the arrow has to sit to still point at the row, once the
           panel has been nudged up to stay on screen */
        arrow: r.top + r.height / 2 - top - 6,
      });
    },
    [collapsed]
  );

  /* Closing is deferred so a pointer that clips a corner on its way over
     does not dismiss the panel; entering either half cancels it. */
  const hideFlyout = useCallback(() => {
    clearTimeout(hideTimer.current);
    setFlyout(null);
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setFlyout(null), 180);
  }, []);

  const keepFlyout = useCallback(() => clearTimeout(hideTimer.current), []);

  useEffect(() => () => clearTimeout(hideTimer.current), []);

  /* Collapsed, the rail is icons only and the sub-lists are hidden, so a
     group header has nothing to show inline - clicking one opens the rail
     first. Hovering it gets the flyout instead.

     The mini rail is a desktop state only: below lg the panel is a full width
     drawer, where the labels are on show and none of this applies. */
  const openGroup = (i, isOpen) => {
    if (isMini()) {
      hideFlyout();
      onToggle?.();
      setOpen(i);
      return;
    }
    setOpen(isOpen ? null : i);
  };

  return (
    <aside
      ref={railRef}
      className={
        'sb-shell fixed inset-y-0 left-0 z-40 flex w-sidebar flex-col lg:translate-x-0 ' +
        (collapsed ? 'sb-collapsed lg:w-sidebarmini ' : 'lg:w-sidebar ') +
        (mobileOpen ? 'translate-x-0' : '-translate-x-full')
      }
    >
      {/* Rides the rail's own edge, so it stays reachable at either width
          and turns around to say which way the next click goes. */}
      {onToggle && (
        <button
          type="button"
          onClick={onToggle}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          aria-expanded={!collapsed}
          className="sb-collapse hidden lg:grid"
        >
          <LuChevronLeft size={15} strokeWidth={2.4} className="sb-collapse-ico" />
        </button>
      )}

      {/* ------------------------------------------------------- brand --- */}
      <div className="sb-brand">
        <span className="sb-logo">
          <BrandMark />
        </span>

        <span className="sb-label min-w-0 flex-1">
          <span className="sb-brand-name">RETAIL ERP</span>
          <span className="sb-brand-sub">{user?.name || 'ADMIN PANEL'}</span>
        </span>

        {/* The drawer's own dismiss. Tapping the backdrop does the same, but
            a visible control is what makes that discoverable. */}
        {onCloseMobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close menu"
            className="sb-close lg:hidden"
          >
            <LuX size={17} strokeWidth={2.2} />
          </button>
        )}
      </div>

      {/* --------------------------------------------------------- nav --- */}
      <nav className="sb-nav flex-1 overflow-y-auto" onScroll={hideFlyout}>
        {NAV_MAIN.map((item, i) => {
          const hasKids = Array.isArray(item.children);
          const isOpen = open === i;
          const isFly = flyout?.i === i;

          const isActive = item.href
            ? item.href === activeHref
            : (item.children || []).some((c) => c.href === activeHref);

          const ItemIcon = item.icon;

          /* ---------------------------------------- single menu item --- */
          if (!hasKids) {
            return (
              <div
                key={item.label}
                className="sb-group"
                onMouseEnter={(e) => showFlyout(i, e.currentTarget, 1)}
                onMouseLeave={scheduleHide}
              >
                <Link
                  href={item.href}
                  className={'sb-item ' + (isActive ? 'sb-item-active' : '')}
                >
                  <span className="sb-item-ico">
                    {ItemIcon && <ItemIcon size={18} strokeWidth={1.9} />}
                  </span>

                  <span className="sb-label flex-1 truncate">{item.label}</span>

                  <LuChevronRight size={14} strokeWidth={2} className="sb-chev" />
                </Link>

                {/* Just the name - there is no sub-list to show. */}
                {isFly && (
                  <div
                    className="sb-fly"
                    style={{
                      top: flyout.top,
                      left: flyout.left,
                      '--sb-fly-pad': flyout.pad + 'px',
                      '--sb-fly-arrow': flyout.arrow + 'px',
                    }}
                    onMouseEnter={keepFlyout}
                    onMouseLeave={scheduleHide}
                  >
                    <div className="sb-fly-card sb-fly-tip">{item.label}</div>
                  </div>
                )}
              </div>
            );
          }

          /* --------------------------------------- menu with children --- */
          return (
            <div
              key={item.label}
              className="sb-group"
              onMouseEnter={(e) => showFlyout(i, e.currentTarget, item.children.length)}
              onMouseLeave={scheduleHide}
            >
              <button
                type="button"
                onClick={() => openGroup(i, isOpen)}
                className={
                  'sb-item ' +
                  (isActive ? 'sb-item-current' : '') +
                  (isOpen || isFly ? ' sb-item-open' : '')
                }
              >
                <span className="sb-item-ico">
                  {ItemIcon && <ItemIcon size={18} strokeWidth={1.9} />}
                </span>

                <span className="sb-label flex-1 truncate">{item.label}</span>

                {isOpen ? (
                  <LuChevronDown size={14} strokeWidth={2} className="sb-chev" />
                ) : (
                  <LuChevronRight size={14} strokeWidth={2} className="sb-chev" />
                )}
              </button>

              {/* -------------------------------------- sub modules --- */}
              {/* Always mounted, so the open and close can be animated: a
                  list that is added to the page on click has no height to
                  grow from. .sb-sub-wrap animates grid-template-rows from
                  0fr to 1fr, which eases to the list's own height without
                  anyone having to measure it.

                  Closed, it is zero-height and clipped - but still in the
                  document, so the links are taken out of the tab order and
                  hidden from readers rather than left as invisible stops. */}
              {item.children.length > 0 && (
                <div
                  className={'sb-sub-wrap ' + (isOpen ? 'sb-sub-open' : '')}
                  aria-hidden={!isOpen}
                >
                  <div className="sb-sub-clip">
                    <div className="sb-sub">
                      {item.children.map((c) => {
                        const ChildIcon = c.icon;

                        const childActive = c.href === activeHref;

                        return (
                          <Link
                            key={c.href}
                            href={c.href}
                            tabIndex={isOpen ? undefined : -1}
                            className={
                              'sb-sub-link ' +
                              (childActive ? 'sb-sub-link-active' : '')
                            }
                          >
                            {ChildIcon && <ChildIcon size={15} strokeWidth={1.8} />}
                            <span className="truncate">{c.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* ----------------------------- the same list, flown out --- */}
              {isFly && (
                <div
                    className="sb-fly"
                    style={{
                      top: flyout.top,
                      left: flyout.left,
                      '--sb-fly-pad': flyout.pad + 'px',
                      '--sb-fly-arrow': flyout.arrow + 'px',
                    }}
                    onMouseEnter={keepFlyout}
                    onMouseLeave={scheduleHide}
                  >
                  <div
                    className="sb-fly-card sb-fly-list"
                    style={{ maxHeight: 'calc(100vh - ' + flyout.top + 'px - 16px)' }}
                  >
                    {item.children.map((c) => {
                      const ChildIcon = c.icon;

                      const childActive = c.href === activeHref;

                      return (
                        <Link
                          key={c.href}
                          href={c.href}
                          onClick={hideFlyout}
                          className={
                            'sb-fly-link ' +
                            (childActive ? 'sb-fly-link-active' : '')
                          }
                        >
                          {ChildIcon && <ChildIcon size={16} strokeWidth={1.8} />}
                          <span className="truncate">{c.label}</span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Outside the scroll area, so it stays put however long the menu is. */}
      {NAV_LOGOUT && (
        <div className="sb-foot">
          <Link
            href={NAV_LOGOUT.href}
            title={NAV_LOGOUT.label}
            className={
              'sb-item sb-logout ' +
              (NAV_LOGOUT.href === activeHref ? 'sb-item-active' : '')
            }
          >
            <span className="sb-item-ico">
              {NAV_LOGOUT.icon && <NAV_LOGOUT.icon size={18} strokeWidth={1.9} />}
            </span>

            <span className="sb-label flex-1 truncate">{NAV_LOGOUT.label}</span>
          </Link>
        </div>
      )}
    </aside>
  );
}
