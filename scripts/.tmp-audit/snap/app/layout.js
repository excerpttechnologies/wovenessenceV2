import './globals.css';

export const metadata = {
  title: 'GROO ERP ',
  description: 'ERP Software | Web | Mobile Apps',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-page font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
