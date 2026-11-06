import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODELS_DIR = path.resolve(process.cwd(), 'models');

function stripBlockComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
}

function lineIsCommented(lines, index) {
  const line = lines[index].trim();
  return line.startsWith('//') || line.startsWith('*');
}

function resolveCollection(fileText, modelName, explicitCollection) {
  if (explicitCollection) return explicitCollection;
  const option = fileText.match(/collection\s*:\s*['"]([^'"]+)['"]/);
  if (option) return option[1];
  // Mongoose's default pluralisation for the models that do not pin a name.
  const lower = String(modelName).toLowerCase();
  if (/[^aeiou]y$/.test(lower)) return lower.slice(0, -1) + 'ies';
  return lower + 's';
}

function moduleOf(fileName) {
  const n = fileName.replace(/\.js$/, '');
  if (/^Pos/.test(n) || n === 'CashRegister' || n === 'PaymentMethod' || n === 'LoyaltyPoint' || n === 'LoyaltyLedger') return 'POS';
  if (/^Barcode/.test(n) || n === 'SplitBarcodeSetting' || n === 'ProductImage') return 'Barcode';
  if (/^Store/.test(n)) return 'Inter Store Sell';
  if (/^Ic/.test(n)) return 'Inter Company';
  if (/^(Grc|Grt|Purchase|Supplier|Agent)/.test(n)) return 'Purchase / GRC';
  if (/^(Sales|B2b|CreditNote|DebitNote|Delivery|Dispatch|Customer)/.test(n)) return 'Sales';
  if (/^(Stock|Transfer|Item|Uom|Hsn|Tax|Product|Attribute|PurchaseTerm|SalesTerm)/.test(n)) return 'Inventory / Masters';
  if (/^(Accounting|Accounts|Ledger|Journal|Voucher)/.test(n)) return 'Accounting';
  if (/^(Business|Company|Location|City|Contact|Role|User|Login|DocSetup|Counter|Vehicle|Driver|Transporter|Transport|Logistic|Payment)/.test(n)) return 'Masters / Admin';
  if (/^(Ecom|Website|InvoiceLayout|LocationSetting|SplitBarcode)/.test(n)) return 'Configuration / Web';
  return 'Other ERP';
}

export function buildModelCatalog() {
  const files = fs.readdirSync(MODELS_DIR).filter((f) => f.endsWith('.js')).sort();
  const entries = [];
  const constantsByFile = new Map();

  for (const file of files) {
    const fullPath = path.join(MODELS_DIR, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    const refs = [...new Set([...raw.matchAll(/ref\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]))].sort();
    const indexCount = lines.filter((line) => !line.trim().startsWith('//') && /Schema\.index\s*\(/.test(line)).length;

    for (let i = 0; i < lines.length; i++) {
      if (lineIsCommented(lines, i)) continue;
      const line = lines[i];
      if (!/mongoose\.model\s*\(/.test(line)) continue;
      const match = line.match(
        /mongoose\.model\(\s*['"]([^'"]+)['"]\s*,\s*[A-Za-z0-9_$]+\s*(?:,\s*(?:['"]([^'"]+)['"]|([A-Za-z0-9_$]+)))?/
      );
      if (!match) continue;
      const [, modelName, literalCollection, constantName] = match;
      let collection = literalCollection || '';
      let resolution = 'literal';
      if (!collection && constantName) {
        resolution = `constant:${constantName}`;
        const re = new RegExp(`(?:export\\s+)?const\\s+${constantName}\\s*=\\s*['"]([^'"]+)['"]`);
        const found = raw.match(re);
        if (found) collection = found[1];
        // contactSchema.js exports COLLECTION_BY_KIND = { Supplier: 'supplier',
        // Customer: 'customer', Agent: 'agent' }; the model files assign that
        // map entry to a constant instead of repeating the string.
        if (!collection) {
          const kind = constantName.match(/^(AGENT|CUSTOMER|SUPPLIER)_COLLECTION$/)?.[1];
          if (kind) {
            collection = kind.toLowerCase();
            resolution = `contact-kind:${kind}`;
          }
        }
      }
      if (!collection) {
        collection = resolveCollection(raw, modelName, '');
        resolution = 'mongoose-default';
      }
      entries.push({
        source: 'models',
        file: `models/${file}`,
        modelName,
        collection,
        collectionResolution: resolution,
        module: moduleOf(file),
        refs,
        indexCount,
        hasSoftDeleteOrModule: /module\s*:/.test(raw),
      });
    }
  }

  // barcodeLabel lives in lib/, not models/, and is the barcode master/stock model.
  const barcodeRaw = fs.readFileSync(path.resolve(process.cwd(), 'lib/barcodeLabel.js'), 'utf8');
  const barcodeRefs = [...new Set([...barcodeRaw.matchAll(/ref\s*:\s*['"]([^'"]+)['"]/g)].map((m) => m[1]))].sort();
  entries.push({
    source: 'lib',
    file: 'lib/barcodeLabel.js',
    modelName: 'barcodeLabel',
    collection: 'barcodeLabel',
    collectionResolution: 'literal',
    module: 'Barcode',
    refs: barcodeRefs,
    indexCount: (barcodeRaw.match(/barcodeLabelSchema\.index\s*\(/g) || []).length,
    hasSoftDeleteOrModule: false,
  });

  // Models declared directly in route files (no models/*.js file).
  const appModels = [
    { file: 'app/api/cities/route.js', modelName: 'city', collection: 'cities', module: 'Masters / Admin', refs: [] },
    { file: 'app/api/pincode/route.js', modelName: 'pincode', collection: 'pincode', module: 'Masters / Admin', refs: [] },
    { file: 'app/api/catalog/route.js', modelName: 'catalog', collection: 'catalogs', module: 'Configuration / Web', refs: [] },
  ];
  for (const m of appModels) {
    const abs = path.resolve(process.cwd(), m.file);
    const raw = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
    entries.push({
      source: 'app',
      file: m.file,
      modelName: m.modelName,
      collection: m.collection,
      collectionResolution: 'literal-or-default',
      module: m.module,
      refs: m.refs,
      indexCount: (raw.match(/\.index\s*\(/g) || []).length,
      hasSoftDeleteOrModule: false,
    });
  }

  // Deduplicate by collection, keeping the first model registration but merging files.
  const byCollection = new Map();
  for (const entry of entries) {
    const existing = byCollection.get(entry.collection);
    if (!existing) {
      byCollection.set(entry.collection, { ...entry, files: [entry.file], modelNames: [entry.modelName] });
    } else {
      existing.files.push(entry.file);
      if (!existing.modelNames.includes(entry.modelName)) existing.modelNames.push(entry.modelName);
      for (const ref of entry.refs) if (!existing.refs.includes(ref)) existing.refs.push(ref);
      existing.indexCount = Math.max(existing.indexCount, entry.indexCount);
    }
  }
  return [...byCollection.values()].sort((a, b) => a.collection.localeCompare(b.collection));
}

if (process.argv[1] && path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1])) {
  const catalog = buildModelCatalog();
  console.log(JSON.stringify(catalog, null, 2));
}
