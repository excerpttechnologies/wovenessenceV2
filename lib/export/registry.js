/* ==========================================================================
   WHICH LIST ENDPOINTS A FULL EXPORT MAY CALL.

   The full export does not re-implement each resource's filters. It asks the
   resource's OWN list endpoint for the rows, with the operator's session
   cookie, exactly as the screen does. That is what keeps filters, company /
   location scope and role permissions identical between the screen and the
   file - there is only one implementation of each.

   That design needs a closed list of endpoints: an export URL must not become
   a way to ask the server for any path on the internet or any internal API.
   Only the list endpoints this project's export buttons actually sit on are
   named here. A new list screen adds its endpoint here when it adds the
   button, deliberately.

   Report endpoints are absent on purpose: reports are aggregations
   (GROUP/SUM), not raw MongoDB documents, and flattening an aggregate is not
   a database export. They keep their existing report exports.
   ========================================================================== */

const LIST_PATHS = [
  /* masters and contacts */
  '/accounting/accounts', '/accounting/journals',
  '/agent', '/attribute-addon', '/barcode-label-setting', '/business',
  '/business-contact', '/city-group', '/company-location', '/contact-type',
  '/customer', '/dispatch', '/doc-setup', '/driver', '/ecom-product',
  '/ecom-setting', '/hsn', '/inventory-barcode-list', '/invoice-layout-setting',
  '/item', '/ledger', '/ledger-group', '/ledger-group-mapping',
  '/location-setting', '/login-security', '/logistic', '/loyalty-point',
  '/payment-method', '/pos-archive', '/pos-counter', '/pos-footer-template',
  '/pos-setting', '/product-eccom', '/product-filter', '/product-group',
  '/purchase-charge', '/purchase-group', '/purchase-term', '/sales-person',
  '/sales-term', '/split-barcode-setting', '/stock-point',
  '/stock-transfer-location', '/supplier', '/tax', '/transporter',
  '/transport-route', '/uom', '/user', '/vehicle', '/voucher-setting',

  /* transactions */
  '/delivery', '/ic-auto-purchase-received', '/ic-auto-purchase-return',
  '/ic-delivery-challan', '/ic-sales-invoice', '/ic-sales-return',
  '/is-debit-note', '/is-delivery-challan', '/is-sales-invoice',
  '/is-sales-return', '/ledger-transaction', '/purchase-debitnote',
  '/purchase-grc', '/purchase-grt', '/purchase-invoice', '/sell-b2binvoice',
  '/sell-creditnote', '/sell-deliverychallan', '/sell-pos',
  '/sell-pos-return', '/sell-salereturn', '/sell-salesinvoice',
  '/stock-adjustment', '/stock-transfer', '/stock-transfer-packet', '/voucher',

  /* the barcode-settings list has its own endpoint name */
  '/barcode-setting',
];

export const ALLOWED_LIST_ENDPOINTS = new Set(LIST_PATHS);

/* Endpoints whose list response is a single settings document rather than a
   row set. They are allowed (a screen may still be based on ListView), but
   the collector will report that there are no rows rather than pretending the
   setting was exported. */
export const SINGLE_DOCUMENT_ENDPOINTS = new Set([
  '/login-security', '/location-setting', '/invoice-layout-setting',
  '/pos-setting', '/ecom-setting', '/voucher-setting',
]);

export const ENDPOINT_LABELS = {
  '/supplier': 'Supplier Master',
  '/customer': 'Customer Master',
  '/agent': 'Agent Master',
  '/item': 'Item Master',
  '/purchase-grc': 'GRC',
  '/purchase-grt': 'GRT',
  '/purchase-invoice': 'Purchase Invoice',
  '/purchase-debitnote': 'Purchase Debit Note',
  '/sell-salesinvoice': 'Sales Invoice',
  '/sell-salereturn': 'Sales Return',
  '/sell-deliverychallan': 'Delivery Challan',
  '/sell-creditnote': 'Credit Note',
  '/stock-transfer': 'Stock Transfer',
  '/stock-transfer-packet': 'Stock Transfer Packet',
  '/stock-adjustment': 'Stock Adjustment',
  '/delivery': 'Delivery',
  '/voucher': 'Voucher',
  '/ledger': 'Ledger',
  '/business': 'Business Master',
  '/company-location': 'Business Location',
};

/* Normalise and validate, throwing a message the route can return as 400. */
export function normalizeListEndpoint(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new ExportEndpointError('No list endpoint was supplied for the export.');
  if (/^[a-z]+:/i.test(raw) || raw.startsWith('//')) {
    throw new ExportEndpointError('The export endpoint must be an application path.');
  }
  if (raw.includes('?') || raw.includes('#') || raw.includes('..') || raw.includes('\\')) {
    throw new ExportEndpointError('The export endpoint is not a valid application path.');
  }
  const endpoint = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  if (!endpoint.startsWith('/api/')) {
    throw new ExportEndpointError('The export endpoint must start with /api/.');
  }
  if (!ALLOWED_LIST_ENDPOINTS.has(endpoint.slice(4))) {
    throw new ExportEndpointError(`Full export is not enabled for ${endpoint}.`);
  }
  return endpoint;
}

/* Is this list endpoint one the full export may call? The screens ask this
   before they draw the Full export control, so an operator is never offered a
   button whose request the route would refuse. Deliberately as strict as
   normalizeListEndpoint below: a cfg that somehow carries a query string or a
   parent segment gets no button, because the route would refuse it. */
export function isListEndpointAllowed(value) {
  const raw = String(value || '').trim();
  if (!raw) return false;
  if (raw.includes('?') || raw.includes('#') || raw.includes('..') || raw.includes('\\')) return false;
  if (/^[a-z]+:/i.test(raw) || raw.startsWith('//')) return false;
  const path = raw.replace(/\/+$/, '');
  if (!path.startsWith('/api/')) return false;
  return ALLOWED_LIST_ENDPOINTS.has(path.slice(4));
}

export class ExportEndpointError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExportEndpointError';
    this.status = 400;
    this.code = 'EXPORT_ENDPOINT';
  }
}

export function labelForEndpoint(endpoint) {
  const path = String(endpoint || '').replace(/^\/api/, '');
  if (ENDPOINT_LABELS[path]) return ENDPOINT_LABELS[path];
  return path
    .replace(/^\//, '')
    .split(/[\/-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
