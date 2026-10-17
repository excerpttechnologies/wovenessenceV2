// scripts/inspect-barcode.js
// Run: node scripts/inspect-barcode.js            (default barcode 10A2383)
//      set BARCODE=XXXX && node scripts/inspect-barcode.js
require("dotenv").config();
const { MongoClient } = require("mongodb");

const URI =
  process.env.MONGO_URI || process.env.MONGODB_URI ||
  process.env.MONGO_URL || process.env.DATABASE_URL;
const DB = "grooretailerp1";
const BARCODE = process.env.BARCODE || "10A2383";
const MAIN = ["barcodeLabel", "barcodelabel"];
const KEY_FIELDS = ["hsn", "supplierId", "purRate", "gst", "createdAt", "retailPrice", "wspPrice", "uom"];

const keysOf = (d) => Object.keys(d).sort();
const short = (d) => {
  const { _id, barcodeNo, itemName, qty, qtyNum, status, finYear, source, locationId,
    currentLocationId, businessId, currentBusinessId, supplierId, hsn, gst, purRate,
    retailPrice, wspPrice, uom, createdAt, updatedAt, customFields } = d;
  return { _id, barcodeNo, itemName, qty, qtyNum, status, finYear, source, locationId,
    currentLocationId, businessId, currentBusinessId, supplierId, hsn, gst, purRate,
    retailPrice, wspPrice, uom, createdAt, updatedAt, customFields };
};

(async () => {
  if (!URI) throw new Error("No Mongo URI in .env");
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db(DB);
  const cols = (await db.listCollections().toArray()).map((c) => c.name);

  // 1. Find the barcode in EVERY collection (any string field = barcode)
  console.log(`\n===== 1. Where does ${BARCODE} exist? =====`);
  const hits = [];
  for (const name of cols) {
    const col = db.collection(name);
    const docs = await col
      .find({ $or: [{ barcodeNo: BARCODE }, { barcode: BARCODE }, { barcodeNumber: BARCODE }, { itemCode: BARCODE }] })
      .limit(20).toArray();
    if (docs.length) {
      console.log(`\n[${name}] ${docs.length} doc(s)`);
      docs.forEach((d) => { console.log(JSON.stringify(short(d), null, 2)); hits.push({ name, d }); });
    }
  }
  if (!hits.length) console.log("Not found in any collection by barcodeNo/barcode/itemCode.");

  // 2. Key diff between docs of the same collection
  console.log("\n===== 2. Missing/extra keys between docs =====");
  const byCol = {};
  hits.forEach((h) => (byCol[h.name] = byCol[h.name] || []).push(h.d));
  for (const [name, docs] of Object.entries(byCol)) {
    if (docs.length < 2) continue;
    const all = new Set(docs.flatMap(keysOf));
    docs.forEach((d, i) => {
      const missing = [...all].filter((k) => !(k in d));
      console.log(`[${name}] doc#${i + 1} loc=${d.currentLocationId || d.locationId} missing keys:`, missing);
    });
  }

  // 3. Shape analysis per location + source in main collections
  console.log("\n===== 3. Data quality by location/source =====");
  for (const name of MAIN) {
    if (!cols.includes(name)) continue;
    const col = db.collection(name);
    const groups = await col.aggregate([
      { $group: {
          _id: { loc: { $ifNull: ["$currentLocationId", "$locationId"] }, source: "$source", fin: "$finYear" },
          count: { $sum: 1 },
          ...Object.fromEntries(KEY_FIELDS.map((f) => [
            "no_" + f,
            { $sum: { $cond: [{ $in: [{ $type: "$" + f }, ["missing", "null"]] }, 1, 0] } },
          ])),
      } },
      { $sort: { count: -1 } },
    ]).toArray();
    console.log(`\n[${name}]`);
    console.table(groups.map((g) => ({ ...g._id, loc: String(g._id.loc), count: g.count,
      ...Object.fromEntries(KEY_FIELDS.map((f) => ["no_" + f, g["no_" + f]])) })));

    // distinct key-sets (shows docs created by different code paths)
    const shapes = {};
    for await (const d of col.find({}, { projection: { _id: 0 } }).limit(3000)) {
      const k = keysOf(d).join(",");
      shapes[k] = (shapes[k] || 0) + 1;
    }
    const arr = Object.entries(shapes).sort((a, b) => b[1] - a[1]);
    console.log(`Distinct key-sets (first 3000 docs): ${arr.length}`);
    const base = new Set(arr[0][0].split(","));
    arr.slice(1, 6).forEach(([k, n]) => {
      const ks = new Set(k.split(","));
      console.log(` ${n} docs | missing vs main:`, [...base].filter((x) => !ks.has(x)),
        "| extra:", [...ks].filter((x) => !base.has(x)));
    });
  }

  // 4. Docs with invalid/null dates (cause of 02-01-1900 / age 46309)
  console.log("\n===== 4. Null/invalid createdAt =====");
  for (const name of MAIN) {
    if (!cols.includes(name)) continue;
    const n = await db.collection(name).countDocuments({
      $or: [{ createdAt: { $exists: false } }, { createdAt: null }, { createdAt: { $lt: new Date("2000-01-01") } }],
    });
    console.log(`[${name}] docs with missing/old createdAt:`, n);
  }

  await client.close();
})().catch((e) => { console.error(e); process.exit(1); });