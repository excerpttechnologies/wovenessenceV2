/* A supplier's PRICE CALCULATION SETUP, as Barcode Generation uses it.

   Supplier master -> Purchase Details -> "Price Calculation Setup"
   (app/admin/contact/supplier/tabs.js) is the source of truth. GET
   /api/grc/[id] reads that section's fields off the GRC's own supplier
   (grc.supplierId) and hands them over as

     supplierPriceSetup: {
       status:   'OK' | 'NO_SUPPLIER' | 'SUPPLIER_NOT_FOUND' | 'NO_SETUP',
       supplierId, supplierName, supplierCode,
       fields:   [{ key, label, type, value }]   in the section's own order
     }

   Pure and client-safe - the section list itself is read on the server, so
   the browser does not bundle the whole supplier form.

   HOW EACH FIELD REACHES THE ADD ITEM FORM
     discountType      Discount Type     'Amount' is the form's 'Flat'
     discount          Discount
     markUpOnCostRsp   Markup RSP %
     markUpOnCostWsp   Markup WSP %
     markUpOnCostDp    Markup E-COMM %   ("Mark Up on Cost E-comm")
   Each of those is an existing, editable input: the supplier's value is its
   starting value and feeds the price it calculates. A field with no
   counterpart on the form (the three Round Off values) is shown read-only
   beside them; nothing on Barcode Generation rounds prices today, so they
   are not applied to anything.

   A field the supplier has left blank gives the form nothing - no default
   percentage is put in its place. */

export const PRICE_SETUP_SECTION = 'Price Calculation Setup';

/* supplier field -> Add Item form field */
export const PRICE_SETUP_TO_FORM = {
  discountType: 'discountType',
  discount: 'discount',
  markUpOnCostRsp: 'markupRSP',
  markUpOnCostWsp: 'markupWSP',
  markUpOnCostDp: 'markupDP',
};

/* The Price Calculation Setup fields of a supplier form definition (the
   TABS array of app/admin/contact/supplier/tabs.js), in order. */
export function priceSetupFieldDefs(tabs) {
  const section = (Array.isArray(tabs) ? tabs : [])
    .flatMap((tab) => tab?.sections || [])
    .find((s) => String(s?.title || '').trim().toLowerCase() === PRICE_SETUP_SECTION.toLowerCase());
  return (section?.fields || [])
    .filter((f) => f && f.k)
    .map((f) => ({ key: f.k, label: f.label || f.k, type: f.type || 'text', options: f.opts || null }));
}

const isBlank = (value) => value === undefined || value === null || String(value).trim() === '';

/* The setup handed to the screen, from the supplier document (or null). */
export function buildSupplierPriceSetup(defs, supplier, { supplierId = '' } = {}) {
  const base = {
    supplierId: supplierId ? String(supplierId) : '',
    supplierName: supplier ? (supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' ') || '').trim() : '',
    supplierCode: supplier?.contactId || '',
  };
  if (!supplierId) return { ...base, status: 'NO_SUPPLIER', fields: [] };
  if (!supplier) return { ...base, status: 'SUPPLIER_NOT_FOUND', fields: [] };
  const fields = defs.map((def) => ({
    key: def.key,
    label: def.label,
    type: def.type,
    value: isBlank(supplier[def.key]) ? null : supplier[def.key],
  }));
  return { ...base, status: fields.some((f) => f.value !== null) ? 'OK' : 'NO_SETUP', fields };
}

/* A stored setup number as the form shows it - the supplier's own value, not
   re-rounded. Text stored as typed ("12.50") is kept as typed; a stored
   number keeps its digits, with two decimals when it has a fraction of up to
   two places (12.5 -> "12.50", the form's own precision) and whole numbers
   as they are (12 -> "12"). '' for blank. */
export function formatSetupValue(value) {
  if (isBlank(value)) return '';
  if (typeof value === 'string') return value.trim();
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  if (Number.isInteger(n)) return String(n);
  const places = (String(n).split('.')[1] || '').length;
  return places <= 2 ? n.toFixed(2) : String(n);
}

/* The supplier's Discount Type in the form's words, or '' when it has none
   the form knows. */
export function formDiscountType(value) {
  const text = String(value ?? '').trim().toLowerCase();
  if (text === 'percentage' || text === 'percent' || text === '%') return 'Percentage';
  if (text === 'amount' || text === 'flat') return 'Flat';
  return '';
}

/* The Add Item form's starting values from a setup - only the fields the
   supplier actually has. */
export function formDefaultsFromSetup(setup) {
  const out = {};
  (setup?.fields || []).forEach((field) => {
    const target = PRICE_SETUP_TO_FORM[field.key];
    if (!target || field.value === null) return;
    const value = target === 'discountType' ? formDiscountType(field.value) : formatSetupValue(field.value);
    if (value !== '') out[target] = value;
  });
  return out;
}

/* The fields that have no input of their own on the form (shown read-only). */
export function unmappedSetupFields(setup) {
  return (setup?.fields || []).filter((field) => !PRICE_SETUP_TO_FORM[field.key]);
}

/* What the screen says in place of the setup, or '' when there is one. */
export function setupStatusMessage(setup) {
  switch (setup?.status) {
    case 'NO_SUPPLIER': return 'No supplier linked to this GRC.';
    case 'SUPPLIER_NOT_FOUND': return 'The supplier linked to this GRC was not found.';
    case 'NO_SETUP': return 'No price calculation setup configured for this supplier.';
    default: return '';
  }
}

/* One string that changes when - and only when - the supplier or its setup
   does, so the form re-seeds itself for a different supplier but not after
   every reload of the same one. */
export function setupIdentity(setup) {
  if (!setup) return '';
  return [setup.supplierId, setup.status, ...(setup.fields || []).map((f) => f.key + '=' + String(f.value ?? ''))].join('|');
}
