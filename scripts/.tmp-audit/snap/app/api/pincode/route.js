import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';

/* /api/pincode?pin=560001 - resolves an Indian PIN code to its city, district,
   state and country so the address block can fill itself in.

   Why a server route rather than calling the postal API from the browser:
     - one place to swap the provider, and the browser never learns the URL
     - results are cached, so re-typing the same PIN costs nothing
     - the answer is normalised into exactly the keys the form fields use

   Caching is two-layer. `MEM` survives within a server process; the `pincode`
   collection survives a restart AND covers the case where the upstream API is
   unreachable, which matters because a PIN code's district never changes. */

const json = (d, s = 200) => Response.json(d, { status: s });

const UPSTREAM = 'https://api.postalpincode.in/pincode/';
const TIMEOUT_MS = 6000;

const MEM = new Map();

const pincodeSchema = new mongoose.Schema(
  {
    pin: { type: String, index: true, unique: true },
    city: String,
    district: String,
    taluk: String,
    state: String,
    country: { type: String, default: 'India' },
    areas: [String],
  },
  { timestamps: true }
);
const Pincode = mongoose.models.pincode || mongoose.model('pincode', pincodeSchema, 'pincode');

/* the City picker (/api/cities) reads this collection. Seeding it from a
   lookup means a city the user has actually used shows up in the dropdown
   afterwards - the collection ships empty. */
const citySchema = new mongoose.Schema({
  name: String,
  state: String,
  country: { type: String, default: 'India' },
});
const City = mongoose.models.city || mongoose.model('city', citySchema);

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const pin = (new URL(req.url).searchParams.get('pin') || '').trim();
  if (!/^\d{6}$/.test(pin)) return json({ found: false, reason: 'A PIN code is 6 digits.' });

  if (MEM.has(pin)) return json({ found: true, ...MEM.get(pin), cached: 'memory' });

  await dbConnect();

  const saved = await Pincode.findOne({ pin }).lean();
  if (saved) {
    const hit = pick(saved);
    MEM.set(pin, hit);
    return json({ found: true, ...hit, cached: 'db' });
  }

  let body;
  try {
    /* AbortSignal.timeout so a slow upstream cannot hold the request open */
    const r = await fetch(UPSTREAM + pin, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error('upstream ' + r.status);
    body = await r.json();
  } catch (e) {
    return json({ found: false, reason: 'Could not reach the PIN code service.' });
  }

  const first = Array.isArray(body) ? body[0] : body;
  const offices = (first && first.PostOffice) || [];
  if (!first || first.Status !== 'Success' || !offices.length) {
    return json({ found: false, reason: 'No address found for ' + pin + '.' });
  }

  /* every post office under one PIN shares district/state, so office[0] is
     representative; the individual names become the `areas` hint */
  const o = offices[0];
  const hit = {
    pin,
    city: clean(o.District),
    district: clean(o.District),
    taluk: clean(o.Taluk || o.Block),
    state: clean(o.State),
    country: clean(o.Country) || 'India',
    areas: offices.map((x) => clean(x.Name)).filter(Boolean),
  };

  await Pincode.updateOne({ pin }, { $set: hit }, { upsert: true });
  if (hit.city) {
    await City.updateOne(
      { name: hit.city },
      { $set: { name: hit.city, state: hit.state, country: hit.country } },
      { upsert: true }
    );
  }
  MEM.set(pin, hit);

  return json({ found: true, ...hit });
}

/* the postal API pads some names with a trailing space */
function clean(v) {
  return String(v ?? '').trim();
}

function pick(d) {
  return {
    pin: d.pin,
    city: d.city || '',
    district: d.district || '',
    taluk: d.taluk || '',
    state: d.state || '',
    country: d.country || 'India',
    areas: d.areas || [],
  };
}
