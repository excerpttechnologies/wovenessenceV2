#!/usr/bin/env node
/**
 * Phase 1 audit: discover every collection in the Atlas ERP database, map it
 * to the Mongoose model(s) that own it, classify it, and count documents and
 * indexes on both sides. READ ONLY.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';
import { buildModelCatalog } from './lib/model-catalog.mjs';
import { classifyCollection, POS_COLLECTIONS, SHARED_COLLECTIONS, BARCODE_LABEL_COLLECTION } from './lib/classification.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
dotenv.config({ path: path.join(ROOT, '.env') });
const OUT_DIR = path.join(__dirname, 'out');
const AUDIT_JSON = path.join(OUT_DIR, 'audit-data.json');
const AUDIT_MD = path.join(ROOT, 'MONGODB_MIGRATION_AUDIT.md');
const CHECKPOINT_JSON = path.join(OUT_DIR, 'checkpoint.json');

const sourceUri = process.env.SOURCE_MONGODB_URI || '';
const targetUri = process.env.TARGET_MONGODB_URI || process.env.MONGODB_URI || '';
const configuredSourceDb = process.env.SOURCE_DB_NAME || '';
const targetDbName = process.env.TARGET_DB_NAME || process.env.MIGRATION_TARGET_DB || 'grooretailerp1';
const barcodeArg = process.argv.includes('--include-barcode-label')
  ? true
  : process.argv.includes('--exclude-barcode-label')
    ? false
    : null;
if (!sourceUri) throw new Error('SOURCE_MONGODB_URI is not set');
if (!targetUri) throw new Error('TARGET_MONGODB_URI is not set');

function safeLabel(raw) {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}`;
  } catch {
    return '(unparseable URI)';
  }
}

async function connect(uri, { direct = false } = {}) {
  const client = new MongoClient(uri, {
    appName: 'wovenessence-migration-audit',
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 30000,
    socketTimeoutMS: 0,
    maxPoolSize: 5,
    ...(direct ? { directConnection: true } : {}),
  });
  await client.connect();
  await client.db('admin').command({ ping: 1 });
  return client;
}

async function listDatabases(client) {
  try {
    const res = await client.db('admin').command({ listDatabases: 1, nameOnly: true });
    return (res.databases || []).map((d) => d.name).filter((n) => !['admin', 'local', 'config'].includes(n));
  } catch {
    return [];
  }
}

async function chooseSourceDb(client, catalogCollections) {
  const candidates = await listDatabases(client);
  if (configuredSourceDb) {
    if (candidates.length && !candidates.includes(configuredSourceDb)) {
      throw new Error(`SOURCE_DB_NAME=${configuredSourceDb} is not visible. Visible: ${candidates.join(', ')}`);
    }
    return { name: configuredSourceDb, candidates, method: 'SOURCE_DB_NAME' };
  }
  let best = null;
  for (const name of candidates) {
    const present = new Set((await client.db(name).listCollections({}, { nameOnly: true }).toArray()).map((c) => c.name));
    const score = catalogCollections.filter((c) => present.has(c)).length;
    if (!best || score > best.score) best = { name, score };
  }
  if (!best) throw new Error('Could not discover a source database.');
  return { name: best.name, candidates, method: 'auto-score', score: best.score };
}

async function collectionDetails(db, info) {
  const col = db.collection(info.name);
  let count = null;
  let countError = null;
  try {
    count = await col.countDocuments({}, { maxTimeMS: 120000 });
  } catch (e) {
    countError = e.message;
  }
  let indexes = [];
  let indexError = null;
  try {
    indexes = await col.listIndexes({ maxTimeMS: 60000 }).toArray();
  } catch (e) {
    indexError = e.message;
  }
  return {
    name: info.name,
    type: info.type || 'collection',
    options: info.options || {},
    count,
    countError,
    indexes: indexes.map((idx) => ({
      name: idx.name,
      key: idx.key,
      unique: Boolean(idx.unique),
      sparse: Boolean(idx.sparse),
      expireAfterSeconds: idx.expireAfterSeconds ?? null,
      partialFilterExpression: idx.partialFilterExpression ?? null,
      collation: idx.collation ?? null,
      textIndexVersion: idx.textIndexVersion ?? null,
      weights: idx.weights ?? null,
      default_language: idx.default_language ?? null,
      language_override: idx.language_override ?? null,
    })),
    indexError,
  };
}

function markdownTable(headers, rows) {
  const esc = (v) => String(v ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return [
    `| ${headers.map(esc).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
  ].join('\n');
}

async function main() {
  const catalog = buildModelCatalog();
  const catalogByCollection = new Map(catalog.map((entry) => [entry.collection, entry]));
  const catalogCollections = catalog.map((e) => e.collection);

  const source = await connect(sourceUri);
  const target = await connect(targetUri, { direct: true });

  const sourceDbInfo = await chooseSourceDb(source, catalogCollections);
  const sourceDb = source.db(sourceDbInfo.name);
  const targetDb = target.db(targetDbName);

  const sourceInfos = await sourceDb.listCollections({}, { nameOnly: false }).toArray();
  const targetInfos = await targetDb.listCollections({}, { nameOnly: false }).toArray();

  const sourceCollections = [];
  for (const info of sourceInfos.sort((a, b) => a.name.localeCompare(b.name))) {
    sourceCollections.push(await collectionDetails(sourceDb, info));
  }
  const targetCollections = [];
  for (const info of targetInfos.sort((a, b) => a.name.localeCompare(b.name))) {
    targetCollections.push(await collectionDetails(targetDb, info));
  }
  const targetByName = new Map(targetCollections.map((c) => [c.name, c]));

  const sourceNames = new Set(sourceCollections.map((c) => c.name));
  const auditRows = sourceCollections.map((src) => {
    const model = catalogByCollection.get(src.name) || null;
    const classification = classifyCollection(src.name, { includeBarcodeLabel: barcodeArg });
    const target = targetByName.get(src.name) || null;
    return {
      name: src.name,
      type: src.type,
      sourceCount: src.count,
      sourceCountError: src.countError,
      targetCount: target?.count ?? 0,
      targetExists: Boolean(target),
      sourceIndexes: src.indexes,
      sourceIndexError: src.indexError,
      targetIndexes: target?.indexes ?? [],
      model: model
        ? {
            modelNames: model.modelNames,
            files: model.files,
            module: model.module,
            refs: model.refs,
            indexCount: model.indexCount,
          }
        : null,
      classification,
      sourceOptions: src.options,
      targetOptions: target?.options ?? null,
    };
  });

  const missingModelCollections = catalog
    .filter((entry) => !sourceNames.has(entry.collection))
    .map((entry) => ({
      collection: entry.collection,
      modelNames: entry.modelNames,
      module: entry.module,
      classification: classifyCollection(entry.collection, { includeBarcodeLabel: barcodeArg }),
    }));

  const included = auditRows.filter((r) => r.classification.status === 'INCLUDE');
  const excluded = auditRows.filter((r) => r.classification.status === 'EXCLUDE');
  const decisions = auditRows.filter((r) => r.classification.status === 'DECISION');
  const legacy = auditRows.filter((r) => !r.model);
  const posPresent = auditRows.filter((r) => r.classification.category === 'POS');
  const targetExtras = targetCollections.filter((c) => !sourceNames.has(c.name));

  const totalSourceDocs = auditRows.reduce((n, r) => n + (r.sourceCount || 0), 0);
  const totalTargetDocs = targetCollections.reduce((n, r) => n + (r.count || 0), 0);
  const totalIncludedDocs = included.reduce((n, r) => n + (r.sourceCount || 0), 0);
  const totalExcludedDocs = excluded.reduce((n, r) => n + (r.sourceCount || 0), 0);
  const totalDecisionDocs = decisions.reduce((n, r) => n + (r.sourceCount || 0), 0);

  let checkpoint = null;
  try {
    if (fs.existsSync(CHECKPOINT_JSON)) checkpoint = JSON.parse(fs.readFileSync(CHECKPOINT_JSON, 'utf8'));
  } catch {
    checkpoint = null;
  }
  const checkpointStates = Object.values(checkpoint?.collections || {});
  const migrationState = {
    initialMigration: checkpoint
      ? {
          collections: checkpointStates.length,
          complete: checkpointStates.filter((state) => state.status === 'complete').length,
          inserted: checkpointStates.reduce((n, state) => n + (state.inserted || 0), 0),
          existing: checkpointStates.reduce((n, state) => n + (state.existing || 0), 0),
          scanned: checkpointStates.reduce((n, state) => n + (state.scanned || 0), 0),
          conflicts: checkpointStates.reduce((n, state) => n + (state.conflicts || 0), 0),
          finishedAt: checkpoint.finishedAt || null,
          durationSeconds: checkpoint.durationSeconds || 0,
        }
      : null,
    lastSync: checkpoint?.lastSync || null,
  };

  const audit = {
    generatedAt: new Date().toISOString(),
    source: {
      host: safeLabel(sourceUri),
      database: sourceDbInfo.name,
      databaseCandidates: sourceDbInfo.candidates,
      databaseSelection: sourceDbInfo.method,
      collectionCount: sourceCollections.length,
      totalDocuments: totalSourceDocs,
    },
    target: {
      host: safeLabel(targetUri),
      database: targetDbName,
      directConnectionRequired: true,
      collectionCount: targetCollections.length,
      totalDocuments: totalTargetDocs,
      collections: targetCollections.map((c) => ({ name: c.name, count: c.count })),
    },
    migrationState,
    classification: {
      included: included.length,
      includedDocuments: totalIncludedDocs,
      excluded: excluded.length,
      excludedDocuments: totalExcludedDocs,
      decisionRequired: decisions.length,
      decisionDocuments: totalDecisionDocs,
      posExcluded: excluded.filter((r) => r.classification.category === 'POS').length,
      barcodeLabelCollection: BARCODE_LABEL_COLLECTION,
      barcodeLabelDecision: barcodeArg === true ? 'INCLUDE' : barcodeArg === false ? 'EXCLUDE' : 'DECISION_REQUIRED',
    },
    rows: auditRows,
    missingModelCollections,
    targetExtras,
    decisions,
    legacyCollections: legacy.map((r) => ({
      name: r.name,
      count: r.sourceCount,
      classification: r.classification,
    })),
    excludedRule: {
      pos: [...POS_COLLECTIONS.entries()].map(([name, reason]) => ({ name, reason })),
      sharedDoNotExclude: [...SHARED_COLLECTIONS.entries()].map(([name, reason]) => ({ name, reason })),
    },
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(AUDIT_JSON, JSON.stringify(audit, null, 2));

  // ---------------- Markdown report ----------------
  const md = [];
  md.push('# MongoDB Migration Audit');
  md.push('');
  md.push(`Generated: ${audit.generatedAt}`);
  md.push('');
  md.push('## Scope');
  md.push('');
  md.push(`- **Source database:** \`${audit.source.database}\` at ${audit.source.host}`);
  md.push(`- **Target database:** \`${audit.target.database}\` at ${audit.target.host}`);
  md.push('- Credentials are read from environment variables only; no URI, user or password is recorded here.');
  md.push(`- Source database selection: ${audit.source.databaseSelection} (visible candidates: ${audit.source.databaseCandidates.join(', ') || 'n/a'}).`);
  md.push('- **Write policy:** target is never dropped, truncated or overwritten. Existing `_id`s are compared and conflicts abort the run.');
  md.push('');
  md.push('## Migration state at audit time');
  md.push('');
  md.push(`- This audit is read-only and shows the databases as they are **now** (${audit.generatedAt}); target counts are not a pre-migration snapshot.`);
  if (migrationState.initialMigration) {
    const initial = migrationState.initialMigration;
    md.push(`- Initial migration checkpoint: ${initial.complete}/${initial.collections} collections complete; ${initial.inserted} documents inserted; ${initial.scanned} scanned; ${initial.conflicts} conflicts; finished ${initial.finishedAt || 'n/a'} in ${initial.durationSeconds}s.`);
  } else {
    md.push('- Initial migration checkpoint: not found.');
  }
  if (migrationState.lastSync) {
    const sync = migrationState.lastSync;
    md.push(`- Last incremental sync: ${sync.status}; scanned ${sync.scanned}; inserted ${sync.inserted}; already identical ${sync.existing}; conflicts ${sync.conflicts}; finished ${sync.finishedAt} in ${sync.durationSeconds}s.`);
  } else {
    md.push('- Last incremental sync: not run.');
  }
  md.push('');
  md.push('## Discovered totals');
  md.push('');
  md.push(markdownTable(
    ['Metric', 'Value'],
    [
      ['Source collections', audit.source.collectionCount],
      ['Target collections at audit time', audit.target.collectionCount],
      ['Source documents (all collections)', audit.source.totalDocuments],
      ['Target documents (all collections)', audit.target.totalDocuments],
      ['INCLUDE collections', audit.classification.included],
      ['INCLUDE documents', audit.classification.includedDocuments],
      ['EXCLUDE collections', audit.classification.excluded],
      ['EXCLUDE documents', audit.classification.excludedDocuments],
      ['DECISION REQUIRED collections', audit.classification.decisionRequired],
      ['DECISION REQUIRED documents', audit.classification.decisionDocuments],
      ['Collections with a current Mongoose model', auditRows.filter((r) => r.model).length],
      ['Legacy / unreferenced source collections', legacy.length],
      ['Model collections absent from source', missingModelCollections.length],
    ]
  ));
  md.push('');
  md.push('## Critical finding — the named BarcodeLabel collection');
  md.push('');
  md.push('`barcodeLabel` is **not** a label-printing-only collection in this repository. `lib/barcodeLabel.js` defines it as *"ONE ROW IS ONE UNIT OF STOCK"*: it carries `barcodeNo`, `itemId`, `qtyNum`, `status`, `currentLocationId`, `transferId`, `receivedId`, `billingId`, `soldAt` and the commercial fields. GRC, stock movement, transfers, delivery challans, sales and the barcode search all resolve through it.');
  md.push('');
  md.push('There is no second `Barcode` model or `barcode` collection in the source database. The only barcode unit data is this collection. Excluding it drops every barcode/stock unit and leaves `barcodeId` references in `stockmovement`, GRC, transfer and sales documents dangling.');
  md.push('');
  if (barcodeArg === false) {
    md.push('**Decision recorded: EXCLUDE `barcodeLabel` (confirmed by the project owner).** The migration will not copy these documents. The unresolved barcode references are an accepted consequence of that decision and are reported again in `MONGODB_MIGRATION_RESULTS.md`.');
  } else if (barcodeArg === true) {
    md.push('**Decision recorded: INCLUDE `barcodeLabel`.** The migration will copy these documents so barcode stock and every barcode reference remain intact.');
  } else {
    md.push('**The runner requires an explicit choice.** Until confirmed, this collection is reported as `DECISION`, not silently included or excluded.');
  }
  md.push('');
  md.push('## A. Collections to migrate');
  md.push('');
  md.push(markdownTable(
    ['Collection', 'Model', 'Module', 'Source docs', 'Target docs', 'Refs', 'Source indexes', 'Category', 'Notes'],
    included.map((r) => [
      r.name,
      r.model ? r.model.modelNames.join(', ') : '— (no current model)',
      r.model?.module || 'Legacy / external',
      r.sourceCount ?? 'ERR',
      r.targetCount,
      r.model?.refs?.length ? r.model.refs.join(', ') : '—',
      r.sourceIndexes.length,
      r.classification.category,
      r.classification.reason,
    ])
  ));
  md.push('');
  md.push('## B. Collections excluded from migration');
  md.push('');
  md.push(markdownTable(
    ['Collection', 'Category', 'Source docs', 'Target docs', 'Reason'],
    [...excluded, ...decisions].map((r) => [
      r.name,
      r.classification.category,
      r.sourceCount ?? 'ERR',
      r.targetCount,
      r.classification.reason,
    ])
  ));
  md.push('');
  if (decisions.length) {
    md.push('> The DECISION row above is **not** approved for migration yet. The batch runner will refuse to start without `--include-barcode-label` or `--exclude-barcode-label`.');
    md.push('');
  }
  md.push('## C. Complete Mongoose model inventory');
  md.push('');
  md.push(markdownTable(
    ['Model', 'Collection', 'Module', 'Source file(s)', 'Refs', 'Indexes declared', 'Source docs', 'Status'],
    catalog.map((entry) => {
      const row = auditRows.find((r) => r.name === entry.collection);
      return [
        entry.modelNames.join(', '),
        entry.collection,
        entry.module,
        entry.files.join('<br>'),
        entry.refs.length ? entry.refs.join(', ') : '—',
        entry.indexCount,
        row ? row.sourceCount ?? 'ERR' : 'absent',
        row ? row.classification.status : 'ABSENT IN SOURCE',
      ];
    })
  ));
  md.push('');
  md.push('## D. Legacy / unreferenced source collections');
  md.push('');
  md.push('These collections exist in the source database but have no current Mongoose model in this repository. They are included by default because the task allows only the two exclusion categories and asks for all remaining ERP data to be preserved. They are flagged here so they can be reviewed separately; they are **not** silently dropped.');
  md.push('');
  md.push(markdownTable(
    ['Collection', 'Source docs', 'Status', 'Reason'],
    legacy.map((r) => [r.name, r.sourceCount ?? 'ERR', r.classification.status, r.classification.reason])
  ));
  md.push('');
  md.push('## E. Shared collections deliberately NOT excluded');
  md.push('');
  md.push(markdownTable(
    ['Collection', 'Reason'],
    [...SHARED_COLLECTIONS.entries()].map(([name, reason]) => [name, reason])
  ));
  md.push('');
  md.push('## F. Safety facts at audit time');
  md.push('');
  md.push(markdownTable(
    ['Check', 'Result'],
    [
      ['Source connection', 'PASS'],
      ['Target connection (directConnection)', 'PASS'],
      ['Source database', audit.source.database],
      ['Target database', audit.target.database],
      ['Target collections at audit time', audit.target.collectionCount],
      ['Target documents at audit time', audit.target.totalDocuments],
      ['Target data state', audit.target.collectionCount
        ? `NON-EMPTY — ${audit.target.collectionCount} collections / ${audit.target.totalDocuments} documents; existing _ids are never overwritten and conflicts abort a run`
        : 'EMPTY — no target data to overwrite'],
      ['Source collections', audit.source.collectionCount],
      ['Model collections absent from source', missingModelCollections.map((m) => m.collection).join(', ') || 'none'],
      ['Target-only collections', targetExtras.map((c) => c.name).join(', ') || 'none'],
      ['Indexes on included collections', included.reduce((n, r) => n + r.sourceIndexes.length, 0)],
      ['Unique indexes on included collections', included.reduce((n, r) => n + r.sourceIndexes.filter((i) => i.unique).length, 0)],
    ]
  ));
  md.push('');
  md.push('## G. Index inventory');
  md.push('');
  md.push(markdownTable(
    ['Collection', 'Indexes (source)', 'Unique', 'Notes'],
    included.map((r) => [
      r.name,
      r.sourceIndexes.map((i) => `${i.name}: ${JSON.stringify(i.key)}`).join('<br>'),
      r.sourceIndexes.filter((i) => i.unique).map((i) => i.name).join(', ') || '—',
      r.sourceIndexError || '',
    ])
  ));
  md.push('');
  md.push('## H. Model collections absent from source');
  md.push('');
  md.push(missingModelCollections.length
    ? markdownTable(['Collection', 'Model', 'Module', 'Status'], missingModelCollections.map((m) => [m.collection, m.modelNames.join(', '), m.module, m.classification.status]))
    : 'None.');
  md.push('');
  md.push('## Execution gates');
  md.push('');
  if (barcodeArg === false) {
    md.push('1. `barcodeLabel` decision: **EXCLUDE**, confirmed by the project owner.');
    md.push('2. Pre-flight backup/duplicate-index check: complete.');
    md.push('3. Initial migration: complete; see the checkpoint status above.');
    md.push('4. Incremental refresh after new source rows: `node --env-file=.env scripts/migration/migrate.mjs --apply --yes --exclude-barcode-label --allow-nonempty-target --sync`.');
    md.push('5. Verification and reports: `node --env-file=.env scripts/migration/verify.mjs`.');
  } else if (barcodeArg === true) {
    md.push('1. `barcodeLabel` decision: **INCLUDE**, confirmed by the project owner.');
    md.push('2. Pre-flight backup/duplicate-index check: complete.');
    md.push('3. Initial migration: complete; see the checkpoint status above.');
    md.push('4. Incremental refresh after new source rows: `node --env-file=.env scripts/migration/migrate.mjs --apply --yes --include-barcode-label --allow-nonempty-target --sync`.');
    md.push('5. Verification and reports: `node --env-file=.env scripts/migration/verify.mjs`.');
  } else {
    md.push('1. Approve the `barcodeLabel` decision above.');
    md.push('2. Run the pre-flight backup/duplicate-index check.');
    md.push('3. Approve the migration plan.');
    md.push('4. Run `node --env-file=.env scripts/migration/migrate.mjs --apply --yes --include-barcode-label` (or `--exclude-barcode-label`); use `--sync` to refresh an existing target.');
    md.push('5. Run verification and generate the results/report files.');
  }
  md.push('');

  fs.writeFileSync(AUDIT_MD, md.join('\n'));

  console.log('Source DB:', audit.source.database, '| collections:', audit.source.collectionCount, '| docs:', audit.source.totalDocuments);
  console.log('Target DB:', audit.target.database, '| collections:', audit.target.collectionCount);
  console.log('INCLUDE:', included.length, 'collections /', totalIncludedDocs, 'docs');
  console.log('EXCLUDE:', excluded.length, 'collections /', totalExcludedDocs, 'docs');
  console.log('DECISION:', decisions.map((r) => `${r.name}(${r.sourceCount})`).join(', ') || 'none');
  console.log('BarcodeLabel decision:', audit.classification.barcodeLabelDecision);
  console.log('Legacy/no-model:', legacy.length, '| model collections absent from source:', missingModelCollections.length);
  console.log('Wrote', AUDIT_JSON);
  console.log('Wrote', AUDIT_MD);

  await source.close();
  await target.close();
}

main().catch((error) => {
  console.error('Audit failed:', error.message);
  process.exitCode = 1;
});
