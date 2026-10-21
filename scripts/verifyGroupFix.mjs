/* Verify the group-resolution fix against real data, replicating the route
   logic (no Next.js needed): Group = parent of the item's pick when it has
   one, the pick itself when it does not; Sub Group only when there is a
   parent. */
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI || process.env.MONGODB_URI_SERVER;
await mongoose.connect(uri);
const db = mongoose.connection.db;

const isValid = (v) => mongoose.isValidObjectId(String(v ?? ''));

const items = await db.collection('item').find({
  subGroupId: { $exists: true, $ne: null },
}).limit(500).toArray();
console.log('items with subGroupId:', items.length);

const ids = [...new Set(items.map((i) => String(i.subGroupId)))].filter(isValid);
const subs = await db.collection('productgroup').find({ _id: { $in: ids.map((v) => new mongoose.Types.ObjectId(v)) } }).toArray();
const subById = new Map(subs.map((s) => [String(s._id), s]));

const parentIds = [...new Set(subs.map((s) => String(s.parentId || '')).filter(isValid))];
const parents = await db.collection('productgroup').find({ _id: { $in: parentIds.map((v) => new mongoose.Types.ObjectId(v)) } }).toArray();
const groupName = new Map(parents.map((p) => [String(p._id), p.name || '']));

const groupOf = (sub) => {
  if (!sub) return '';
  if (sub.parentId && isValid(sub.parentId)) return groupName.get(String(sub.parentId)) || '';
  return sub.name || '';
};
const subGroupOf = (sub) =>
  sub && sub.parentId && isValid(sub.parentId) ? (sub.name || '') : '';

let topLevel = 0, subbed = 0, brokenParent = 0;
for (const item of items) {
  const sub = subById.get(String(item.subGroupId || ''));
  if (!sub) continue;
  const g = groupOf(sub), sg = subGroupOf(sub);
  if (sub.parentId) {
    subbed++;
    if (!g) brokenParent++;
  } else {
    topLevel++;
    if (!g) console.log('MISSING:', item.itemCode, String(item.subGroupId));
    if (sg) console.log('WRONG SUBGROUP:', item.itemCode, sg);
  }
}
console.log({ topLevel, subbed, brokenParent });

/* show a few examples of each */
const show = (label, items, wantParent) => {
  const rows = items
    .map((i) => ({ item: i, sub: subById.get(String(i.subGroupId || '')) }))
    .filter(({ sub }) => sub && Boolean(sub.parentId) === wantParent)
    .slice(0, 3);
  for (const { item, sub } of rows) {
    console.log(label, JSON.stringify({
      itemCode: item.itemCode, subGroup: subGroupOf(sub), group: groupOf(sub),
    }));
  }
};
show('TOP-LEVEL:', items, false);
show('SUB-GROUP:', items, true);

/* the reported barcode */
const unit = await db.collection('barcodeLabel').findOne({ barcodeNo: '10A1321' });
const item = await db.collection('item').findOne({ _id: new mongoose.Types.ObjectId(String(unit.itemId)) });
const sub = subById.get(String(item.subGroupId || ''));
console.log('10A1321 =>', JSON.stringify({ itemName: item.name, subGroup: subGroupOf(sub), group: groupOf(sub) }));

await mongoose.disconnect();
