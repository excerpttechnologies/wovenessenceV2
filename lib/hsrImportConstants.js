/* ==========================================================================
   HSR IMPORT CONSTANTS

   Shared constants for HSR import operations.
   ========================================================================== */

export const IMPORT_OPERATIONS = {
  UPDATE_DETAILS: 'UPDATE_DETAILS',           // Update barcode/item details only
  ADD_BARCODES: 'ADD_BARCODES',               // Add new barcode records
  REPLACE_STOCK: 'REPLACE_STOCK',             // Replace stock at target warehouse
  ADD_STOCK: 'ADD_STOCK',                     // Add opening stock
  TRANSFER_STOCK: 'TRANSFER_STOCK',           // Transfer from source to target warehouse
};

export const IMPORT_OPERATION_LABELS = {
  [IMPORT_OPERATIONS.UPDATE_DETAILS]: 'Update Barcode/Item Details',
  [IMPORT_OPERATIONS.ADD_BARCODES]: 'Add New Barcodes',
  [IMPORT_OPERATIONS.REPLACE_STOCK]: 'Replace Stock Quantities',
  [IMPORT_OPERATIONS.ADD_STOCK]: 'Add Opening Stock',
  [IMPORT_OPERATIONS.TRANSFER_STOCK]: 'Transfer Stock Between Warehouses',
};

export const IMPORT_OPERATION_DESCRIPTIONS = {
  [IMPORT_OPERATIONS.UPDATE_DETAILS]: 'Update existing barcode and item fields (description, HSN, pricing) without changing stock quantities.',
  [IMPORT_OPERATIONS.ADD_BARCODES]: 'Create new barcode records for items that do not exist. Stock is only added if explicitly selected.',
  [IMPORT_OPERATIONS.REPLACE_STOCK]: 'Replace the existing stock quantity at the target warehouse with the Excel quantity. Warning: This will change existing stock.',
  [IMPORT_OPERATIONS.ADD_STOCK]: 'Add the Excel quantity as opening stock to the target warehouse. Existing stock is preserved.',
  [IMPORT_OPERATIONS.TRANSFER_STOCK]: 'Transfer the Excel quantity from the source warehouse to the target warehouse. Validates source stock availability.',
};

export const IMPORT_SOURCE = 'HSR_OPENING_STOCK';
export const IMPORT_LIMIT = 25000;

export default {
  IMPORT_OPERATIONS,
  IMPORT_OPERATION_LABELS,
  IMPORT_OPERATION_DESCRIPTIONS,
  IMPORT_SOURCE,
  IMPORT_LIMIT,
};
