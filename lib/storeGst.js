import Hsn from '@/models/Hsn';
import Tax from '@/models/Tax';
import { pickTaxSlab } from '@/lib/hsnGst';
import { escapeRegex } from '@/lib/validate';
import { stateFromGstin } from '@/lib/gstLookup';
import { GST_MODE, num } from '@/lib/storeSell';

/* ==========================================================================
   GST RATE RESOLUTION for Inter Store Sell.

   The rate is looked up, never typed and never hard-coded: HSN code -> that
   company's HSN Master row -> the slab whose Amount From/To band contains the
   line value -> the Tax record the slab points at. This is the same chain
   TransactionFormView uses for a purchase document, moved onto the server so
   a crafted request cannot set its own tax rate.

   Intra-state vs inter-state. Inter Store Sell moves stock between two
   locations of ONE business, so both ends normally share a state and the tax
   splits into CGST + SGST. When the two locations record different states the
   document is inter-state and the same rate is charged as IGST. The mode is
   therefore decided by the locations when both carry a state, and otherwise
   by the tax record itself (IGST-only rows mean IGST).

   Nothing found means 0% - a missing master must not invent a rate.
   ========================================================================== */

const hsnCache = new Map();
const taxCache = new Map();

/* Master data is corrected while the server is running: an HSN's slab or a
   tax row can be fixed, and a cache that never expires would keep charging the
   OLD rate until a restart - a wrong invoice, with nothing on screen to show
   why. Entries expire (60s by default, GST_CACHE_TTL_MS overrides) and the map
   is capped, because a long-lived process resolving thousands of codes must
   not grow without limit. */
const CACHE_TTL_MS = Number(process.env.GST_CACHE_TTL_MS ?? 60000);
const CACHE_MAX = 500;

const cacheGet = (map, key) => {
  const entry = map.get(key);
  if (entry && Date.now() - entry.at < CACHE_TTL_MS) return { hit: true, value: entry.value };
  if (entry) map.delete(key);
  return { hit: false };
};

const cacheSet = (map, key, value) => {
  if (map.size >= CACHE_MAX) map.delete(map.keys().next().value);
  map.set(key, { at: Date.now(), value });
};

/* The state a store is taxed as. The master's own `state` field wins; when it
   was left blank the GSTIN answers instead - its first two characters ARE the
   state code (lib/gstLookup.js). Without that fallback a store whose GSTIN is
   perfectly good but whose State field is empty compared as "unknown", and
   every transfer to it was silently split into CGST + SGST - an intra-state
   split on what may well be an inter-state movement. */
const stateOf = (loc) => String(loc?.state || '').trim().toLowerCase()
  || stateFromGstin(loc?.gstin).toLowerCase();

/* Both stores named on the document, or CGST/SGST when we cannot tell - which
   is the safe default: an intra-state split is a legal split, an invented
   IGST is not. */
export function gstModeForLocations(source, destination) {
  const a = stateOf(source);
  const b = stateOf(destination);
  if (!a || !b) return null;
  return a === b ? GST_MODE.CGST_SGST : GST_MODE.IGST;
}

async function hsnFor(businessId, code) {
  const key = String(businessId || '') + '|' + String(code || '').trim().toLowerCase();
  const cached = cacheGet(hsnCache, key);
  if (cached.hit) return cached.value;

  const rx = new RegExp('^\\s*' + escapeRegex(String(code).trim()) + '\\s*$', 'i');
  const row = await Hsn.findOne({
    $and: [
      { code: rx },
      { status: { $ne: false } },
      ...(businessId
        ? [{ $or: [{ businessId }, { businessId: null }] }]
        : []),
    ],
  }).sort({ businessId: -1 }).lean();

  cacheSet(hsnCache, key, row || null);
  return row || null;
}

async function taxFor(taxId) {
  if (!taxId) return null;
  const key = String(taxId);
  const cached = cacheGet(taxCache, key);
  if (cached.hit) return cached.value;
  const row = await Tax.findById(taxId).lean();
  cacheSet(taxCache, key, row || null);
  return row || null;
}

/* -> { gstPct, mode } where mode is the split the TAX ROW implies, or null
   when it says nothing either way. */
export async function resolveGstRate({ businessId, hsnCode, amount }) {
  const code = String(hsnCode || '').trim();
  if (!code) return { gstPct: 0, mode: null, taxId: null };

  const hsn = await hsnFor(businessId, code);
  const slabs = Array.isArray(hsn?.taxSlabs) ? hsn.taxSlabs : [];
  if (!slabs.length) return { gstPct: 0, mode: null, taxId: null };

  const slab = pickTaxSlab(slabs, amount) || slabs[0];
  const tax = await taxFor(slab?.gstTaxNameId);
  if (!tax) return { gstPct: 0, mode: null, taxId: String(slab?.gstTaxNameId || '') };

  const igst = num(tax.igst);
  const halves = num(tax.cgst) + num(tax.sgst);

  /* IGST-only row -> the master itself says inter-state */
  if (igst > 0 && halves <= 0) {
    return { gstPct: igst, mode: GST_MODE.IGST, taxId: String(tax._id) };
  }
  if (halves > 0) {
    return { gstPct: halves, mode: GST_MODE.CGST_SGST, taxId: String(tax._id) };
  }

  /* a flat GST column, or the slab's own figure - still a looked-up rate */
  const flat = igst || halves;
  return { gstPct: flat, mode: null, taxId: String(tax._id) };
}

/* One line, resolved in context: the document-wide split wins when the two
   locations named it; otherwise the tax row's own split; otherwise CGST/SGST. */
export async function resolveLineGst({ businessId, line, documentMode }) {
  const qty = num(line.qty);
  const rate = num(line.unitRate);
  const beforeTax = Math.round(
    (rate - rate * (num(line.discountPct) / 100) - num(line.roffDiscount)) * qty * 100
  ) / 100;

  const resolved = await resolveGstRate({
    businessId,
    hsnCode: line.hsn || line.hsnCode,
    amount: beforeTax,
  });

  return {
    gstPct: resolved.gstPct,
    mode: documentMode || resolved.mode || GST_MODE.CGST_SGST,
  };
}
