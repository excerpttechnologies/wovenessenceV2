'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/* GA4 for the ERP application itself.

   The storefront has its own tracker (public/we-analytics.js) and installs the
   tag only when the page does not already contain one. This component covers
   the Next.js application: it loads gtag.js once, disables GA's automatic
   page_view, and records a page_view for the initial screen and for every
   client-side route change.

   Internal ERP screens are deliberately excluded. The GA4 property belongs to
   the storefront; recording /admin, /login or invoice pages here would mix
   staff activity into the shop's reports. */

const INTERNAL_PREFIXES = [
  '/admin',
  '/api',
  '/invoice',
  '/login',
  '/logout',
  '/qa-import-test',
];

function isInternal(pathname) {
  return INTERNAL_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export default function GoogleAnalytics({ measurementId }) {
  const pathname = usePathname() || '/';
  const lastUrl = useRef('');
  const track = Boolean(measurementId) && !isInternal(pathname);

  useEffect(() => {
    if (!track) return;

    const url = `${pathname}${window.location.search || ''}`;
    if (lastUrl.current === url) return;
    lastUrl.current = url;

    /* gtag.js may still be loading when the first route is rendered. The
       standard stub queues commands on dataLayer, so the page_view is not
       lost and is processed in order with the config command. */
    window.dataLayer = window.dataLayer || [];
    if (typeof window.gtag !== 'function') {
      window.gtag = function gtag() {
        window.dataLayer.push(arguments);
      };
    }
    window.gtag('event', 'page_view', {
      page_location: window.location.origin + url,
      page_path: url,
      page_title: document.title,
    });
  }, [pathname, track]);

  if (!track) return null;

  const id = encodeURIComponent(measurementId);

  return (
    <>
      <Script
        id="ga4-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${id}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = window.gtag || gtag;
          window.__weGa4Installed = window.__weGa4Installed || 'next-layout';
          gtag('js', new Date());
          gtag('config', ${JSON.stringify(measurementId)}, {
            send_page_view: false,
            anonymize_ip: true,
            allow_google_signals: false,
            allow_ad_personalization_signals: false
          });`}
      </Script>
    </>
  );
}
