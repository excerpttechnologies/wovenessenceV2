'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import StockFilterCard from './StockFilterCard';
import { filterDefaults } from './FilterPanel';
import { useScope } from './ScopeContext';

/* The filter card on Ecommerce -> Product.

   The card itself is StockFilterCard - the same component the Master Stock
   Report renders - so both screens have the same scope row (Company +
   Location + date range), section order, Clear placement, typography and
   actions.

   This wrapper owns only what is specific to this screen: the draft values
   and the barcode lookup that fills the Supplier & Inventory and Price boxes
   from one scanned code. The APPLIED filters live in ListviewEccom, which
   sends them to /api/product-eccom. Search applies the draft; a section's
   Clear blanks only that section; Reset Filters blanks every box, Location
   included, and re-runs the list. */

/* what the barcode lookup is allowed to write - the barcode box itself is the
   trigger and is never rewritten by it */
const PROFILE_KEYS = [
  'groupName', 'itemId', 'hsn', 'gst',
  'city', 'supplierId', 'agentId', 'uom',
  'rspMin', 'rspMax', 'rspOfferPriceMin', 'rspOfferPriceMax',
  'wspMin', 'wspMax', 'ecomMin', 'ecomMax',
  'ageMin', 'ageMax', 'costPriceMin', 'costPriceMax', 'discount',
  'patternSupplierNo', 'patternGrcNo', 'patternSlNo', 'patternQty',
];
/* the pickers among them, whose label has to travel with the id */
const LABELLED = ['groupName', 'itemId', 'supplierId', 'agentId', 'uom'];

const STATUS_TONE = {
  loading: 'border-line bg-[#f7f9fc] text-inkmuted',
  success: 'border-[#bbf7d0] bg-[#f0fdf4] text-[#15803d]',
  choose: 'border-[#fde68a] bg-[#fffbeb] text-[#92400e]',
  error: 'border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]',
};

export default function EccomProductFilterCard({
  filters = [],
  groups = [],
  headerDates = [],
  onSearch,
}) {
  const { business } = useScope();
  const [draft, setDraft] = useState(() => filterDefaults(filters));
  /* names for the references the lookup filled - see StockFilterCard's
     RefField hint */
  const [hints, setHints] = useState({});
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const [candidates, setCandidates] = useState([]);
  const byKey = useMemo(() => new Map(filters.map((f) => [f.k, f])), [filters]);

  /* `typed` holds the keys the operator changed by hand and `filled` the ones
     the barcode lookup wrote. The next barcode clears exactly its own values,
     never the operator's, so nothing typed is thrown away unasked. */
  const draftRef = useRef(draft);
  const typedRef = useRef(new Set());
  const filledRef = useRef(new Set());
  useEffect(() => { draftRef.current = draft; }, [draft]);

  const set = (k, v) => {
    typedRef.current.add(k);
    filledRef.current.delete(k);
    const dependents = (filters || [])
      .filter((f) => f.dependsOn === k)
      .map((f) => f.k);
    dependents.forEach((key) => {
      typedRef.current.delete(key);
      filledRef.current.delete(key);
    });
    setDraft((d) => {
      const next = { ...d, [k]: v };
      dependents.forEach((key) => {
        const f = byKey.get(key);
        next[key] = f?.multi ? [] : '';
      });
      return next;
    });
    if (dependents.length) {
      setHints((current) => {
        const rest = { ...current };
        dependents.forEach((key) => delete rest[key]);
        return rest;
      });
    }
  };

  const apply = (next) => { setDraft(next); onSearch?.(next); };

  /* Write one stock record's details into the boxes. `clearFirst` drops what
     the previous barcode filled - which is what makes replacing the barcode
     replace the details instead of adding to them. Passing no candidate only
     clears. */
  const fillFrom = (candidate, { clearFirst = true } = {}) => {
    const values = candidate?.values || {};
    const next = { ...draftRef.current };

    if (clearFirst) {
      filledRef.current.forEach((k) => {
        if (typedRef.current.has(k)) return;
        const f = byKey.get(k);
        if (f) next[k] = f.multi ? [] : '';
      });
      filledRef.current.clear();
    }
    if (!candidate) {
      draftRef.current = next;
      setHints({});
      setDraft(next);
      return;
    }

    let filled = 0;
    let kept = 0;
    const nextHints = {};
    PROFILE_KEYS.forEach((k) => {
      const f = byKey.get(k);
      if (!f) return;
      if (typedRef.current.has(k)) {
        const current = draftRef.current[k];
        if (!(Array.isArray(current) ? current.length : String(current ?? '').trim())) return;
        kept += 1;
        return;
      }
      const value = values[k];
      const missing = Array.isArray(value)
        ? value.length === 0
        : !String(value ?? '').trim();
      if (missing) {
        next[k] = f.multi ? [] : '';
        return;
      }
      next[k] = value;
      filledRef.current.add(k);
      filled += 1;
      if (LABELLED.includes(k)) {
        const ids = Array.isArray(value) ? value : [value];
        const names = Array.isArray(candidate.labels?.[k]) ? candidate.labels[k] : [];
        nextHints[k] = ids
          .map((id, index) => ({ value: id, label: names[index] || id }))
          .filter((hint) => hint.value);
      }
    });

    draftRef.current = next;
    setHints(nextHints);
    setDraft(next);
    setStatus({
      state: 'success',
      message: [
        'Product details loaded successfully.',
        filled ? `${filled} filter box${filled === 1 ? '' : 'es'} filled.` : 'This barcode has no values the filters use.',
        kept ? `${kept} value${kept === 1 ? '' : 's'} you typed kept as entered.` : '',
      ].filter(Boolean).join(' '),
    });
  };

  const chooseCandidate = (candidate) => {
    setCandidates([]);
    fillFrom(candidate);
  };

  /* The barcode box is the trigger: a short debounce, one request at a time,
     and an aborted request never lands on a newer answer. */
  useEffect(() => {
    /* only a screen whose filters carry the barcode box has anything to fill */
    if (!byKey.has('barcodeNo')) return undefined;
    const value = String(draft.barcodeNo || '').trim();
    if (!business || value.length < 3) {
      if (filledRef.current.size) fillFrom(null);
      setCandidates([]);
      setStatus({ state: 'idle', message: '' });
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setStatus({ state: 'loading', message: `Fetching details for ${value}...` });
      setCandidates([]);
      try {
        const query = new URLSearchParams({ barcodeProfile: value, business });
        const response = await fetch('/api/product-eccom?' + query, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not look up this barcode.');
        const list = Array.isArray(result.candidates) ? result.candidates : [];
        if (!list.length) throw new Error(`No product details found for barcode ${value}.`);
        if (list.length === 1) {
          fillFrom(list[0]);
          return;
        }
        /* several distinct stock records share the barcode - list them so the
           supplier and price are a choice, not an accident of row order */
        fillFrom(null);
        setCandidates(list);
        setStatus({
          state: 'choose',
          message: `${list.length} stock records carry ${value}. Choose one:`,
        });
      } catch (error) {
        if (error.name === 'AbortError') return;
        /* the boxes still describe the PREVIOUS barcode: drop them, so an
           unknown code is never shown next to another product's price or
           supplier */
        if (filledRef.current.size) fillFrom(null);
        setStatus({ state: 'error', message: error.message || 'Could not look up this barcode.' });
      }
    }, 400);

    return () => { controller.abort(); clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.barcodeNo, business]);

  /* A section's Clear blanks only its own keys. Any filter that depends on
     one of those keys goes too, so clearing City cannot leave a Supplier
     picked for the old city behind. The values stay in the draft until
     Search is pressed, the same as typing into a box does. */
  const clearGroup = (keys) => {
    const drop = new Set(keys);
    (filters || []).forEach((f) => {
      if (drop.has(f.dependsOn)) drop.add(f.k);
    });
    drop.forEach((key) => {
      typedRef.current.delete(key);
      filledRef.current.delete(key);
    });
    setDraft((d) => {
      const next = { ...d };
      drop.forEach((key) => {
        const f = byKey.get(key);
        next[key] = f?.multi ? [] : '';
      });
      return next;
    });
    setHints((current) => {
      const rest = { ...current };
      drop.forEach((key) => delete rest[key]);
      return rest;
    });
  };

  const reset = () => {
    typedRef.current.clear();
    filledRef.current.clear();
    setHints({});
    setCandidates([]);
    setStatus({ state: 'idle', message: '' });
    apply(filterDefaults(filters));
  };

  const notice = status.message ? (
    <div
      className={'stock-filter-notice ' + (STATUS_TONE[status.state] || STATUS_TONE.loading)}
      role="status"
      aria-live="polite"
    >
      {status.state === 'loading'
        ? <span className="h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
        : <Icon name={status.state === 'error' ? 'x' : status.state === 'success' ? 'check' : 'barcode'} size={13} />}
      <span className="font-semibold">{status.message}</span>
      {candidates.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          className="btn !h-7 !px-2 !text-[11.5px]"
          title={candidate.label}
          onClick={() => chooseCandidate(candidate)}
        >
          {candidate.label || 'Stock record'}
        </button>
      ))}
    </div>
  ) : null;

  return (
    <StockFilterCard
      title="Filter"
      filters={filters}
      groups={groups}
      headerDates={headerDates}
      draft={draft}
      onChange={set}
      onClear={clearGroup}
      onReset={reset}
      onSearch={() => apply(draft)}
      business={business}
      beforeGroups={notice}
    />
  );
}
