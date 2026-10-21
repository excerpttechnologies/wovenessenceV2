import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';

/* /api/cities?q=<term> - the city picker. Replaces the `cities` branch of
   the old /api/settings/[action] handler. */

const json = (d, s = 200) => Response.json(d, { status: s });

const citySchema = new mongoose.Schema({
  name: String,
  state: String,
  country: { type: String, default: 'India' },
});

const City = mongoose.models.city || mongoose.model('city', citySchema);

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const q = (sp.get('q') || '').trim();
  const filter = q
    ? { name: { $regex: String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
    : {};

  const rows = await City.find(filter).limit(200).lean();

  return json({
    options: rows.map((c) => ({ value: c.name, label: c.name })),
  });
}
