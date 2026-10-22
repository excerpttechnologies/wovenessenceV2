import mongoose from 'mongoose';
import dbConnect from '@/lib/db';

/* GET /invoice/<token>  (22-10-2026) - PUBLIC, no login.

   The invoice PDF behind a link shared from the POS print page (see
   app/api/invoice-share/route.js). Only an exact token opens anything: it is
   24 random bytes, so links cannot be guessed or walked. Nothing else about
   the bill is reachable from here. */

export async function GET(req, { params }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) {
    return new Response('Invoice not found', { status: 404 });
  }
  await dbConnect();
  const row = await mongoose.connection.db.collection('invoiceshare').findOne(
    { token: String(token) },
    { projection: { pdf: 1, invoiceNo: 1 } },
  );
  if (!row || !row.pdf) return new Response('Invoice not found', { status: 404 });

  const bytes = Buffer.from(row.pdf.buffer ?? row.pdf);
  const name = 'Invoice_' + String(row.invoiceNo || 'invoice').replace(/[^\w-]+/g, '_') + '.pdf';
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${name}"`,
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
