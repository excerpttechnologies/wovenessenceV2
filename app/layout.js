import './globals.css';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/ToastContext';
import GoogleAnalytics from '@/components/analytics/GoogleAnalytics';

/* Inter is the ERP's UI face: a neutral, highly legible sans for dense data
   screens. next/font self-hosts it, so the app does not depend on a runtime
   request to Google and the fallback stack keeps the layout stable while the
   file loads. */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  fallback: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
});

export const metadata = {
  title: 'Woven Essence',
  description:
    'Shop handloom sarees, plain fabrics, dupattas and new arrivals from Woven Essence by Temple Fabrics, Bangalore.',
};

/* The storefront already publishes GA4_MEASUREMENT_ID through
   /api/website-analytics/config. NEXT_PUBLIC_GA_ID is kept as an override for
   deployments that want a separate property for the ERP application. A
   measurement ID is public by design; the service-account credentials stay
   server-side. */
const GA_ID = process.env.NEXT_PUBLIC_GA_ID || process.env.GA4_MEASUREMENT_ID;
const VALID_GA_ID = /^G-[A-Z0-9]{4,}$/i.test(String(GA_ID || '')) ? GA_ID : '';

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="bg-page font-sans text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
        <GoogleAnalytics measurementId={VALID_GA_ID} />
      </body>
    </html>
  );
}
