'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  LuChevronDown, LuFileCheck, LuMonitor, LuPackageCheck, LuPlus,
} from 'react-icons/lu';
import { useScope } from './ScopeContext';

/* ==========================================================================
   Header quick actions.

   The three documents an operator starts most often - a POS bill, a Delivery
   Challan and a Goods Receipt Challan - reached from any screen without
   walking the menu first.

   REAL ROUTES ONLY. Each href is the existing Add page, not a new endpoint:

     POS  /admin/pos/add
     DC   /admin/transaction/sell/deliverychallan/add
     GRC  /admin/transaction/purchase/grc/add

   POS reads business / location / financial year from the query string, so
   those three values ride along. DC and GRC read the same scope from
   ScopeContext, and navigating in the same tab keeps that provider mounted.

   PERMISSION-FILTERED. An action appears only when the role holds `create` on
   the screen that owns it. The server still enforces the screen on the Add
   page itself; hiding the button is a courtesy, not the lock.
   ========================================================================== */

const ACTIONS = [
  {
    key: 'pos',
    label: 'POS',
    short: 'POS',
    href: '/admin/pos/add',
    screen: '/admin/transaction/sell/pos',
    icon: LuMonitor,
    tone: 'pos',
  },
  {
    key: 'dc',
    label: 'Create DC',
    short: 'DC',
    href: '/admin/transaction/sell/deliverychallan/add',
    screen: '/admin/transaction/sell/deliverychallan',
    icon: LuFileCheck,
    tone: 'dc',
  },
  {
    key: 'grc',
    label: 'Create GRC',
    short: 'GRC',
    href: '/admin/transaction/purchase/grc/add',
    screen: '/admin/transaction/purchase/grc',
    icon: LuPackageCheck,
    tone: 'grc',
  },
];

export default function QuickActions() {
  const {
    business, location, finYear, can, permsReady,
  } = useScope();
  const [open, setOpen] = useState(false);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const onDown = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  /* The POS till takes its scope from the URL. Building it here means the
     bill opens on the branch the operator is looking at, not the default. */
  const posHref = useMemo(() => {
    const params = new URLSearchParams();
    if (business) params.set('business', business);
    if (location) params.set('location', location);
    if (finYear) params.set('finYear', finYear);
    const query = params.toString();
    return '/admin/pos/add' + (query ? '?' + query : '');
  }, [business, location, finYear]);

  /* Nothing is shown until the matrix has settled: a cashier should never see
     a Create GRC button for the half second before the answer arrives. */
  if (!permsReady) return null;

  const allowed = ACTIONS
    .filter((action) => can(action.screen, 'create'))
    .map((action) => ({
      ...action,
      href: action.key === 'pos' ? posHref : action.href,
    }));

  if (!allowed.length) return null;

  const one = allowed.length === 1 ? allowed[0] : null;
  const OneIcon = one?.icon;

  return (
    <div className="qa-wrap" ref={boxRef}>
      {/* Wide screens: the three actions in full. */}
      <div className="qa-full">
        {allowed.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.key}
              href={action.href}
              className={'qa-btn qa-btn-' + action.tone}
              title={action.label}
            >
              <Icon size={15} strokeWidth={2} />
              <span>{action.label}</span>
            </Link>
          );
        })}
      </div>

      {/* Narrow screens: one direct link when only one action is allowed,
          otherwise a compact menu. */}
      <div className="qa-compact">
        {one ? (
          <Link
            href={one.href}
            className={'qa-compact-btn qa-btn-' + one.tone}
            title={one.label}
          >
            {OneIcon && <OneIcon size={16} strokeWidth={2} />}
            <span className="qa-compact-label">{one.short}</span>
          </Link>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={open}
              className={'qa-compact-btn qa-compact-create ' + (open ? 'qa-compact-on' : '')}
              title="Create a document"
            >
              <LuPlus size={16} strokeWidth={2.2} />
              <span className="qa-compact-label">Create</span>
              <LuChevronDown size={12} strokeWidth={2.2} className="qa-compact-chev" />
            </button>

            {open && (
              <div className="qa-menu" role="menu">
                {allowed.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link
                      key={action.key}
                      href={action.href}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="qa-menu-item"
                    >
                      <span className={'qa-menu-ico qa-menu-ico-' + action.tone}>
                        <Icon size={15} strokeWidth={2} />
                      </span>
                      <span className="min-w-0">
                        <span className="qa-menu-label">{action.label}</span>
                        <span className="qa-menu-sub">
                          {action.key === 'pos' ? 'Open the till' : 'New document'}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
