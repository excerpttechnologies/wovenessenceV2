/**
 * Idempotent migration: backfill `placement: "sidebar"` on every existing
 * Product Type filter that does not yet carry a valid placement.
 *
 * Usage:
 *   node --env-file=.env scripts/migrateProductTypeFilterPlacement.mjs          # dry-run
 *   node --env-file=.env scripts/migrateProductTypeFilterPlacement.mjs --apply  # write updates
 */

import mongoose from 'mongoose';
import {
  FILTER_LABELS,
  FILTER_PLACEMENTS,
  LEGACY_DEFAULT_PLACEMENT,
} from '../lib/ecommerceFilterConfig.js';

const apply = process.argv.includes('--apply');
const TYPE_COLLECTION = 'producttypes';

function hasValidPlacement(value) {
  return FILTER_PLACEMENTS.includes(String(value ?? '').trim().toLowerCase());
}

async function run() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is required.');
  }
  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection(TYPE_COLLECTION);
  const docs = await col.find({}).toArray();

  let scanned = 0;
  let needsUpdate = 0;
  let updated = 0;
  let entriesBackfilled = 0;

  for (const doc of docs) {
    scanned += 1;
    const rawConfig = Array.isArray(doc.filterConfig) ? doc.filterConfig : [];
    const rawFilters = Array.isArray(doc.filters) ? doc.filters : [];
    let dirty = false;

    const nextConfig = [];
    const seenKeys = new Set();

    rawConfig.forEach((entry, idx) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return;
      const key = String(entry.key || entry.field || entry.filterId || '').trim();
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);

      if (hasValidPlacement(entry.placement)) {
        nextConfig.push({
          ...entry,
          placement: String(entry.placement).trim().toLowerCase(),
        });
      } else {
        dirty = true;
        entriesBackfilled += 1;
        nextConfig.push({
          ...entry,
          key,
          field: entry.field || key,
          placement: LEGACY_DEFAULT_PLACEMENT,
          displayOrder: entry.displayOrder ?? idx,
        });
      }
    });

    rawFilters.forEach((rawItem, idx) => {
      const isObj = rawItem && typeof rawItem === 'object' && !Array.isArray(rawItem);
      const key = String(isObj ? (rawItem.key || rawItem.field || rawItem.filterId || '') : (rawItem || '')).trim();
      if (!key || seenKeys.has(key)) return;
      seenKeys.add(key);

      dirty = true;
      entriesBackfilled += 1;
      const label = FILTER_LABELS[key] || key;
      nextConfig.push({
        key,
        field: key,
        label,
        displayLabel: label,
        displayOrder: nextConfig.length + idx,
        isActive: true,
        isVisible: true,
        isFilterable: true,
        selectionMode: 'multiple',
        placement: hasValidPlacement(rawItem?.placement)
          ? String(rawItem.placement).trim().toLowerCase()
          : LEGACY_DEFAULT_PLACEMENT,
        type: 'classification',
      });
    });

    if (!dirty) continue;
    needsUpdate += 1;

    if (apply) {
      await col.updateOne(
        { _id: doc._id },
        {
          $set: {
            filterConfig: nextConfig,
            filters: nextConfig.map((e) => e.key),
            updatedAt: new Date(),
          },
        },
      );
      updated += 1;
    }
  }

  console.log(JSON.stringify({
    mode: apply ? 'apply' : 'dry-run',
    scanned,
    needsUpdate,
    updated,
    entriesBackfilled,
  }, null, 2));

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
