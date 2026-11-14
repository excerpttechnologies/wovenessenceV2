'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import ClassificationPicker from '@/components/ClassificationPicker';
import ProductGalleryManager from '@/components/ProductGalleryManager';
import { useScope } from '@/components/ScopeContext';
import {
  CLASSIFICATION_GROUPS,
  PRODUCT_TYPE_CLASSIFICATIONS,
  PRODUCT_TYPES,
} from '@/lib/productClassificationConstants';
import { parseEcommerceVisibility } from '@/lib/ecommerceVisibility';

/* E-commerce -> product-eccom -> Add (19-10-2026).

   One input per field of the `ecommerceproduct` collection, read from
   /api/product-eccom?fields=1 - so a field the e-commerce project adds
   appears here too, as a text box until it is given a type below.

     itemId        the item the product is for (one product per item)
     by*           tick boxes of the business's classification options
     flags         check boxes
     numbers       number inputs
     descriptions  text areas; additionalImages one URL per line
     businessId    the company in the top bar; createdAt / updatedAt are set
                   by the server */

const KNOWN = {
  displayName: 'text', ecommItemCode: 'text', productType: 'text', status: 'text', slug: 'text',
  isFeatured: 'boolean',
  /* listed in the website's Best Buy section (29-10-2026) */
  isBestBuy: 'boolean',
  ecommOffPercent: 'number', barcodePriceOverride: 'number', barcodeQtyOverride: 'number', salesCount: 'number',
  barcodeStatusOverride: 'text', printDescriptionOverride: 'text', image: 'text',
  seoTitle: 'text', seoDescription: 'textarea',
  colourDescription: 'textarea', craftDescription: 'textarea', fabricDescription: 'textarea',
  occasionDescription: 'textarea', weaveDescription: 'textarea',
  additionalImages: 'lines',
  byColour: 'classification', byCraft: 'classification', byFabric: 'classification',
  byOccasion: 'classification', byWeave: 'classification',
};
const FIRST = [
  'printDescriptionOverride',
  'displayName', 'image', 'productType', 'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
  'status', 'ecommItemCode', 'itemId',
  'slug', 'isBestBuy', 'isFeatured', 'salesCount',
];
const ALL_CLASSIFICATION_TYPES = [
  'byWeave',
  'byFabric',
  'byCraft',
  'byOccasion',
  'byColour',
];
const SKIP = new Set([
  'isPublished',
  'isActive',
  'status',
  'businessId', 'createdAt', 'updatedAt', 'seoDescription', 'barcode',
  /* per-barcode visibility is owned by the server; never render or echo it */
  'barcodes', 'publishedBarcodes',
  'barcodeStatusOverride', 'seoTitle',
  'slug', 'isFeatured',
  'colourDescription', 'craftDescription', 'fabricDescription',
  'occasionDescription', 'weaveDescription',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride',
  /* managed by ProductGalleryManager below, not the generic lines field */
  'additionalImages',
]);

/* A product reaches the website only when it is published, active and its
   status is active, so a new form starts ready to be published. */
const DEFAULT_DATA = { status: 'active', isActive: true, isPublished: false, isFeatured: false, isBestBuy: false };

/* Fields the lookup panel offers besides the barcode, which has its own box. */
const IDENTIFY_FIELDS = [
  { value: 'itemCode', label: 'Item Code', placeholder: 'Item code' },
  { value: 'ecommItemCode', label: 'E-commerce Item Code', placeholder: 'E-commerce item code' },
  { value: 'name', label: 'Product Name', placeholder: 'Type a product name' },
  { value: 'supplierCode', label: 'Supplier Code', placeholder: 'Supplier code' },
];

const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const fieldLabel = (k) => ({
  ecommOffPercent: 'E-Comm Off (%)',
  barcodePriceOverride: 'Price',
  barcodeQtyOverride: 'Quantity',
  printDescriptionOverride: 'Print Description',
  displayName: 'Product Name',
  status: 'Active Status',
}[k] || labelOf(k));
const kindOf = (f) => (f.k === 'itemId' ? 'item' : KNOWN[f.k] || (f.type === 'boolean' ? 'boolean' : f.type === 'number' ? 'number' : f.type === 'array' ? 'lines' : 'text'));

export default function ProductEccomAddPage() {
  const router = useRouter();
  const { business } = useScope();
  const [fields, setFields] = useState(null);
  const [items, setItems] = useState([]);
  const [productTypes, setProductTypes] = useState(PRODUCT_TYPES);
  const [classificationOptions, setClassificationOptions] = useState({});
  const [classificationOptionsLoading, setClassificationOptionsLoading] = useState(false);
  const [classificationOptionsError, setClassificationOptionsError] = useState('');
  const [data, setData] = useState(DEFAULT_DATA);
  const [barcodeInput, setBarcodeInput] = useState('');
  /* opened from the list's Edit action: ?barcode= loads that saved product into the form */
  const [isEdit, setIsEdit] = useState(false);
  useEffect(() => {
    const barcode = new URLSearchParams(window.location.search).get('barcode')?.trim();
    if (barcode) {
      setIsEdit(true);
      setBarcodeInput(barcode);
    }
  }, []);
  const [barcodeOptions, setBarcodeOptions] = useState([]);
  const [barcodeOptionsLoading, setBarcodeOptionsLoading] = useState(false);
  const [barcodeOptionsError, setBarcodeOptionsError] = useState('');
  const [barcodePickerOpen, setBarcodePickerOpen] = useState(false);
  const [itemDetails, setItemDetails] = useState(null);
  /* the barcode exactly as the ERP stores it (case included); saved instead of what was typed */
  const [resolvedBarcode, setResolvedBarcode] = useState('');
  const [barcodeLoading, setBarcodeLoading] = useState(false);
  const [barcodeError, setBarcodeError] = useState('');
  const [productMatch, setProductMatch] = useState(null);
  /* identifying fields other than the barcode box (item code, e-commerce code,
     product name, supplier code) - section "automatic field population" */
  const [identifyBy, setIdentifyBy] = useState('itemCode');
  const [identifyInput, setIdentifyInput] = useState('');
  const [identifyMatches, setIdentifyMatches] = useState([]);
  const [identifyOpen, setIdentifyOpen] = useState(false);
  const [identifyLoading, setIdentifyLoading] = useState(false);
  const [identifyError, setIdentifyError] = useState('');
  const [lookupNotice, setLookupNotice] = useState('');
  /* keys the user has typed into since the last successful lookup. A lookup
     fills the form from the ERP, but must not silently throw those away. */
  const manualRef = useRef(new Set());
  /* the latest data, readable from a lookup callback without making `data` a
     dependency of the lookup effect (which would refire on every keystroke) */
  const dataRef = useRef(data);
  useEffect(() => { dataRef.current = data; }, [data]);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageHovered, setImageHovered] = useState(false);

  useEffect(() => {
    if (!business) return undefined;
    let off = false;
    const q = 'business=' + business;
    Promise.all([
      fetch('/api/product-eccom?fields=1&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/options?ref=item&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/v1/admin/product-types?business=' + encodeURIComponent(business), { cache: 'no-store' })
        .then((r) => r.ok ? r.json() : Promise.reject(new Error('Unable to load product types')))
        .catch((e) => { console.error('Failed to load product types:', e); return {}; }),
    ]).then(([f, it, pt]) => {
      if (off) return;
      /* the known fields always, plus whatever else the collection carries */
      const seen = (f.fields || []).filter((x) => !SKIP.has(x.k));
      const all = [...seen];
      ['itemId', ...Object.keys(KNOWN)].forEach((k) => {
        if (!SKIP.has(k) && !all.some((x) => x.k === k)) all.push({ k, type: 'text' });
      });
      setFields(all);
      setItems((it.options || []).map((o) => ({ ...o, value: String(o.value) })));
      setProductTypes(Array.isArray(pt.types) && pt.types.length ? pt.types : PRODUCT_TYPES);
    });
    return () => { off = true; };
  }, [business]);

  useEffect(() => {
    if (!barcodePickerOpen || !business) {
      setBarcodeOptions([]);
      setBarcodeOptionsError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBarcodeOptionsLoading(true);
      setBarcodeOptionsError('');
      try {
        const query = new URLSearchParams({
          barcodeOptions: '1',
          business,
          search: barcodeInput.trim(),
        });
        const response = await fetch(`/api/product-eccom?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load barcodes.');
        setBarcodeOptions(Array.isArray(result.options) ? result.options : []);
      } catch (optionsError) {
        if (optionsError.name !== 'AbortError') {
          setBarcodeOptionsError(optionsError.message || 'Could not load barcodes.');
        }
      } finally {
        if (!controller.signal.aborted) setBarcodeOptionsLoading(false);
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [barcodePickerOpen, barcodeInput, business]);

  /* ------------------------------------------------- field autofill ---

     Typing one of the other identifying fields finds the product and hands its
     BARCODE to the box above, whose lookup then fills every remaining field
     (price, quantity, supplier, classifications, photo). Only the barcode is
     taken from this path, so there is one filling path - not two that could
     disagree about the same product. */
  const applyIdentifyMatch = useCallback((match) => {
    if (!match) return;
    setIdentifyMatches([]);
    setIdentifyOpen(false);
    setLookupNotice('');
    if (match.barcode) {
      manualRef.current = new Set();
      setData({ ...DEFAULT_DATA });
      setBarcodePickerOpen(false);
      setBarcodeInput(match.barcode);
      return;
    }
    /* an item that has no barcode cannot be listed yet: fill what is known and
       say so instead of leaving a silently half-filled form */
    manualRef.current = new Set();
    setBarcodeError('');
    setItemDetails(null);
    setProductMatch(null);
    setResolvedBarcode('');
    setLookupNotice('This item has no barcode yet, so only the item and its codes could be filled.');
    setData({
      ...DEFAULT_DATA,
      itemId: match.itemId,
      displayName: match.name || '',
      ecommItemCode: match.itemCode || '',
    });
  }, []);

  useEffect(() => {
    const value = identifyInput.trim();
    if (!business || value.length < 2) {
      setIdentifyMatches([]);
      setIdentifyError('');
      setIdentifyLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setIdentifyLoading(true);
      setIdentifyError('');
      try {
        const query = new URLSearchParams({ productLookup: value, by: identifyBy, business });
        const response = await fetch(`/api/product-eccom?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not look up this product.');
        const matches = Array.isArray(result.matches) ? result.matches : [];
        setIdentifyMatches(matches);
        setIdentifyOpen(true);
        /* one match is unambiguous, so fill the form; several are listed for
           the user to choose rather than an arbitrary product being taken */
        if (matches.length === 1) applyIdentifyMatch(matches[0]);
      } catch (lookupError) {
        if (lookupError.name !== 'AbortError') {
          setIdentifyMatches([]);
          setIdentifyError(lookupError.message || 'Could not look up this product.');
        }
      } finally {
        if (!controller.signal.aborted) setIdentifyLoading(false);
      }
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [identifyInput, identifyBy, business, applyIdentifyMatch]);

  useEffect(() => {
    const barcode = barcodeInput.trim();
    if (!barcode || !business) {
      setBarcodeLoading(false);
      setBarcodeError('');
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setBarcodeLoading(true);
      setBarcodeError('');
      setProductMatch(null);
      try {
        const query = new URLSearchParams({ barcodeLookup: barcode, business });
        const response = await fetch(`/api/product-eccom?${query}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not look up this barcode.');

        setProductMatch(result.productMatch || null);
        setItemDetails(result.item);
        setResolvedBarcode(result.barcodeNo || result.barcode || '');
        setBarcodePickerOpen(false);
        /* Start from the defaults, not the previous product. The barcode box
           identifies one garment; no field of the last garment - least of all
           its `isPublished` answer - may survive into this one. */
        const current = dataRef.current || {};
        const next = {
          ...DEFAULT_DATA,
          ...Object.fromEntries(Object.entries(result.data || {}).filter(([key]) =>
            ![
              '_id', '__v', 'businessId', 'createdAt', 'updatedAt', 'isActive',
              'barcode', 'barcodes', 'publishedBarcodes',
            ].includes(key))),
          /* the server answers for THIS barcode only */
          isPublished: parseEcommerceVisibility(result.data?.isPublished) ?? false,
          itemId: result.item.id,
        };
        /* Only edits made for the barcode currently in the box survive. A new
           barcode clears manualRef in onBarcodeChange, so nothing crosses over. */
        const kept = [...manualRef.current].filter((key) =>
          key !== 'itemId'
          && key !== 'isPublished'
          && key !== 'barcode'
          && key !== 'barcodes'
          && key !== 'publishedBarcodes'
          && current[key] !== undefined
          && current[key] !== null
          && current[key] !== ''
          && !(Array.isArray(current[key]) && !current[key].length));
        kept.forEach((key) => { next[key] = current[key]; });
        manualRef.current = new Set();
        /* When this item's product is filed under a sibling barcode, saving
           only changes whether THIS barcode is shown; the existing product and
           its other barcodes are untouched. */
        const savedFor = result.productMatch && result.productMatch.ownsBarcode === false
          ? String(result.productMatch.savedBarcode || '').trim()
          : '';
        setLookupNotice([
          kept.length
            ? kept.length + ' field' + (kept.length === 1 ? '' : 's') + ' you edited kept as typed.'
            : '',
          savedFor && savedFor !== (result.barcodeNo || '')
            ? 'This item\u2019s e-commerce product is saved for barcode ' + savedFor
              + '. Saving only sets whether ' + (result.barcodeNo || barcode)
              + ' is shown in E-commerce; the existing product settings and its other barcodes are unchanged.'
            : '',
        ].filter(Boolean).join(' '));
        setData(next);
        setItems((current) => current.some((item) => item.value === result.item.id)
          ? current
          : [...current, {
            value: result.item.id,
            label: [result.item.itemCode, result.item.name].filter(Boolean).join(' - '),
          }]);
        setErrors((current) => ({ ...current, itemId: '' }));
      } catch (lookupError) {
        if (lookupError.name !== 'AbortError') {
          setProductMatch(null);
          setItemDetails(null);
          setBarcodeError(lookupError.message || 'Could not look up this barcode.');
        }
      } finally {
        if (!controller.signal.aborted) setBarcodeLoading(false);
      }
    }, 450);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [barcodeInput, business]);

  const ordered = useMemo(() => {
    const list = fields || [];
    const productType = String(data.productType || '').trim().toUpperCase();
    const configuredType = productTypes.find((option) => option.value === productType);
    const applicableClassifications = Array.isArray(configuredType?.filters)
      ? configuredType.filters
      : PRODUCT_TYPE_CLASSIFICATIONS[productType] || ALL_CLASSIFICATION_TYPES;
    return [
      ...FIRST.map((k) => list.find((f) => f.k === k)).filter((field) =>
        field && (kindOf(field) !== 'classification'
          || !applicableClassifications
          || applicableClassifications.includes(field.k))
      ),
      ...list.filter((field) =>
        !FIRST.includes(field.k)
        && (kindOf(field) !== 'classification'
          || !applicableClassifications
          || applicableClassifications.includes(field.k))
      ),
    ];
  }, [fields, data.productType, productTypes]);

  const classificationFields = useMemo(
    () => ordered.filter((field) => kindOf(field) === 'classification'),
    [ordered]
  );

  useEffect(() => {
    const productType = String(data.productType || '').trim().toUpperCase();
    if (!business || !productType || !classificationFields.length) {
      setClassificationOptions({});
      setClassificationOptionsError('');
      setClassificationOptionsLoading(false);
      return undefined;
    }

    let cancelled = false;
    const classificationProductType = CLASSIFICATION_GROUPS.some(
      (group) => group.value === productType
    ) ? productType : 'SIMPLE';
    setClassificationOptionsLoading(true);
    setClassificationOptions({});
    setClassificationOptionsError('');

    Promise.all(classificationFields.map(async (field) => {
      const params = new URLSearchParams({
        business,
        type: field.k,
        productType: classificationProductType,
      });
      const response = await fetch(
        '/api/v1/admin/product-classification-options?' + params.toString(),
        { cache: 'no-store' }
      );
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || 'Could not load ' + fieldLabel(field.k) + ' options.');
      }
      return [field.k, result.options?.[field.k] || []];
    }))
      .then((results) => {
        if (!cancelled) setClassificationOptions(Object.fromEntries(results));
      })
      .catch((optionsError) => {
        if (!cancelled) {
          setClassificationOptions({});
          setClassificationOptionsError(
            optionsError.message || 'Could not load selected filter names.'
          );
        }
      })
      .finally(() => {
        if (!cancelled) setClassificationOptionsLoading(false);
      });

    return () => { cancelled = true; };
  }, [business, data.productType, classificationFields]);

  const selectedFilterSummary = classificationFields.flatMap((field) => {
    const selectedIds = Array.isArray(data[field.k]) ? data[field.k].map(String) : [];
    if (!selectedIds.length) return [];

    const namesById = new Map(
      (classificationOptions[field.k] || []).map((option) => [
        String(option._id ?? option.value),
        option.name ?? option.label ?? '',
      ])
    );
    const names = selectedIds.map((id) => namesById.get(id)).filter(Boolean);
    return names.length ? [{ label: fieldLabel(field.k), names }] : [];
  });
  const hasSelectedFilters = classificationFields.some((field) =>
    Array.isArray(data[field.k]) && data[field.k].length > 0
  );

  const set = (k, v) => {
    /* remember it as the operator's own value, so a later lookup does not
       overwrite it without telling them */
    manualRef.current.add(k);
    setData((d) => ({ ...d, [k]: v }));
    setErrors((e) => ({ ...e, [k]: '' }));
  };

  /* "Show in E-commerce" ticks a flag the storefront requires; publishing an
     inactive row would still hide it, so the other two flags follow along. */
  const togglePublished = (checked) => {
    setData((d) => ({ ...d, isPublished: checked, ...(checked ? { isActive: true, status: 'active' } : {}) }));
  };

  /* picking the item fills Display Name and Ecomm Item Code; it is a different
     product, so no field of the previous barcode survives */
  const pickItem = (v) => {
    const it = items.find((o) => o.value === v);
    manualRef.current = new Set();
    setBarcodeInput('');
    setItemDetails(null);
    setProductMatch(null);
    setResolvedBarcode('');
    setBarcodeError('');
    setLookupNotice('');
    setData({
      ...DEFAULT_DATA,
      itemId: v,
      displayName: it?.name || it?.label || '',
      ecommItemCode: it?.code || '',
    });
    setErrors((e) => ({ ...e, itemId: '' }));
  };

  /* The barcode box identifies ONE garment. Every change - typing, correcting,
     clearing or picking from the list - starts that garment's form from the
     defaults, so an `isPublished` answer or any other field of the previous
     barcode can never be saved onto the new one. */
  const onBarcodeChange = (event) => {
    const value = event.target.value;
    manualRef.current = new Set();
    setBarcodeInput(value);
    /* typing in the box that is still focused after a pick shows the list again (29-10-2026) */
    setBarcodePickerOpen(true);
    setItemDetails(null);
    setProductMatch(null);
    setResolvedBarcode('');
    setBarcodeError('');
    setLookupNotice('');
    setData({ ...DEFAULT_DATA });
  };

  const selectBarcode = (option) => {
    manualRef.current = new Set();
    setBarcodeInput(option.value);
    setItemDetails(null);
    setProductMatch(null);
    setResolvedBarcode('');
    setBarcodeError('');
    setLookupNotice('');
    setBarcodeOptions([]);
    setBarcodePickerOpen(false);
    setData({ ...DEFAULT_DATA });
  };

  async function save() {
    setSaving(true);
    setError('');
    try {
      /* Save the barcode currently in the box, not a value left in `data` by
         an earlier lookup. */
      const saveBarcode = (resolvedBarcode || barcodeInput.trim()).trim();
      const visibilityOnly = productMatch?.ownsBarcode === false && Boolean(saveBarcode);
      const published = parseEcommerceVisibility(data.isPublished) ?? false;
      const r = await fetch('/api/product-eccom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          business,
          ...(saveBarcode ? { barcode: saveBarcode } : {}),
          ...(visibilityOnly ? { addBarcodeToExisting: saveBarcode } : {}),
          data: visibilityOnly
            /* a sibling save may only flip this barcode's flag */
            ? { itemId: data.itemId, isPublished: published }
            : {
              ...data,
              isPublished: published,
              /* the storefront needs all three flags, so publishing sets them */
              ...(published === true ? { isActive: true, status: 'active' } : {}),
              ...(saveBarcode ? { barcode: saveBarcode } : {}),
            },
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErrors(d.errors || {});
        setError(d.error || 'Could not save.');
        return;
      }
      window.location.assign('/admin/ecommerce/product-eccom');
    } catch {
      setError('Could not reach the server.');
    } finally {
      setSaving(false);
    }
  }

  const input = (f) => {
    const k = f.k;
    const kind = kindOf(f);
    const v = data[k];
    if (k === 'image') {
      return (
        <div>
          {v && (
            <img
              src={v}
              alt="Product image from barcode"
              className="h-48 w-80 max-w-full cursor-zoom-in rounded border border-line object-cover"
              onMouseEnter={() => setImageHovered(true)}
              onMouseLeave={() => setImageHovered(false)}
              onFocus={() => setImageHovered(true)}
              onBlur={() => setImageHovered(false)}
              tabIndex={0}
            />
          )}
          {!v && <div className="text-[12px] text-inkmuted">No image available for this barcode.</div>}
        </div>
      );
    }
    if (kind === 'item') {
      return <MultiSelect mode="single" options={items} value={v || ''} placeholder="Select item" onChange={pickItem} />;
    }
    if (k === 'productType') {
      const options = [...productTypes];
      if (v && !options.some((option) => option.value === v)) options.push({ value: v, label: v });
      /* a barcode lookup sets the type from the item's group: lock it then. Left editable when the
         lookup found no real type (empty, or an item type such as "Simple"), so one can be chosen. */
      const locked = Boolean(itemDetails && v && productTypes.some((option) => option.value && option.value === v));
      return (
        <select
          className={`f-input${locked ? ' cursor-not-allowed bg-slate-100' : ''}`}
          value={v || ''}
          disabled={locked}
          title={locked ? 'Set from the barcode\'s item group' : undefined}
          onChange={(event) => {
            set(k, event.target.value);
            /* the by* names belong to a Product Type group - a new type starts them empty (29-10-2026) */
            setData((d) => ({ ...d, byWeave: [], byFabric: [], byCraft: [], byOccasion: [], byColour: [] }));
          }}
        >
          {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      );
    }
    if (kind === 'boolean') {
      return (
        <label className="flex h-[38px] cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={Boolean(v)} onChange={(e) => set(k, e.target.checked)} /> {k === 'isBestBuy' ? 'Best Buy' : labelOf(k)}
        </label>
      );
    }
    if (kind === 'number') {
      return <input className="f-input" type="number" value={v ?? ''} onWheel={(e) => e.currentTarget.blur()} onChange={(e) => set(k, e.target.value)} />;
    }
    if (kind === 'textarea') {
      return <textarea className="f-input min-h-[70px]" value={v ?? ''} onChange={(e) => set(k, e.target.value)} />;
    }
    if (kind === 'lines') {
      return <textarea className="f-input min-h-[70px]" placeholder="One per line" value={Array.isArray(v) ? v.join('\n') : (v ?? '')} onChange={(e) => set(k, e.target.value.split('\n'))} />;
    }
    if (kind === 'classification') {
      /* 29-10-2026: the names of the product's own group (E-commerce -> By Weave /
         By Fabric / ... -> Group); "Add New By ..." adds to that group */
      const productType = String(data.productType || '').trim().toUpperCase();
      const classificationProductType = CLASSIFICATION_GROUPS.some(
        (group) => group.value === productType
      ) ? productType : 'SIMPLE';
      return (
        <ClassificationPicker
          type={k}
          value={Array.isArray(v) ? v.map(String) : []}
          onChange={(value) => set(k, value)}
          businessId={business}
          productType={productType ? classificationProductType : undefined}
          allowCreate={Boolean(productType)}
        />
      );
    }
    return <input className="f-input" value={v ?? ''} onChange={(e) => set(k, e.target.value)} />;
  };

  const wide = (f) => ['textarea', 'lines', 'classification'].includes(kindOf(f));

  return (
    <>
      <div className="card">
        <div className="card-head">
          <span className="card-title">{isEdit ? 'Edit product-eccom' : 'Add product-eccom'}</span>
          <span className="flex-1" />
          <button type="button" className="btn btn-ghost" onClick={() => router.push('/admin/ecommerce/product-eccom')}>
            <Icon name="x" size={14} /> Cancel
          </button>
        </div>
        <div className="card-body">
          {!business && <div className="flash flash-err">Select a Business in the top bar first.</div>}
          {business && fields === null && <div className="py-6 text-center text-[13px] text-inkmuted">Loading...</div>}
          {error && <div className="flash flash-err mb-3">{error}</div>}
          {business && fields && (
            <>
            {/* Auto-population from an identifying field other than the barcode:
                the value finds the product, whose barcode then fills the rest of
                the form through the barcode lookup above. */}
            <div className="mb-3 flex flex-wrap items-end gap-2 rounded-md border border-line bg-[#f7f9fc] px-2.5 py-2">
              <div className="w-[170px]">
                <label className="f-label" htmlFor="identify-field">Find product by</label>
                <select
                  id="identify-field"
                  className="f-input"
                  value={identifyBy}
                  onChange={(event) => {
                    setIdentifyBy(event.target.value);
                    setIdentifyInput('');
                    setIdentifyMatches([]);
                    setIdentifyError('');
                    setLookupNotice('');
                  }}
                >
                  {IDENTIFY_FIELDS.map((field) => (
                    <option key={field.value} value={field.value}>{field.label}</option>
                  ))}
                </select>
              </div>
              <div className="relative w-[300px]">
                <label className="f-label" htmlFor="identify-value">
                  {IDENTIFY_FIELDS.find((field) => field.value === identifyBy)?.label || 'Value'}
                </label>
                <input
                  id="identify-value"
                  className="f-input"
                  value={identifyInput}
                  placeholder={IDENTIFY_FIELDS.find((field) => field.value === identifyBy)?.placeholder || ''}
                  onChange={(event) => { setIdentifyInput(event.target.value); setIdentifyOpen(true); }}
                  onFocus={() => setIdentifyOpen(true)}
                  onBlur={() => setTimeout(() => setIdentifyOpen(false), 150)}
                  role="combobox"
                  aria-autocomplete="list"
                  aria-expanded={identifyOpen}
                />
                {identifyOpen && (identifyLoading || identifyError || identifyInput.trim().length >= 2) && (
                  <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-white shadow-pop">
                    {identifyLoading ? (
                      <div className="px-3 py-2 text-[12px] text-inkmuted">Looking up product...</div>
                    ) : identifyError ? (
                      <div className="px-3 py-2 text-[12px] text-danger" role="alert">{identifyError}</div>
                    ) : identifyMatches.length ? (
                      identifyMatches.map((match) => (
                        <button
                          key={String(match.itemId) + '|' + match.barcode}
                          type="button"
                          className="block w-full border-b border-line px-3 py-2 text-left text-[12px] text-ink last:border-b-0 hover:bg-slate-50"
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applyIdentifyMatch(match)}
                        >
                          {match.label}
                          {!match.barcode && <span className="text-inkmuted"> (no barcode)</span>}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-[12px] text-inkmuted">No matching product.</div>
                    )}
                  </div>
                )}
              </div>
              {identifyMatches.length > 1 && (
                <div className="pb-2 text-[12px] text-inkmuted">
                  {identifyMatches.length} matches - pick the right product
                </div>
              )}
            </div>

            <div className="mb-3 grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
              <div>
                <label className="f-label">Barcode</label>
                <div className="relative">
                  <input
                    className="f-input"
                    value={barcodeInput}
                    placeholder="Search, scan or enter barcode"
                    onFocus={() => setBarcodePickerOpen(true)}
                    onClick={() => setBarcodePickerOpen(true)}
                    onBlur={() => setTimeout(() => setBarcodePickerOpen(false), 150)}
                    onChange={onBarcodeChange}
                    role="combobox"
                    aria-autocomplete="list"
                    aria-expanded={barcodePickerOpen}
                  />
                  {barcodePickerOpen && (
                    <div className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-line bg-white shadow-pop">
                      {barcodeOptionsLoading ? (
                        <div className="px-3 py-2 text-[12px] text-inkmuted">Searching barcodes...</div>
                      ) : barcodeOptionsError ? (
                        <div className="px-3 py-2 text-[12px] text-danger" role="alert">{barcodeOptionsError}</div>
                      ) : barcodeOptions.length ? (
                        barcodeOptions.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className="block w-full border-b border-line px-3 py-2 text-left text-[12px] text-ink hover:bg-slate-50"
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectBarcode(option)}
                          >
                            {option.label}
                          </button>
                        ))
                      ) : (
                        <div className="px-3 py-2 text-[12px] text-inkmuted">
                          {barcodeInput.trim() ? 'No matching barcodes.' : 'No barcodes found for this business.'}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {barcodeLoading && <div className="mt-0.5 text-[12px] text-inkmuted">Looking up barcode...</div>}
                {barcodeError && <div className="mt-0.5 text-[12px] text-danger">{barcodeError}</div>}
                {lookupNotice && !barcodeError && (
                  <div className="mt-0.5 text-[12px] text-inkmuted">{lookupNotice}</div>
                )}
              </div>
              <div>
                <label className="f-label">Item Code</label>
                <input className="f-input" value={itemDetails?.itemCode || ''} readOnly />
              </div>
              <div>
                <label className="f-label">Group</label>
                <input className="f-input" value={itemDetails?.group || ''} readOnly />
              </div>
              <div>
                <label className="f-label">E-Comm Off (%)</label>
                <input
                  className="f-input"
                  type="number"
                  value={data.ecommOffPercent ?? ''}
                  onWheel={(event) => event.currentTarget.blur()}
                  onChange={(event) => set('ecommOffPercent', event.target.value)}
                />
              </div>
              <div>
                <label className="f-label">Price</label>
                <input
                  className="f-input"
                  type="number"
                  value={data.barcodePriceOverride ?? ''}
                  onWheel={(event) => event.currentTarget.blur()}
                  onChange={(event) => set('barcodePriceOverride', event.target.value)}
                />
              </div>
              <div>
                <label className="f-label">HSN Code</label>
                <input className="f-input" value={itemDetails?.hsnCode || ''} readOnly />
              </div>
              <div>
                <label className="f-label">Quantity</label>
                <input
                  className="f-input"
                  type="number"
                  value={data.barcodeQtyOverride ?? ''}
                  onWheel={(event) => event.currentTarget.blur()}
                  onChange={(event) => set('barcodeQtyOverride', event.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
              {ordered.map((f) => (
                <div key={f.k} className={wide(f) ? 'md:col-span-3' : undefined}>
                  {kindOf(f) !== 'boolean' && kindOf(f) !== 'classification' && (
                    <label className="f-label">
                      {f.k === 'itemId' ? 'Item' : fieldLabel(f.k)}
                      {(f.k === 'itemId' || f.k === 'displayName') && <span className="text-danger"> *</span>}
                    </label>
                  )}
                  {input(f)}
                  {errors[f.k] && <div className="mt-0.5 text-[12px] text-danger">{errors[f.k]}</div>}
                </div>
              ))}
            </div>
            {/* Real product photos for this one product. Uploads are stored by
                the ERP gallery endpoint and saved into additionalImages + the
                `image` primary field, which the Save below persists. */}
            {(resolvedBarcode || barcodeInput).trim().toUpperCase() !== '4A1085' && (
              <ProductGalleryManager
                sku={(resolvedBarcode || barcodeInput).trim()}
                primary={String(data.image || '')}
                images={Array.isArray(data.additionalImages) ? data.additionalImages : []}
                onPrimaryChange={(url) => set('image', url)}
                onImagesChange={(urls) => set('additionalImages', urls)}
              />
            )}
            {classificationFields.length > 0 && (
              <section className="mt-4 rounded border border-line bg-slate-50 p-3" aria-live="polite">
                <h2 className="text-[12px] font-bold uppercase tracking-wide text-ink">
                  Selected Filters
                </h2>
                {classificationOptionsLoading ? (
                  <p className="mt-1 text-[12px] text-inkmuted">Loading selected filters...</p>
                ) : classificationOptionsError ? (
                  <p className="mt-1 text-[12px] text-danger" role="alert">
                    {classificationOptionsError}
                  </p>
                ) : selectedFilterSummary.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedFilterSummary.map(({ label, names }) => (
                      <span key={label} className="rounded bg-white px-2 py-1 text-[12px] text-ink">
                        <strong>{label}:</strong> {names.join(', ')}
                      </span>
                    ))}
                  </div>
                ) : hasSelectedFilters ? (
                  <p className="mt-1 text-[12px] text-inkmuted">
                    Selected filter names are unavailable.
                  </p>
                ) : (
                  <p className="mt-1 text-[12px] text-inkmuted">No filters selected.</p>
                )}
              </section>
            )}
            <div className="mt-4 rounded border border-line bg-slate-50 p-3">
              <label className="flex cursor-pointer items-start gap-2">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={Boolean(data.isPublished)}
                  onChange={(event) => togglePublished(event.target.checked)}
                />
                <span>
                  <span className="text-[13px] font-semibold text-ink">Show in E-commerce</span>
                  <span className="block text-[12px] text-inkmuted">
                    Ticked, this product appears on the website in its Product Type group. Saving also makes it active.
                  </span>
                </span>
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => router.push('/admin/ecommerce/product-eccom')}>Cancel</button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving || barcodeLoading || !data.itemId || (Boolean(barcodeInput.trim()) && !resolvedBarcode)}
                onClick={save}
              >
                {saving ? <span className="spin" /> : <Icon name="save" size={14} />}
                {productMatch?.ownsBarcode === false ? ' Save visibility' : ' Save'}
              </button>
            </div>
            </>
          )}
        </div>
      </div>
      {imageHovered && data.image && (
        <div className="pointer-events-none fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-6">
          <img
            src={data.image}
            alt="Product image preview"
            className="max-h-[80vh] max-w-[80vw] rounded border border-white/30 bg-white object-contain shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
