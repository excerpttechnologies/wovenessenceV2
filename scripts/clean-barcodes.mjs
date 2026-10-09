import { MongoClient, ObjectId } from "mongodb";
import fs from "fs";

const CONFIRM = process.argv.includes("--confirm");
const BY_BRANCH = process.env.BY_BRANCH === "1"; // set BY_BRANCH=1 to keep one per name per branch
const ONLY = (process.env.NAME || "").trim().toLowerCase(); // optional: set NAME=plain fabrics
const FIELDS = (process.env.REF_FIELDS || "groupId,group,groupID").split(",");

const client = new MongoClient(process.env.MONGO_URI);
await client.connect();
const db = client.db();
const groups = db.collection("groups");
const norm = (s) => String(s ?? "").trim().toLowerCase();

const docs = await groups.find({ isDeleted: { $ne: true } }).sort({ createdAt: 1, _id: 1 }).toArray();
const sets = new Map();
for (const d of docs) {
  const n = norm(d.groupName);
  if (!n || (ONLY && n !== ONLY)) continue;
  const k = BY_BRANCH ? `${n}|${d.branch}` : n;
  if (!sets.has(k)) sets.set(k, []);
  sets.get(k).push(d);
}

const remap = new Map(); // dup id -> master doc
const toDelete = [];
const report = [];
for (const [k, list] of sets) {
  if (list.length < 2) continue;
  const [master, ...rest] = list;
  rest.forEach((d) => { remap.set(String(d._id), master); toDelete.push(d); });
  report.push({ name: k, copies: list.length, keep: String(master._id), delete: rest.length, branches: [...new Set(list.map((d) => String(d.branch)))].length });
}

const dupStr = [...remap.keys()];
const dupObj = dupStr.filter((s) => ObjectId.isValid(s)).map((s) => new ObjectId(s));
const plan = [];
for (const { name } of await db.listCollections().toArray()) {
  if (name === "groups") continue;
  for (const f of FIELDS) {
    const n = await db.collection(name).countDocuments({ [f]: { $in: [...dupStr, ...dupObj] } });
    if (n) plan.push({ collection: name, field: f, docs: n });
  }
}

console.log({ active_groups: docs.length, duplicate_sets: report.length, groups_to_delete: toDelete.length, references_to_repoint: plan.reduce((a, p) => a + p.docs, 0), remaining_after: docs.length - toDelete.length });
console.table(report);
console.table(plan);

if (!toDelete.length) { console.log("No duplicates."); await client.close(); process.exit(0); }
if (!CONFIRM) { console.log("COUNT ONLY. Re-run with --confirm."); await client.close(); process.exit(0); }

fs.writeFileSync(`groups-dedupe-backup-${Date.now()}.json`, JSON.stringify({ deleted: toDelete, plan }, null, 2));

for (const p of plan) {
  const col = db.collection(p.collection);
  for (const [dupId, master] of remap) {
    await col.updateMany({ [p.field]: dupId }, { $set: { [p.field]: String(master._id) } });
    if (ObjectId.isValid(dupId)) await col.updateMany({ [p.field]: new ObjectId(dupId) }, { $set: { [p.field]: master._id } });
  }
}

const res = await groups.deleteMany({ _id: { $in: toDelete.map((d) => d._id) } });
console.log("Deleted groups:", res.deletedCount, "Remaining active:", await groups.countDocuments({ isDeleted: { $ne: true } }));
await client.close();