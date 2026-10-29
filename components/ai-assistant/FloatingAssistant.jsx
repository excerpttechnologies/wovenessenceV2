'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import AiAssistantClient from './AiAssistantClient';

/* A launcher available on every signed-in screen.

   It is deliberately small: the full workspace is /admin/ai-assistant, and
   this panel carries the same component so a question can be asked without
   leaving the screen you are on. The panel is not modal - the ERP behind it
   stays usable - and Escape or the close button puts it away.

   Hidden on the assistant's own page, where the full workspace is already
   open, and marked no-print so it never appears on a printed challan or
   invoice. */

function SparkIcon({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z" />
      <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  );
}

export default function FloatingAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (pathname && (pathname === '/admin/ai-assistant' || pathname.startsWith('/admin/ai-assistant/'))) {
    return null;
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="AI Business Assistant"
          className="no-print fixed inset-x-3 bottom-20 z-[85] flex h-[min(80dvh,720px)] flex-col overflow-hidden rounded-2xl border border-line bg-[#fbfdfc] shadow-[0_24px_60px_rgba(15,35,25,0.25)] sm:left-auto sm:right-4 sm:w-[440px]"
        >
          <AiAssistantClient variant="panel" onClose={() => setOpen(false)} />
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close AI Business Assistant' : 'Open AI Business Assistant'}
        aria-expanded={open}
        title={open ? 'Close AI Business Assistant' : 'Ask the AI Business Assistant'}
        className={
          /* Below the existing help dialog (z-60) so opening that panel
             covers this launcher instead of the other way round. */
          'no-print fixed bottom-5 right-4 z-[59] flex h-12 items-center gap-2 rounded-full bg-brand px-3.5 text-white shadow-[0_10px_30px_rgba(12,90,50,0.35)] transition-transform hover:scale-[1.03] hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 focus-visible:ring-offset-2 '
          + (open ? 'scale-95' : '')
        }
      >
        <SparkIcon size={20} />
        <span className="hidden text-[12px] font-semibold sm:inline">Ask AI</span>
      </button>
    </>
  );
}
