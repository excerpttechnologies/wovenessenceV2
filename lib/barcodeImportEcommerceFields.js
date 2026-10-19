/* E-commerce Field Utilities for Barcode Import
   
   Helper functions to manage e-commerce fields during barcode import:
   - Extract e-commerce fields from import rows
   - Merge edits with row values
   - Validate e-commerce field values
   - Prepare e-commerce updates for API */

export const ECOMMERCE_FIELDS = [
  'ecommItemCode', 'productType',
  'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
  'weaveDescription', 'fabricDescription', 'craftDescription', 'occasionDescription', 'colourDescription',
  'displayName', 'printDescriptionOverride',
  'slug', 'seoTitle', 'seoDescription',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'barcodeStatusOverride',
  'isFeatured', 'salesCount', 'status', 'isPublished',
];

export const CLASSIFICATION_FIELDS = ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'];
export const DESCRIPTION_FIELDS = ['weaveDescription', 'fabricDescription', 'craftDescription', 'occasionDescription', 'colourDescription'];
export const SEO_FIELDS = ['slug', 'seoTitle', 'seoDescription'];
export const OVERRIDE_FIELDS = ['ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'barcodeStatusOverride'];
export const STOREFRONT_FIELDS = ['isFeatured', 'salesCount'];

/* Get all current field values for a row, merging edits with row values */
export function getRowValues(row, edits = {}) {
  const values = { ...row.values };
  
  // Merge edits
  Object.keys(edits).forEach(field => {
    if (ECOMMERCE_FIELDS.includes(field)) {
      values[field] = edits[field];
    }
  });
  
  // Handle existing data for changed/same rows
  if (row.existing && ECOMMERCE_FIELDS.some(f => row.existing[f] !== undefined)) {
    ECOMMERCE_FIELDS.forEach(field => {
      if (values[field] === undefined && row.existing[field] !== undefined) {
        values[field] = row.existing[field];
      }
    });
  }
  
  return values;
}

/* Check if a row has any e-commerce field data */
export function hasEcommerceData(row) {
  if (!row.values) return false;
  
  return ECOMMERCE_FIELDS.some(field => {
    const value = row.values[field];
    if (value === null || value === undefined || value === '') return false;
    if (Array.isArray(value)) return value.length > 0;
    return true;
  });
}

/* Validate e-commerce field values */
export function validateEcommerceFields(values) {
  const errors = [];
  
  // Validate percent fields (0-100)
  if (values.ecommOffPercent !== null && values.ecommOffPercent !== undefined && values.ecommOffPercent !== '') {
    const val = Number(values.ecommOffPercent);
    if (!Number.isFinite(val) || val < 0 || val > 100) {
      errors.push({ field: 'ecommOffPercent', message: 'E-comm discount must be between 0 and 100%' });
    }
  }
  
  // Validate positive number fields
  const positiveFields = ['barcodePriceOverride', 'barcodeQtyOverride', 'salesCount'];
  positiveFields.forEach(field => {
    if (values[field] !== null && values[field] !== undefined && values[field] !== '') {
      const val = Number(values[field]);
      if (!Number.isFinite(val) || val < 0) {
        errors.push({ field, message: `${field} must be 0 or greater` });
      }
    }
  });
  
  // Validate status override enum
  const validStatuses = ['', 'IN_STOCK', 'OUT_OF_STOCK', 'PRE_ORDER', 'DISCONTINUED'];
  if (values.barcodeStatusOverride && !validStatuses.includes(values.barcodeStatusOverride)) {
    errors.push({ field: 'barcodeStatusOverride', message: 'Invalid status value' });
  }
  
  // Validate SEO description length
  if (values.seoDescription && values.seoDescription.length > 160) {
    errors.push({ field: 'seoDescription', message: 'SEO description must be 160 characters or less' });
  }
  
  // Validate slug format (no spaces, lowercase recommended)
  if (values.slug && /\s/.test(values.slug)) {
    errors.push({ field: 'slug', message: 'URL slug should not contain spaces' });
  }
  
  return errors;
}

/* Extract e-commerce field updates from edits */
export function extractEcommerceUpdates(row, edits = {}) {
  const updates = {};
  
  ECOMMERCE_FIELDS.forEach(field => {
    if (edits.hasOwnProperty(field)) {
      let value = edits[field];
      
      // Convert string booleans to actual booleans
      if (field === 'isFeatured') {
        value = value === true || value === 'true';
      }
      
      // Convert string numbers to numbers
      if (OVERRIDE_FIELDS.includes(field) || field === 'salesCount') {
        if (value !== '' && value !== null && value !== undefined) {
          value = Number(value);
          if (!Number.isFinite(value)) {
            value = null;
          }
        } else {
          value = null;
        }
      }
      
      // Ensure arrays are arrays
      if (CLASSIFICATION_FIELDS.includes(field)) {
        value = Array.isArray(value) ? value : [];
      }
      
      updates[field] = value;
    }
  });
  
  return updates;
}

/* Count how many e-commerce fields have values */
export function countEcommerceFields(values) {
  let count = 0;
  
  ECOMMERCE_FIELDS.forEach(field => {
    const value = values[field];
    if (value === null || value === undefined || value === '') return;
    
    if (Array.isArray(value)) {
      count += value.length;
    } else if (value !== false) {
      count += 1;
    }
  });
  
  return count;
}

/* Check if any e-commerce fields have changed from existing */
export function hasEcommerceChanges(row, edits = {}) {
  if (!row.existing) return false;
  
  return ECOMMERCE_FIELDS.some(field => {
    const editValue = edits[field];
    const existingValue = row.existing[field];
    
    if (editValue === undefined) return false;
    
    // Compare arrays
    if (Array.isArray(editValue) && Array.isArray(existingValue)) {
      if (editValue.length !== existingValue.length) return true;
      return !editValue.every((v, i) => v === existingValue[i]);
    }
    
    // Compare other values
    return editValue !== existingValue;
  });
}

/* Prepare e-commerce data for save payload */
export function prepareEcommerceSaveData(rows, edits) {
  const ecommerceUpdates = [];
  
  rows.forEach(row => {
    const rowEdits = edits.get(row.line) || {};
    const ecommUpdates = extractEcommerceUpdates(row, rowEdits);
    
    if (Object.keys(ecommUpdates).length > 0) {
      ecommerceUpdates.push({
        line: row.line,
        barcode: row.barcode,
        itemCode: row.values.itemCode,
        updates: ecommUpdates,
      });
    }
  });
  
  return ecommerceUpdates;
}
