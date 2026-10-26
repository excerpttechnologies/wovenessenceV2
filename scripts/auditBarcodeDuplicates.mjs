#!/usr/bin/env node
/* READ-ONLY duplicate audit.

   Usage (from project root):
     node --env-file=.env scripts/auditBarcodeDuplicates.mjs

   Writes nothing to the database. It reports, for the MONGODB_URI in .env:
     - barcodeLabel totals by status / source
     - duplicate barcode groups (same barcodeNo + businessId + locationId)
     - how many of those groups are "real" duplicates, i.e. more than one
       IN_STOCK row for the same barcode (the case the dedupe script removed)
     - items duplicated by itemCode and by normalised name
   Report lands in seed_reports/duplicate_audit/audit_<timestamp>.json
*/

import mongoose from 'mongoose';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Run with --env-file=.env');
  process.exit(1);
}

const SEED_SOURCES = ['suvarna_excel_seed', 'omshree_excel_seed', 'temple_warehouse_excel_seed'];

await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 20000 });
const db = mongoose.connection.db;

const out = {
  generatedAt: new Date().toISOString(),
  database: db.databaseName,
  host: (mongoose.connection.host || '').split('.').slice(0, 2).join('.'),
};

/* ------------------------------------------------------- barcodeLabel ---- */
const labels = db.collection('barcodeLabel');
out.barcodeLabel = {
  total: await labels.countDocuments({}),
  byStatus: await labels
    .aggregate([{ $group: { _id: '$status', n: { $sum: 1 }, qty: { $sum: { $ifNull: ['$qtyNum', 0] } } } }, { $sort: { n: -1 } }])
    .toArray(),
  bySource: await labels
    .aggregate([{ $group: { _id: '$source', n: { $sum: 1 }, qty: { $sum: { $ifNull: ['$qtyNum', 0] } } } }, { $sort: { n: -1 } }])
    .toArray(),
};

const groupByLocation = [
  {
    $group: {
      _id: { barcodeNo: '$barcodeNo', businessId: '$businessId', locationId: '$locationId' },
      docs: { $sum: 1 },
      inStock: { $sum: { $cond: [{ $eq: ['$status', 'IN_STOCK'] }, 1, 0] } },
      sources: { $addToSet: '$source' },
      statuses: { $addToSet: '$status' },
      ids: { $push: '$_id' },
    },
  },
  { $match: { docs: { $gt: 1 } } },
];

const dupGroups = await labels.aggregate(groupByLocation, { allowDiskUse: true }).toArray();

const summarise = (groups) => {
  const byShape = new Map();
  for (const g of groups) {
    const sources = [...g.sources].map((s) => s ?? '(none)').sort();
    const statuses = [...g.statuses].sort();
    const key = `${sources.join('+')} | ${statuses.join('+')}`;
    const cur = byShape.get(key) || { sources, statuses, groups: 0, extraDocs: 0, docs: 0 };
    cur.groups += 1;
    cur.docs += g.docs;
    cur.extraDocs += g.docs - 1;
    byShape.set(key, cur);
  }
  return [...byShape.values()].sort((a, b) => b.extraDocs - a.extraDocs);
};

const allInStockDup = dupGroups.filter((g) => g.inStock > 1);
const seedLineDup = dupGroups.filter(
  (g) => g.inStock > 1 && [...g.sources].every((s) => SEED_SOURCES.includes(s))
);
const hsrDup = dupGroups.filter(
  (g) => g.inStock > 1 && [...g.sources].every((s) => !SEED_SOURCES.includes(s))
);
const mixedStatusDup = dupGroups.filter((g) => g.inStock <= 1);

out.duplicates = {
  rule: 'same barcodeNo + businessId + locationId',
  duplicateGroups: dupGroups.length,
  extraDocs: dupGroups.reduce((a, g) => a + g.docs - 1, 0),
  byShape: summarise(dupGroups),
  allInStockDuplicateGroups: allInStockDup.length,
  allInStockExtraDocs: allInStockDup.reduce((a, g) => a + g.inStock - 1, 0),
  seedLineDuplicateGroups: seedLineDup.length,
  seedLineExtraDocs: seedLineDup.reduce((a, g) => a + g.inStock - 1, 0),
  hsrDuplicateGroups: hsrDup.length,
  hsrExtraDocs: hsrDup.reduce((a, g) => a + g.inStock - 1, 0),
  mixedStatusGroups: mixedStatusDup.length,
  hsrSamples: hsrDup.slice(0, 20).map((g) => ({
    barcodeNo: g._id.barcodeNo,
    businessId: String(g._id.businessId),
    locationId: String(g._id.locationId),
    docs: g.docs,
    inStock: g.inStock,
    sources: g.sources,
    statuses: g.statuses,
  })),
};

/* Same barcode number appearing at more than one location (not necessarily a
   duplicate unit - a legit transfer leaves the origin row in a different
   location). Reported for visibility only. */
const crossLocation = await labels
  .aggregate(
    [
      {
        $group: {
          _id: { barcodeNo: '$barcodeNo', businessId: '$businessId' },
          docs: { $sum: 1 },
          locations: { $addToSet: '$locationId' },
          statuses: { $addToSet: '$status' },
        },
      },
      { $match: { docs: { $gt: 1 } } },
      { $count: 'n' },
    ],
    { allowDiskUse: true }
  )
  .toArray();
out.duplicates.crossLocationBarcodeGroups = crossLocation[0]?.n || 0;

/* ------------------------------------------------------------- items ----- */
const items = db.collection('item');
out.items = {
  total: await items.countDocuments({}),
  duplicateByItemCode: await items
    .aggregate(
      [
        { $match: { itemCode: { $nin: [null, ''] } } },
        { $group: { _id: { itemCode: '$itemCode', businessId: '$businessId' }, docs: { $sum: 1 } } },
        { $match: { docs: { $gt: 1 } } },
        { $group: { _id: null, groups: { $sum: 1 }, extra: { $sum: { $subtract: ['$docs', 1] } } } },
      ],
      { allowDiskUse: true }
    )
    .toArray(),
  duplicateByName: await items
    .aggregate(
      [
        { $match: { name: { $nin: [null, ''] } } },
        {
          $group: {
            _id: { name: { $toLower: { $trim: { input: '$name' } } }, businessId: '$businessId' },
            docs: { $sum: 1 },
          },
        },
        { $match: { docs: { $gt: 1 } } },
        { $group: { _id: null, groups: { $sum: 1 }, extra: { $sum: { $subtract: ['$docs', 1] } } } },
      ],
      { allowDiskUse: true }
    )
    .toArray(),
};

const dir = path.join('seed_reports', 'duplicate_audit');
mkdirSync(dir, { recursive: true });
const file = path.join(dir, `audit_${out.generatedAt.replace(/[:.]/g, '-')}.json`);
writeFileSync(file, JSON.stringify(out, null, 2));

console.log(JSON.stringify(out, null, 2));
console.log(`\nReport written to ${file}`);

await mongoose.disconnect();
