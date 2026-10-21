/* ==========================================================================
   ITEM GROUPS FROM newData.xlsx - one-time data fix (user, 16-10-2026).

   The reports read an item's Group / Sub Group from the ITEM master
   (item.subGroupId -> productgroup; a sub group's parent is the Group).
   Items such as SRB pointed at a sub group (SRB under READY BITS), so the
   Excel's Group Name did not show where it should.

   Wanted: for every item in the sheet, the sheet's "Group Name" in BOTH
   places - Group AND Sub Group. Done the way the DB already models it
   (INSKIRT has a sub group INSKIRT): for Group G the item points at a sub
   group named G whose parent is G.

     node --env-file=.env scripts/fixItemGroupsFromNewData.mjs [--apply]

     (default)  DRY RUN - prints every change; writes nothing.
     --apply    writes, after saving a backup of every item's old subGroupId
                to scripts/reports/item-groups-backup-<time>.json.

   Per item (matched by name or itemCode inside the business of the row's
   location, as the seed does):
     - G = the Group Name it appears under most in the sheet (5 items appear
       under two groups; the majority wins, the split is printed)
     - top group G: productgroup {businessId, name G, parentId null}, created
       if missing
     - sub group G: productgroup {businessId, name G, parentId top._id},
       created if missing
     - item.subGroupId = sub group's _id (only if different)
   Nothing else on the item, and no barcode, is changed.
   ========================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import XLSX from 'xlsx';

const APPLY = process.argv.includes('--apply');
const FILE = 'newData.xlsx';
const txt = (v) => String(v ?? '').trim();
const norm = (s) => txt(s).toLowerCase().replace(/\s+/g, ' ');
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ci = (s) => new RegExp('^' + esc(txt(s)) + '$', 'i');

async function main() {
  const rows = XLSX.utils.sheet_to_json(XLSX.read(fs.readFileSync(FILE)).Sheets['MASTER JNR (2)'], { raw: false, defval: '' });
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  /* location name -> business (only businesses that still exist) */
  const biz = new Set((await db.collection('business').find({}, { projection: { _id: 1 } }).toArray()).map((b) => String(b._id)));
  const locs = (await db.collection('companylocation').find({}, { projection: { name: 1, businessId: 1 } }).toArray())
    .filter((l) => biz.has(String(l.businessId)));
  const bizOfLoc = (name) => {
    const hit = locs.filter((l) => norm(l.name) === norm(name));
    return hit.length === 1 ? hit[0].businessId : null;
  };

  /* business|item -> { group -> count } */
  const tally = new Map();
  rows.forEach((r) => {
    const b = bizOfLoc(r['Location Name']);
    const item = txt(r['Item Name']);
    const group = txt(r['Group Name']);
    if (!b || !item || !group) return;
    const key = String(b) + '|' + item;
    if (!tally.has(key)) tally.set(key, { businessId: b, item, groups: new Map() });
    const g = tally.get(key).groups;
    g.set(group, (g.get(group) || 0) + 1);
  });

  const created = [];
  const groupCache = new Map();
  const findOrCreate = async (businessId, name, parentId) => {
    const key = `${businessId}|${norm(name)}|${parentId || ''}`;
    if (groupCache.has(key)) return groupCache.get(key);
    let g = await db.collection('productgroup').findOne({ businessId, name: ci(name), parentId: parentId || null });
    if (!g) {
      const now = new Date();
      const doc = { businessId, name, prefix: '', parentId: parentId || null, createdAt: now, updatedAt: now, __v: 0 };
      g = APPLY ? { ...doc, _id: (await db.collection('productgroup').insertOne(doc)).insertedId } : { ...doc, _id: new mongoose.Types.ObjectId() };
      created.push(parentId ? `sub group ${name} (under ${name})` : `group ${name}`);
    }
    groupCache.set(key, g);
    return g;
  };

  const changes = [];
  const report = [];
  for (const { businessId, item, groups } of tally.values()) {
    const ranked = [...groups.entries()].sort((a, b) => b[1] - a[1]);
    const groupName = ranked[0][0];
    const items = await db.collection('item').find({ businessId, $or: [{ name: ci(item) }, { itemCode: ci(item) }] }).toArray();
    if (!items.length) { report.push({ item, group: groupName, action: 'item not found' }); continue; }
    const top = await findOrCreate(businessId, groupName, null);
    const sub = await findOrCreate(businessId, groupName, top._id);
    for (const it of items) {
      const old = it.subGroupId ? await db.collection('productgroup').findOne({ _id: it.subGroupId }, { projection: { name: 1, parentId: 1 } }) : null;
      const oldParent = old?.parentId ? await db.collection('productgroup').findOne({ _id: old.parentId }, { projection: { name: 1 } }) : null;
      const before = old ? (oldParent ? `${oldParent.name} > ${old.name}` : `${old.name}`) : '(none)';
      const same = String(it.subGroupId || '') === String(sub._id);
      report.push({
        item: it.name || it.itemCode, group: groupName,
        split: ranked.length > 1 ? ranked.map(([g, n]) => `${g} ${n}`).join(' / ') : '',
        before, after: `${groupName} > ${groupName}`, action: same ? 'already ok' : (APPLY ? 'updated' : 'would update'),
      });
      if (!same) changes.push({ _id: it._id, name: it.name, oldSubGroupId: it.subGroupId || null, newSubGroupId: sub._id });
    }
  }

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} - item groups from ${FILE}\n`);
  console.table(report);
  console.log(`\nitems to change: ${changes.length}   ${APPLY ? 'created' : 'would create'}: ${created.length ? created.join(' | ') : 'nothing'}`);

  if (APPLY && changes.length) {
    const dir = path.resolve('scripts', 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const backup = path.join(dir, `item-groups-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(backup, JSON.stringify(changes, null, 2));
    console.log('backup of old values: ' + path.relative(process.cwd(), backup));
    for (const c of changes) {
      await db.collection('item').updateOne({ _id: c._id }, { $set: { subGroupId: c.newSubGroupId, updatedAt: new Date() } });
    }
    console.log(`updated ${changes.length} item(s).`);
  }
  if (!APPLY) console.log('\n*** DRY RUN - nothing written. Re-run with --apply to write. ***');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('FAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
