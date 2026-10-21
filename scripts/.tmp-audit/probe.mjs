import mongoose from 'mongoose';
import { signSession } from '../../lib/auth.js';
await mongoose.connect(process.env.MONGODB_URI);
const user = await mongoose.connection.db.collection('user').findOne({ role: /admin/i });
await mongoose.disconnect();
const cookie = 'orbit_session=' + signSession({ id: String(user._id), name: user.name, email: user.email, role: user.role, locationIds: (user.locationIds || []).map(String), allow: user.allow || [], deny: user.deny || [] });
for (const p of ['/api/options?ref=uom', '/api/supplier?perPage=1', '/api/sell-pos?perPage=1']) {
  const r = await fetch('http://localhost:3000' + p, { headers: { cookie } });
  const t = await r.text();
  console.log('=====', p, r.status, '\n', t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 1500));
}
