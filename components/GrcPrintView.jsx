'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import Icon from './Icon';
import { GRC_PRINT_CSS, renderGrcPrintBody } from '@/lib/grcPrintLayout';

/* Printable Goods Receipt Challan - the ONE on-screen GRC print view.

   It is used by:
     - /admin/transaction/purchase/grc/print/<id>   (list Action > GRC Print)
     - the "Print GRC" button on the GRC edit screen

   and it renders the same payload / same markup as the standalone document
   (/api/grc/<id>/print) and the download route (/api/grc/<id>/download).
   The payload already carries the GRC's own branch (lib/grcPrintData.js),
   so nothing here looks at the globally selected business or location. */

const PAGE_CSS = `
  .grc-print-page { min-height: 100vh; background: #eceff1; padding: 16px 12px 36px; }
  .grc-print-page .grc-doc-paper {
    width: 100%; max-width: 210mm; margin: 0 auto; background: #fff;
    box-shadow: 0 0 0 1px #d0d0d0;
  }
  @media print {
    .grc-print-page {
      background: #fff !important; padding: 0 !important;
      min-height: 0 !important; overflow: visible !important;
      position: static !important; inset: auto !important;
    }
    .grc-print-page .grc-doc-paper { box-shadow: none !important; max-width: none !important; }
  }
`;

export default function GrcPrintView({ id }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  /* The document is portalled to <body>. app/globals.css isolates print with
     `body.printing-grc > *:not(.print-doc-wrapper)`, which can only hide the
     application shell when the wrapper really is a child of <body> - nested
     inside the admin layout the rule hides the wrapper's own ancestor and the
     page prints blank. The other print documents in this app portal for the
     same reason. */
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch('/api/purchase-grc/' + encodeURIComponent(id) + '/print', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Could not load this GRC');
        return body;
      })
      .then((body) => { if (!cancelled) setData(body); })
      .catch((err) => { if (!cancelled) setError(err.message || 'Could not load this GRC'); });
    return () => { cancelled = true; };
  }, [id]);

  /* The GRC print isolation class. It removes the application shell from the
     printed page (app/globals.css) without the #__next blank-page problem the
     old view hit. */
  useEffect(() => {
    document.body.classList.add('printing-grc');
    return () => document.body.classList.remove('printing-grc');
  }, []);

  return mounted ? createPortal(
    <div className="print-doc-wrapper grc-print-page fixed inset-0 z-[60] overflow-auto">
      <style>{GRC_PRINT_CSS + PAGE_CSS}</style>

      <div className="no-print mx-auto mb-3 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 px-1">
        <button type="button" className="btn" onClick={() => router.push('/admin/transaction/purchase/grc')}>
          <Icon name="back" size={14} /> Back
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => window.print()} className="btn">Print GRC</button>
          <button
            type="button"
            className="btn"
            onClick={() => window.open('/api/grc/' + encodeURIComponent(id) + '/download', '_blank')}
          >
            Download
          </button>
          <button
            type="button"
            className="btn border-danger bg-danger text-white hover:border-[#9f1d17] hover:bg-[#9f1d17]"
            title="Close"
            aria-label="Close"
            onClick={() => router.push('/admin/transaction/purchase/grc')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>

      {error && (
        <div className="no-print mx-auto max-w-[210mm] rounded border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {!error && !data && (
        <div className="no-print mx-auto max-w-[210mm] rounded bg-white p-8 text-center text-sm text-slate-500">
          Loading challan...
        </div>
      )}

      {data && (
        <div className="grc-doc-paper">
          <div className="grc-print-doc" dangerouslySetInnerHTML={{ __html: renderGrcPrintBody(data) }} />
        </div>
      )}
    </div>,
    document.body
  ) : null;
}
