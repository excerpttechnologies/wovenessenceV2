'use client';
import { useState, useEffect } from 'react';
import ClassificationPicker from '@/components/ClassificationPicker';
import Icon from '@/components/Icon';
import { 
  PRODUCT_TYPE_CLASSIFICATIONS,
  PRODUCT_TYPES,
  CLASSIFICATION_TYPE_LABELS 
} from '@/lib/productClassificationConstants';

/* E-commerce Fields Section for Barcode Import Preview
   
   Renders all e-commerce fields for a barcode row being imported:
   - Product Type selector
   - Product Classifications (conditional on product type)
   - Descriptive fields
   - SEO fields
   - E-commerce overrides (pricing, quantity, status)
   - Storefront settings (featured, sales count)
   
   Props:
   - row: The import row data from server
   - values: Current field values (from edits or row.values)
   - onEdit: Callback (field, value) when a field changes
   - businessId: Business context for classification pickers
   - disabled: Whether editing is disabled
   - expanded: Whether section is expanded
   - onToggleExpand: Callback to toggle expansion */

const STATUS_OPTIONS = [
  { value: '', label: 'Use Actual Status' },
  { value: 'IN_STOCK', label: 'In Stock' },
  { value: 'OUT_OF_STOCK', label: 'Out of Stock' },
  { value: 'PRE_ORDER', label: 'Pre-Order' },
  { value: 'DISCONTINUED', label: 'Discontinued' },
];

const DESCRIPTION_LABELS = {
  weaveDescription: 'Weave Description',
  fabricDescription: 'Fabric Description',
  craftDescription: 'Craft Description',
  occasionDescription: 'Occasion Description',
  colourDescription: 'Colour Description',
};

export default function BarcodeImportEcommerceSection({
  row,
  values = {},
  onEdit,
  businessId,
  disabled = false,
  expanded = false,
  onToggleExpand,
}) {
  const [localExpanded, setLocalExpanded] = useState(expanded);

  useEffect(() => {
    setLocalExpanded(expanded);
  }, [expanded]);

  const handleToggle = () => {
    const newExpanded = !localExpanded;
    setLocalExpanded(newExpanded);
    if (onToggleExpand) {
      onToggleExpand(newExpanded);
    }
  };

  const productType = values.productType || '';
  const applicableClassifications = PRODUCT_TYPE_CLASSIFICATIONS[productType] || [];

  // Helper to get field value (from values prop which includes edits)
  const getValue = (field) => values[field] ?? '';
  
  // Helper to check if field has changes
  const hasChange = (field) => {
    if (!row.existing) return false;
    const imported = getValue(field);
    const existing = row.existing[field];
    return imported !== existing && imported !== '';
  };

  // Count fields with data
  const fieldsWithData = [
    'productType', 'displayName', 'printDescriptionOverride',
    'slug', 'seoTitle', 'seoDescription',
    'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'barcodeStatusOverride',
    'isFeatured', 'salesCount',
    'weaveDescription', 'fabricDescription', 'craftDescription', 'occasionDescription', 'colourDescription',
  ].filter(f => getValue(f) !== '' && getValue(f) !== null && getValue(f) !== undefined).length;

  const classificationsCount = applicableClassifications.reduce((count, type) => {
    const val = values[type];
    return count + (Array.isArray(val) ? val.length : 0);
  }, 0);

  const totalCount = fieldsWithData + classificationsCount;

  return (
    <div className="mt-3 rounded border border-line bg-white">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-[#f7f9fc]"
        aria-expanded={localExpanded}
      >
        <div className="flex items-center gap-2">
          <Icon name={localExpanded ? 'chevD' : 'chevR'} size={14} className="text-inkmuted" />
          <span className="text-[13px] font-semibold uppercase tracking-wide text-ink">
            E-commerce Fields
          </span>
          {totalCount > 0 && (
            <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">
              {totalCount}
            </span>
          )}
        </div>
        <span className="text-[12px] text-inkmuted">
          {localExpanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {localExpanded && (
        <div className="border-t border-line px-3 py-3">
          {/* Product Type */}
          <div className="mb-3">
            <label className="mb-1 block text-[13px] text-ink">
              Product Type
              {hasChange('productType') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
            </label>
            <select
              value={getValue('productType')}
              onChange={(e) => onEdit('productType', e.target.value)}
              disabled={disabled}
              className="f-input w-full"
            >
              {PRODUCT_TYPES.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Product Classifications */}
          {applicableClassifications.length > 0 && (
            <div className="mb-3 rounded border border-[#e7c96b] bg-[#fffbf0] p-3">
              <div className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#8a5a00]">
                Product Classifications ({productType})
              </div>
              <div className="space-y-2">
                {applicableClassifications.map(type => (
                  <ClassificationPicker
                    key={type}
                    type={type}
                    value={Array.isArray(values[type]) ? values[type] : []}
                    onChange={(newValue) => onEdit(type, newValue)}
                    businessId={businessId}
                    disabled={disabled}
                    allowCreate={true}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Display & Description Fields */}
          <div className="mb-3 space-y-2">
            <div className="text-[12px] font-bold uppercase tracking-wide text-ink">Display & Description</div>
            
            <div>
              <label className="mb-1 block text-[13px] text-ink">
                Display Name (Storefront)
                {hasChange('displayName') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
              </label>
              <input
                type="text"
                value={getValue('displayName')}
                onChange={(e) => onEdit('displayName', e.target.value)}
                disabled={disabled}
                placeholder="Override item name for storefront..."
                className="f-input w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] text-ink">
                Print Description Override
                {hasChange('printDescriptionOverride') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
              </label>
              <textarea
                value={getValue('printDescriptionOverride')}
                onChange={(e) => onEdit('printDescriptionOverride', e.target.value)}
                disabled={disabled}
                rows={2}
                placeholder="Custom description for printing..."
                className="f-input w-full resize-y"
              />
            </div>

            {/* Descriptive fields for classifications */}
            {applicableClassifications.length > 0 && (
              <div className="mt-2 space-y-2 rounded border border-line bg-[#f7f9fc] p-2">
                <div className="text-[11.5px] font-semibold text-inkmuted">Classification Descriptions</div>
                {Object.entries(DESCRIPTION_LABELS).map(([field, label]) => {
                  // Only show if this classification type is applicable
                  const classificationField = field.replace('Description', '');
                  const capitalized = 'by' + classificationField.charAt(0).toUpperCase() + classificationField.slice(1);
                  if (!applicableClassifications.includes(capitalized)) return null;

                  return (
                    <div key={field}>
                      <label className="mb-1 block text-[12px] text-ink">
                        {label}
                        {hasChange(field) && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
                      </label>
                      <textarea
                        value={getValue(field)}
                        onChange={(e) => onEdit(field, e.target.value)}
                        disabled={disabled}
                        rows={2}
                        placeholder={`Describe ${label.replace(' Description', '').toLowerCase()}...`}
                        className="f-input w-full resize-y text-[12px]"
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SEO Fields */}
          <div className="mb-3 space-y-2">
            <div className="text-[12px] font-bold uppercase tracking-wide text-ink">SEO</div>
            
            <div>
              <label className="mb-1 block text-[13px] text-ink">
                URL Slug
                {hasChange('slug') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
              </label>
              <input
                type="text"
                value={getValue('slug')}
                onChange={(e) => onEdit('slug', e.target.value)}
                disabled={disabled}
                placeholder="product-url-slug"
                className="f-input w-full font-mono text-[12px]"
              />
              <div className="mt-0.5 text-[11px] text-inkmuted">Used in product URL. Leave empty to auto-generate.</div>
            </div>

            <div>
              <label className="mb-1 block text-[13px] text-ink">
                SEO Title
                {hasChange('seoTitle') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
              </label>
              <input
                type="text"
                value={getValue('seoTitle')}
                onChange={(e) => onEdit('seoTitle', e.target.value)}
                disabled={disabled}
                placeholder="SEO optimized page title..."
                className="f-input w-full"
              />
            </div>

            <div>
              <label className="mb-1 block text-[13px] text-ink">
                SEO Description
                {hasChange('seoDescription') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
              </label>
              <textarea
                value={getValue('seoDescription')}
                onChange={(e) => onEdit('seoDescription', e.target.value)}
                disabled={disabled}
                rows={2}
                maxLength={160}
                placeholder="Meta description (max 160 characters)..."
                className="f-input w-full resize-y"
              />
              <div className="mt-0.5 text-[11px] text-inkmuted">
                {getValue('seoDescription').length}/160 characters
              </div>
            </div>
          </div>

          {/* E-commerce Overrides */}
          <div className="mb-3 space-y-2">
            <div className="text-[12px] font-bold uppercase tracking-wide text-ink">E-commerce Overrides</div>
            
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[13px] text-ink">
                  E-comm Discount %
                  {hasChange('ecommOffPercent') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
                </label>
                <input
                  type="number"
                  value={getValue('ecommOffPercent')}
                  onChange={(e) => onEdit('ecommOffPercent', e.target.value)}
                  disabled={disabled}
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="0.00"
                  className="f-input w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-[13px] text-ink">
                  Price Override
                  {hasChange('barcodePriceOverride') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
                </label>
                <input
                  type="number"
                  value={getValue('barcodePriceOverride')}
                  onChange={(e) => onEdit('barcodePriceOverride', e.target.value)}
                  disabled={disabled}
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  className="f-input w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-[13px] text-ink">
                  Quantity Override
                  {hasChange('barcodeQtyOverride') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
                </label>
                <input
                  type="number"
                  value={getValue('barcodeQtyOverride')}
                  onChange={(e) => onEdit('barcodeQtyOverride', e.target.value)}
                  disabled={disabled}
                  min="0"
                  step="1"
                  placeholder="0"
                  className="f-input w-full"
                />
              </div>

              <div>
                <label className="mb-1 block text-[13px] text-ink">
                  Status Override
                  {hasChange('barcodeStatusOverride') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
                </label>
                <select
                  value={getValue('barcodeStatusOverride')}
                  onChange={(e) => onEdit('barcodeStatusOverride', e.target.value)}
                  disabled={disabled}
                  className="f-input w-full"
                >
                  {STATUS_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Storefront Settings */}
          <div className="space-y-2">
            <div className="text-[12px] font-bold uppercase tracking-wide text-ink">Storefront Settings</div>
            
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={getValue('isFeatured') === true || getValue('isFeatured') === 'true'}
                  onChange={(e) => onEdit('isFeatured', e.target.checked)}
                  disabled={disabled}
                  className="h-4 w-4"
                />
                <span>
                  Featured Product
                  {hasChange('isFeatured') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
                </span>
              </label>

              <div className="flex-1">
                <label className="mb-1 block text-[13px] text-ink">
                  Sales Count
                  {hasChange('salesCount') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
                </label>
                <input
                  type="number"
                  value={getValue('salesCount')}
                  onChange={(e) => onEdit('salesCount', e.target.value)}
                  disabled={disabled}
                  min="0"
                  step="1"
                  placeholder="0"
                  className="f-input w-full"
                />
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 rounded border border-line bg-[#f7f9fc] px-2 py-1.5 text-[11px] text-inkmuted">
            <span className="text-[#8a5a00]">●</span> = Field has changes from existing data
          </div>
        </div>
      )}
    </div>
  );
}
