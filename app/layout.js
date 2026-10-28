import './globals.css';
import Script from 'next/script';
import { ToastProvider } from '@/components/ToastContext';

export const metadata = {
  title: 'Woven Essence',
  description:
    'Shop handloom sarees, plain fabrics, dupattas and new arrivals from Woven Essence by Temple Fabrics, Bangalore.',
};

const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-page font-sans text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>

        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga4" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}');`}
            </Script>
          </>
        )}
      </body>
    </html>
  );
}