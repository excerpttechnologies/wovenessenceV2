'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { useScope } from './ScopeContext';

/* ==========================================================================
   Top-bar notification bell.

   Reads /api/notifications, which counts documents sitting in a state that
   needs someone to act - nothing is stored, so there is nothing to mark as
   read. A count drops when the work behind it is done. See the note at the
   top of that route for why it is built that way.

   Three kinds, in the order they matter:
     inbox    another branch or location acted; it is now your move
     warning  a setup gap that is blocking work
     pending  your own document waiting on its next step

   The badge counts inbox + warning only. Uninvoiced GRCs are normal
   business, not an alert - they are listed, but they do not make the bell
   go red, otherwise it would be red permanently and stop meaning anything.
   ========================================================================== */

const POLL_MS = 60000;

const TONE = {
  inbox: { dot: 'bg-[#e0342c]', chip: 'text-danger' },
  warning: { dot: 'bg-warnyellow', chip: 'text-[#8a6d1e]' },
  pending: { dot: 'bg-[#9aa6ba]', chip: 'text-inkmuted' },
};

const HEADING = {
  inbox: 'Needs your action',
  warning: 'Setup',
  pending: 'Awaiting next step',
};

export default function NotificationBell() {
  const router = useRouter();
  const { business, location, finYear } = useScope();

  const [open, setOpen] = useState(false);
  const [data, setData] = useState({ total: 0, actionable: 0, items: [] });
  const [loading, setLoading] = useState(false);
  const box = useRef(null);

  const load = useCallback(async () => {
    if (!business) { setData({ total: 0, actionable: 0, items: [] }); return; }
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        business: business || '', location: location || '', finYear: finYear || '',
      });
      const r = await fetch('/api/notifications?' + qs);
      if (!r.ok) throw new Error('failed');
      setData(await r.json());
    } catch {
      /* a failed poll should leave the last good numbers alone rather than
         flashing the bell to zero */
    } finally {
      setLoading(false);
    }
  }, [business, location, finYear]);

  useEffect(() => { load(); }, [load]);

  /* Poll, but not while the tab is in the background - and catch up as soon
     as it comes back, so returning to the tab never shows a stale count. */
  useEffect(() => {
    const tick = () => { if (!document.hidden) load(); };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [load]);

  /* close on outside click / Escape */
  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  const go = (href) => { setOpen(false); router.push(href); };

  const badge = data.actionable;
  /* Everything that is listed but deliberately not badged. A bell showing a
     grey "0" above a panel listing five documents reads as broken, so the
     three states are kept visually distinct:
       red number  something is waiting on you
       grey dot    the list has items, none of them urgent
       nothing     genuinely empty */
  const pendingCount = Math.max(0, (data.total || 0) - badge);

  const groups = ['inbox', 'warning', 'pending']
    .map((k) => ({ kind: k, items: data.items.filter((i) => i.kind === k) }))
    .filter((g) => g.items.length);

  return (
    <span className="relative" ref={box}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!open) load(); }}
        aria-label={
          badge
            ? `Notifications, ${badge} needing action`
            : pendingCount
              ? `Notifications, ${pendingCount} awaiting a next step`
              : 'Notifications, nothing waiting'
        }
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-[#56637d] hover:bg-[#eef1f7]"
      >
        <Icon name="bell" size={22} />

        {badge > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[#e0342c] px-1 text-[10px] text-white">
            {badge > 99 ? '99+' : badge}
          </span>
        )}

        {/* nothing urgent, but the panel is not empty either */}
        {badge === 0 && pendingCount > 0 && (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-[#9aa6ba]" />
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[340px] overflow-hidden rounded-lg border border-line bg-white shadow-pop">
          <div className="flex items-center border-b border-line px-3.5 py-2.5">
            <span className="text-[13.5px] font-bold text-ink">Notifications</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={load}
              className="flex items-center gap-1 text-[12px] text-brand-link hover:underline"
            >
              {loading ? <span className="spin" /> : <Icon name="refresh" size={12} />} Refresh
            </button>
          </div>

          <div className="max-h-[380px] overflow-y-auto">
            {!business && (
              <div className="px-3.5 py-6 text-center text-[13px] text-inkmuted">
                Select a business in the top bar.
              </div>
            )}

            {business && groups.length === 0 && (
              <div className="px-3.5 py-6 text-center text-[13px] text-inkmuted">
                {loading ? <span className="spin" /> : 'Nothing waiting. You are all caught up.'}
              </div>
            )}

            {groups.map((g) => (
              <div key={g.kind}>
                <div className="flex items-baseline gap-2 bg-[#f7f9fc] px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wide text-inkmuted">
                  <span>{HEADING[g.kind]}</span>
                  {/* says why the bell can read 0 while this group has rows */}
                  {g.kind === 'pending' && (
                    <span className="font-normal normal-case tracking-normal text-[10.5px]">
                      — not counted on the bell
                    </span>
                  )}
                </div>
                {g.items.map((it) => (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => go(it.href)}
                    className="flex w-full items-start gap-2.5 border-b border-line px-3.5 py-2.5 text-left hover:bg-[#f5f8fd]"
                  >
                    <i className={'mt-[6px] h-2 w-2 shrink-0 rounded-full ' + TONE[g.kind].dot} />
                    <span className="flex-1 text-[13px] leading-snug text-cell">{it.label}</span>
                    <span className={'shrink-0 text-[13px] font-bold ' + TONE[g.kind].chip}>
                      {it.count}
                    </span>
                  </button>
                ))}
              </div>
            ))}
          </div>

          {/* the counts are live state, not a message feed - say so rather
              than offering a "mark all read" that could not mean anything */}
          <div className="border-t border-line bg-[#f7f9fc] px-3.5 py-2 text-[11.5px] text-inkmuted">
            {badge === 0 && pendingCount > 0
              ? 'Nothing needs your attention. The bell only counts work another '
                + 'branch or location has sent you, so routine follow-ups above '
                + 'do not turn it red.'
              : 'Live counts for the selected business, location and year. '
                + 'Items clear themselves once the work is done.'}
          </div>
        </div>
      )}
    </span>
  );
}
