// scripts/fix-hsr-final.js
require("dotenv").config();
const { MongoClient } = require("mongodb");

const URI = process.env.MONGO_URI || process.env.MONGODB_URI || process.env.MONGO_URL || process.env.DATABASE_URL;
const DB = "grooretailerp1";
const COLS = process.env.COLLECTION ? [process.env.COLLECTION] : ["barcodeLabel"];
const APPLY = process.env.APPLY === "1";
const GOOD_SOURCES = ["hsr_stock_correct", "hsr_master_stock_create"];
const COPY = ["hsn", "gst", "supplierId", "purRate", "retailPrice", "offerPrice",
  "wspPrice", "dpPrice", "uom", "uomType", "itemId", "itemName", "groupId", "createdAt"];

(async () => {
  if (!URI) throw new Error("No Mongo URI in .env");
  const client = new MongoClient(URI);
  await client.connect();
  const db = client.db(DB);

  for (const name of COLS) {
    const col = db.collection(name);
    const bad = await col.find({ source: "hsr_stock_final" }).toArray();
    console.log(`\n[${name}] bad docs (hsr_stock_final): ${bad.length}`);

    // load good docs once, keyed by barcodeNo
    const goodDocs = await col.find({ source: { $in: GOOD_SOURCES } }).toArray();
    const good = new Map();
    for (const g of goodDocs) {
      const prev = good.get(g.barcodeNo);
      // prefer hsr_stock_correct, then one that has hsn + supplierId
      if (!prev || (g.supplierId && !prev.supplierId) || (g.source === "hsr_stock_correct" && prev.source !== "hsr_stock_correct")) good.set(g.barcodeNo, g);
    }

    let fixed = 0, noMatch = 0;
    const ops = [];
    const noMatchSample = [];
    for (const b of bad) {
      const g = good.get(b.barcodeNo);
      if (!g) { noMatch++; if (noMatchSample.length < 5) noMatchSample.push(b.barcodeNo); continue; }
      const set = {};
      for (const f of COPY) if (g[f] !== undefined && g[f] !== null) set[f] = g[f];
      if (!set.createdAt || set.createdAt < new Date("2000-01-01")) set.createdAt = new Date();
      ops.push({ updateOne: { filter: { _id: b._id }, update: { $set: set } } });
      fixed++;
    }
    console.log(`Fixable: ${fixed} | No correct doc found: ${noMatch}`, noMatchSample);

    if (APPLY && ops.length) {
      const res = await col.bulkWrite(ops, { ordered: false });
      console.log(`Modified: ${res.modifiedCount}`);
    }
  }
  if (!APPLY) console.log("\nDry run. Set APPLY=1 to update.");
  await client.close();
})().catch((e) => { console.error(e.message); process.exit(1); });