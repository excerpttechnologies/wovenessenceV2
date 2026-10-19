'use client';
import { useState, useEffect, useRef } from 'react';
import ClassificationPicker from '@/components/ClassificationPicker';
import Icon from '@/components/Icon';
import Modal from '@/components/Modal';
import { ECOMMERCE_FIELDS } from '@/lib/barcodeImportEcommerceFields';
import { 
  PRODUCT_TYPE_CLASSIFICATIONS,
  PRODUCT_TYPES,
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

export default function BarcodeImportEcommerceSection({
  row,
  values = {},
  businessId,
  disabled = false,
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [draftValues, setDraftValues] = useState(values);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productError, setProductError] = useState('');
  const [productSaved, setProductSaved] = useState(false);
  const initialValues = useRef(values);
  const [productTypes, setProductTypes] = useState(PRODUCT_TYPES);

  // Helper to get field value (from values prop which includes edits)
  const getValue = (field) => draftValues[field] ?? '';
  const setValue = (field, value) => setDraftValues((current) => ({ ...current, [field]: value }));

  useEffect(() => {
    if (!businessId) return;

    let cancelled = false;
    fetch(`/api/v1/admin/product-types?business=${encodeURIComponent(businessId)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Unable to load product types')))
      .then((data) => {
        if (!cancelled && Array.isArray(data.types)) setProductTypes(data.types);
      })
      .catch((error) => console.error('Failed to load product types:', error));

    return () => { cancelled = true; };
  }, [businessId]);

  const openModal = async () => {
    initialValues.current = values;
    setDraftValues(values);
    setProductError('');
    setProductSaved(false);
    setModalOpen(true);
    const itemCode = String(row.values?.itemCode || row.itemCode || '').trim();
    if (!businessId || !itemCode) {
      setProductError('A business and matching Item Code are required to load saved product data.');
      return;
    }
    setLoadingProduct(true);
    try {
      const params = new URLSearchParams({ business: businessId, itemCode });
      const response = await fetch(`/api/v1/admin/ecommerce-product?${params}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to load e-commerce product data.');
      const saved = data.product || {};
      const merged = { ...saved, ...values };
      ECOMMERCE_FIELDS.forEach((field) => {
        if (values[field] === undefined || values[field] === null || values[field] === '') {
          if (saved[field] !== undefined) merged[field] = saved[field];
        }
      });
      setDraftValues(merged);
      initialValues.current = merged;
    } catch (error) {
      setProductError(error.message || 'Unable to load e-commerce product data.');
    } finally {
      setLoadingProduct(false);
    }
  };

  const closeModal = () => {
    if (!disabled && !savingProduct) {
      setModalOpen(false);
      setDraftValues(initialValues.current);
      setProductError('');
    }
  };

  const saveProduct = async () => {
    if (savingProduct || loadingProduct) return;
    const itemCode = String(row.values?.itemCode || row.itemCode || '').trim();
    setSavingProduct(true);
    setProductError('');
    setProductSaved(false);
    try {
      const response = await fetch('/api/v1/admin/ecommerce-product', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business: businessId, itemCode, updates: draftValues }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to save e-commerce product data.');
      const saved = { ...draftValues, ...data.product };
      setDraftValues(saved);
      initialValues.current = saved;
      setProductSaved(true);
    } catch (error) {
      setProductError(error.message || 'Unable to save e-commerce product data.');
    } finally {
      setSavingProduct(false);
    }
  };

  const productType = getValue('productType') || '';
  const applicableClassifications = PRODUCT_TYPE_CLASSIFICATIONS[productType] || [];
  
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
    'isFeatured', 'salesCount', 'status', 'isPublished',
    'weaveDescription', 'fabricDescription', 'craftDescription', 'occasionDescription', 'colourDescription',
  ].filter(f => getValue(f) !== '' && getValue(f) !== null && getValue(f) !== undefined).length;

  const classificationsCount = applicableClassifications.reduce((count, type) => {
    const val = draftValues[type];
    return count + (Array.isArray(val) ? val.length : 0);
  }, 0);

  const totalCount = fieldsWithData + classificationsCount;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={disabled}
        className="btn mt-3"
        aria-haspopup="dialog"
      >
        <Icon name="pencil" size={14} /> E-commerce Fields
        {totalCount > 0 && <span className="ml-1 rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{totalCount}</span>}
      </button>

      <Modal
        open={modalOpen}
        title="E-commerce Fields"
        onClose={closeModal}
        size="lg"
        closeOnBackdrop={!disabled}
        footer={(
          <div className="flex justify-end gap-2">
            <button type="button" className="btn" onClick={closeModal} disabled={disabled}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={saveProduct} disabled={disabled || loadingProduct || savingProduct}>
              {savingProduct ? 'Saving...' : 'Save Product Details'}
            </button>
          </div>
        )}
      >
        <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
          {loadingProduct && <div className="text-[12px] text-inkmuted" role="status">Loading saved product details...</div>}
          {productError && <div className="rounded border border-[#f1b0b0] bg-[#fdecec] px-3 py-2 text-[12px] text-danger" role="alert">{productError}</div>}
          {productSaved && <div className="rounded border border-[#b7dfc2] bg-okgreenbg px-3 py-2 text-[12px] text-okgreen" role="status">E-commerce product details saved.</div>}
          {/* Product Type */}
          <div className="mb-3">
            <label className="mb-1 block text-[13px] text-ink">E-commerce Item Code</label>
            <input
              type="text"
              value={getValue('ecommItemCode')}
              onChange={(e) => setValue('ecommItemCode', e.target.value)}
              disabled={disabled || loadingProduct || savingProduct}
              placeholder="Storefront SKU / item code"
              className="f-input w-full"
            />
          </div>

          <div className="mb-3">
            <label className="mb-1 block text-[13px] text-ink">
              Product Type
              {hasChange('productType') && <span className="ml-2 text-[11px] text-[#8a5a00]">●</span>}
            </label>
            <select
              value={getValue('productType')}
              onChange={(e) => setValue('productType', e.target.value)}
              disabled={disabled}
              className="f-input w-full"
            >
              {productTypes.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[13px] text-ink">Product Status</label>
              <select value={getValue('status') || 'draft'} onChange={(e) => setValue('status', e.target.value)} disabled={disabled || loadingProduct || savingProduct} className="f-input w-full">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-ink">
              <input type="checkbox" checked={getValue('isPublished') === true} onChange={(e) => setValue('isPublished', e.target.checked)} disabled={disabled || loadingProduct || savingProduct} className="h-4 w-4" />
              Published on storefront
            </label>
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
                    value={Array.isArray(draftValues[type]) ? draftValues[type] : []}
                    onChange={(newValue) => setValue(type, newValue)}
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
                onChange={(e) => setValue('displayName', e.target.value)}
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
                onChange={(e) => setValue('printDescriptionOverride', e.target.value)}
                disabled={disabled}
                rows={2}
                placeholder="Custom description for printing..."
                className="f-input w-full resize-y"
              />
            </div>

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
                onChange={(e) => setValue('slug', e.target.value)}
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
                onChange={(e) => setValue('seoTitle', e.target.value)}
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
                onChange={(e) => setValue('seoDescription', e.target.value)}
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
                  onChange={(e) => setValue('ecommOffPercent', e.target.value)}
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
                  onChange={(e) => setValue('barcodePriceOverride', e.target.value)}
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
                  onChange={(e) => setValue('barcodeQtyOverride', e.target.value)}
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
                  onChange={(e) => setValue('barcodeStatusOverride', e.target.value)}
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
                  onChange={(e) => setValue('isFeatured', e.target.checked)}
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
                  onChange={(e) => setValue('salesCount', e.target.value)}
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
      </Modal>
    </>
  );
}
