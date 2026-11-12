'use client';
import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import MultiSelect from './MultiSelect';
import { filterDefaults } from './FilterPanel';
import { useOptions } from './useOptions';
import { useScope } from './ScopeContext';

/* The filter card on Ecommerce -> Product, drawn the way the Master Stock
   Report draws its own: one collapsible bordered section per filter group
   (Basic, Supplier & Inventory, Price, Barcode Pattern), each with its own
   Clear, plus one Reset Filters for the whole card.

   The card owns only the boxes. The APPLIED filters live in ListviewEccom,
   which sends them to /api/product-eccom - so Clear and Reset re-run the
   list immediately instead of leaving a cleared box in front of stale rows.

   A field entry is either a filter key or { label, range: [minKey, maxKey] },
   which puts one label over a Start / End pair. ref fields load their choices
   from /api/options; a field with `dependsOn` stays disabled until that box
   has a value (the supplier and agent pickers wait for the city). */

/* A group is one compact row: its controls, then its Clear, in the same flow.
   The label sits directly on top of its control and the row's items are
   bottom-aligned, so every input, dropdown and the Clear share one baseline.
   ROW_WIDTH is what makes that true for the Price group: its six Start/End
   pairs are wider than one row, so it wraps to a second line and the Clear
   lands there with the remaining controls rather than in a block underneath. */
const GROUP_LABEL = 'mb-0.5 block text-[11px] font-semibold uppercase tracking-wide text-[#5d6b83]';
const ROW_WIDTH = 1120;
const TEXT_FIELD = 'w-[150px] shrink-0';
const RANGE_FIELD = 'w-[210px] shrink-0';

/* `hint` is the (value, label) of a reference the barcode lookup just wrote:
   the record's own name, so a filled picker reads as a name instead of the raw
   id it would fall back to when the id is not in the first options page. */
function RefField({ f, value, onChange, waiting, params, hint = [] }) {
  const { options, loading, error } = useOptions(f.ref, '', !waiting, params);
  const merged = hint.length
    ? options.concat(hint.filter((h) => !options.some((o) => o.value === h.value)))
    : options;
  return (
    <MultiSelect
      mode={f.multi ? 'multi' : 'single'}
      /* a picker waiting for its city shows nothing to pick from - but a value
         the barcode lookup already gave it still has to read as a name */
      options={waiting ? hint : merged}
      loading={loading}
      error={error}
      disabled={waiting && !hint.length}
      value={f.multi ? (Array.isArray(value) ? value : value ? [value] : []) : value || ''}
      placeholder={waiting ? (f.waitPlaceholder || 'Select...') : (f.all || 'Select...')}
      maxOptions={f.showAllOptions ? Infinity : undefined}
      onChange={onChange}
    />
  );
}

/* A free-text city with suggestions from the canonical city master. Picking a
   suggestion only completes the spelling - the typed text is the value, which
   is what /api/product-eccom matches against the supplier's billing or
   shipping city. */
function CityField({ f, value, onChange }) {
  const term = String(value || '');
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState([]);

  useEffect(() => {
    let off = false;
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ q: term });
      fetch('/api/cities?' + qs, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (!off) setCities(Array.isArray(d.options) ? d.options : []); })
        .catch(() => { if (!off) setCities([]); });
    }, 200);
    return () => { off = true; clearTimeout(timer); };
  }, [term]);

  const picks = cities.filter((c) => String(c.value).toLowerCase() !== term.trim().toLowerCase());

  return (
    <div className="relative">
      <input
        className="f-input"
        placeholder={f.placeholder || 'Type city'}
        value={term}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && picks.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded border border-line bg-white shadow-lg">
          {picks.map((c) => (
            <button
              key={c.value}
              type="button"
              className="block w-full border-b border-line px-2 py-1.5 text-left text-[12.5px] last:border-b-0 hover:bg-[#f4f7fb]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(c.value); setOpen(false); }}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ f, value, onChange, draft, hint }) {
  if (f.type === 'city') return <CityField f={f} value={value} onChange={onChange} />;
  if (f.type === 'ref') {
    const waiting = Boolean(f.dependsOn) && !String(draft[f.dependsOn] || '').trim();
    const params = {};
    if (f.dependsOn && !waiting) params[f.dependsParam || f.dependsOn] = String(draft[f.dependsOn]).trim();
    return <RefField f={f} value={value} onChange={onChange} waiting={waiting} params={params} hint={hint} />;
  }
  return (
    <input
      type={f.type === 'date' ? 'date' : 'text'}
      className="f-input"
      placeholder={f.type === 'date' ? '' : f.placeholder || ''}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* every key an entry touches - used by Clear */
const keysOf = (entries) => (entries || []).flatMap((entry) => {
  if (typeof entry === 'string') return [entry];
  if (entry.range) return entry.range;
  return entry.k ? [entry.k] : [];
});

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
  const [folded, setFolded] = useState({});
  /* names for the references the lookup filled - see RefField hint */
  const [hints, setHints] = useState({});
  const [status, setStatus] = useState({ state: 'idle', message: '' });
  const [candidates, setCandidates] = useState([]);
  const byKey = new Map(filters.map((f) => [f.k, f]));
  const [fromK, toK] = headerDates;

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
    setDraft((d) => ({ ...d, [k]: v }));
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

  const clearGroup = (g) => {
    const next = { ...draft };
    const cleared = keysOf(g.fields);
    cleared.forEach((k) => {
      const f = byKey.get(k);
      next[k] = f?.multi ? [] : '';
      typedRef.current.delete(k);
      filledRef.current.delete(k);
    });
    setHints((current) => {
      const rest = { ...current };
      cleared.forEach((k) => delete rest[k]);
      return rest;
    });
    apply(next);
  };

  const reset = () => {
    typedRef.current.clear();
    filledRef.current.clear();
    setHints({});
    setCandidates([]);
    setStatus({ state: 'idle', message: '' });
    apply(filterDefaults(filters));
  };

  return (
    <div className="card mb-3">
      <div className="card-head">
        <span className="card-title"><Icon name="filter" size={15} /> Filter</span>
        <span className="flex-1" />
        <button type="button" className="btn" onClick={reset}>
          <Icon name="refresh" size={14} /> Reset Filters
        </button>
        <button type="button" className="btn btn-primary" onClick={() => onSearch?.(draft)}>
          <Icon name="search" size={14} /> Search
        </button>
      </div>

      <div className="card-body">
        {fromK && (
          <div className="mb-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-2">
            {[[fromK, 'From Date'], [toK, 'To Date']].filter(([k]) => k).map(([k, label]) => (
              <label key={k} className="flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#5d6b83]">
                {label}
                <input type="date" className="f-input !w-[150px]" value={draft[k] || ''} onChange={(e) => set(k, e.target.value)} />
              </label>
            ))}
          </div>
        )}

        {status.message && (
          <div
            className={'mb-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded border px-2.5 py-1.5 text-[12px] '
              + (STATUS_TONE[status.state] || STATUS_TONE.loading)}
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
        )}

        {groups.map((g) => {
          const shut = Boolean(folded[g.title]);
          return (
            <div key={g.title} className="relative mb-2 rounded-md border border-line" style={{ borderLeft: '4px solid ' + g.color }}>
              <div className="flex items-center gap-2 rounded-tr-md px-3 py-1.5" style={{ backgroundColor: g.color + '0d' }}>
                <span className="flex h-6 w-6 items-center justify-center rounded" style={{ backgroundColor: g.color + '22', color: g.color }}>
                  <Icon name={g.icon || 'filter'} size={13} />
                </span>
                <span className="text-[13px] font-bold uppercase tracking-wide text-ink">{g.title}</span>
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label={(shut ? 'Expand ' : 'Collapse ') + g.title}
                  className="flex h-6 w-6 items-center justify-center rounded border border-line bg-white text-inkmuted hover:text-ink"
                  onClick={() => setFolded((o) => ({ ...o, [g.title]: !shut }))}
                >
                  <Icon name={shut ? 'plus' : 'minus'} size={12} />
                </button>
              </div>

              {!shut && (
                /* No separate Clear row and no tall padding: the fields keep a
                   single line each, wrap naturally when the screen is narrow,
                   and the Clear closes the row it lands on. */
                <div
                  className="flex flex-wrap items-end gap-x-2.5 gap-y-2 px-3 pb-2.5 pt-2"
                  style={{ maxWidth: ROW_WIDTH }}
                >
                  {(g.fields || []).map((entry) => {
                    if (typeof entry === 'string' || !entry.range) {
                      const f = byKey.get(typeof entry === 'string' ? entry : entry.k);
                      if (!f) return null;
                      return (
                        <div key={f.k} className={TEXT_FIELD}>
                          <label className={GROUP_LABEL}>{f.label}</label>
                          <Field f={f} value={draft[f.k]} onChange={(v) => set(f.k, v)} draft={draft} hint={hints[f.k]} />
                        </div>
                      );
                    }
                    const [lo, hi] = entry.range;
                    return (
                      <div key={lo} className={RANGE_FIELD}>
                        <label className={GROUP_LABEL}>{entry.label}</label>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            className="f-input min-w-0 flex-1"
                            placeholder="Start"
                            value={draft[lo] || ''}
                            onChange={(e) => set(lo, e.target.value)}
                          />
                          <input
                            type="text"
                            className="f-input min-w-0 flex-1"
                            placeholder="End"
                            value={draft[hi] || ''}
                            onChange={(e) => set(hi, e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="btn !h-9 shrink-0"
                    title={'Clear ' + g.title}
                    onClick={() => clearGroup(g)}
                  >
                    <Icon name="refresh" size={13} /> Clear
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
