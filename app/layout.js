import './globals.css';
import { ToastProvider } from '@/components/ToastContext';

export const metadata = {
  title: 'GROO ERP ',
  description: 'ERP Software | Web | Mobile Apps',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-page font-sans text-ink antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
