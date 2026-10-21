import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import path from 'path';

import ProductGroup from '../models/ProductGroup.js';

/* Generic Group Name seeder.

   Usage (run from project root):
     node --env-file=.env scripts/seedGroups.mjs <businessId> <groupNamesJsonFile>

   Example:
     node --env-file=.env scripts/seedGroups.mjs 6a853ba0fb266c4358beb530 scripts/groups_business2.json

   <groupNamesJsonFile> is a JSON array of strings, path relative to project root.
   Upsert-safe: skips any name that already exists for that businessId. */

const [, , businessIdArg, groupsFileArg] = process.argv;

if (!businessIdArg || !groupsFileArg) {
  console.error('Usage: node --env-file=.env scripts/seedGroups.mjs <businessId> <groupNamesJsonFile>');
  process.exit(1);
}

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const filePath = path.resolve(process.cwd(), groupsFileArg);
  const raw = readFileSync(filePath, 'utf-8');
  const groupNames = JSON.parse(raw);
  console.log(`Loaded ${groupNames.length} group names from ${filePath}`);

  let created = 0;
  let skipped = 0;

  for (const name of groupNames) {
    const existing = await ProductGroup.findOne({ name, businessId: businessIdArg });
    if (existing) {
      skipped++;
      console.log(`SKIP (exists): ${name}`);
      continue;
    }
    await ProductGroup.create({ name, businessId: businessIdArg, prefix: '', parentId: null });
    created++;
    console.log(`CREATED: ${name}`);
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped}.`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
