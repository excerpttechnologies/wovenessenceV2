import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';

/* /api/catalog?name=barcodeLabels|invoiceLayouts
   Seeded reference rows behind the two choice tables. Replaces the
   `catalog` branch of the old /api/settings/[action] handler. */

const json = (d, s = 200) => Response.json(d, { status: s });

const catalogSchema = new mongoose.Schema(
  {
    catalog: { type: String, index: true },
    name: String,
    description: String,
    pageSize: String,
    labelSize: String,
    stickerInRow: Number,
    sort: Number,
  },
  { timestamps: true }
);

const Catalog = mongoose.models.catalog || mongoose.model('catalog', catalogSchema);

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const rows = await Catalog.find({ catalog: sp.get('name') }).sort({ sort: 1 }).lean();
  return json({ rows: rows.map((r) => ({ ...r, _id: String(r._id) })) });
}
