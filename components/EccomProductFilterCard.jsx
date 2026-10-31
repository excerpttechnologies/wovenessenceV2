'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import MultiSelect from './MultiSelect';
import { filterDefaults } from './FilterPanel';
import { useOptions } from './useOptions';

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

const GROUP_LABEL = 'mb-0.5 block text-[10.5px] font-semibold uppercase tracking-wide text-[#5d6b83] leading-none';

function RefField({ f, value, onChange, waiting, params }) {
  const { options, loading, error } = useOptions(f.ref, '', !waiting, params);
  return (
    <MultiSelect
      mode={f.multi ? 'multi' : 'single'}
      options={waiting ? [] : options}
      loading={loading}
      error={error}
      disabled={waiting}
      className="!min-h-[30px] !h-[30px] !py-0 !text-[12.5px]"
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
        className="f-input !h-[30px] !py-0 text-[12.5px]"
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

function Field({ f, value, onChange, draft }) {
  if (f.type === 'city') return <CityField f={f} value={value} onChange={onChange} />;
  if (f.type === 'ref') {
    const waiting = Boolean(f.dependsOn) && !String(draft[f.dependsOn] || '').trim();
    const params = {};
    if (f.dependsOn && !waiting) params[f.dependsParam || f.dependsOn] = String(draft[f.dependsOn]).trim();
    return <RefField f={f} value={value} onChange={onChange} waiting={waiting} params={params} />;
  }
  return (
    <input
      type={f.type === 'date' ? 'date' : 'text'}
      className="f-input !h-[30px] !py-0 text-[12.5px]"
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

export default function EccomProductFilterCard({
  filters = [],
  groups = [],
  headerDates = [],
  onSearch,
}) {
  const [draft, setDraft] = useState(() => filterDefaults(filters));
  const [folded, setFolded] = useState({});
  const byKey = new Map(filters.map((f) => [f.k, f]));
  const [fromK, toK] = headerDates;

  const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));
  const apply = (next) => { setDraft(next); onSearch?.(next); };

  const clearGroup = (g) => {
    const next = { ...draft };
    keysOf(g.fields).forEach((k) => {
      const f = byKey.get(k);
      next[k] = f?.multi ? [] : '';
    });
    apply(next);
  };

  const reset = () => apply(filterDefaults(filters));

  return (
    <div className="card mb-1.5">
      <div className="card-head !py-1 !px-3">
        <span className="card-title text-[13px]"><Icon name="filter" size={13} /> Filter</span>
        <span className="flex-1" />
        <button type="button" className="btn !h-[26px] !py-0 !px-2.5 !text-[11.5px]" onClick={reset}>
          <Icon name="refresh" size={12} /> Reset Filters
        </button>
        <button type="button" className="btn btn-primary !h-[26px] !py-0 !px-2.5 !text-[11.5px]" onClick={() => onSearch?.(draft)}>
          <Icon name="search" size={12} /> Search
        </button>
      </div>

      <div className="card-body !py-1.5 !px-2.5">
        {fromK && (
          <div className="mb-1.5 flex flex-wrap items-center justify-end gap-x-3 gap-y-0.5">
            {[[fromK, 'From Date'], [toK, 'To Date']].filter(([k]) => k).map(([k, label]) => (
              <label key={k} className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-[#5d6b83]">
                {label}
                <input type="date" className="f-input !h-[30px] !py-0 !w-[130px] text-[12px]" value={draft[k] || ''} onChange={(e) => set(k, e.target.value)} />
              </label>
            ))}
          </div>
        )}

        {groups.map((g) => {
          const shut = Boolean(folded[g.title]);
          return (
            <div key={g.title} className="relative mb-1.5 rounded-md border border-line last:mb-0" style={{ borderLeft: '4px solid ' + g.color }}>
              <div className="flex items-center gap-2 rounded-tr-md px-2.5 py-0.5" style={{ backgroundColor: g.color + '0d' }}>
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded" style={{ backgroundColor: g.color + '22', color: g.color }}>
                  <Icon name={g.icon || 'filter'} size={11} />
                </span>
                <span className="text-[11.5px] font-bold uppercase tracking-wide text-ink">{g.title}</span>
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label={(shut ? 'Expand ' : 'Collapse ') + g.title}
                  className="flex h-[18px] w-[18px] items-center justify-center rounded border border-line bg-white text-inkmuted hover:text-ink"
                  onClick={() => setFolded((o) => ({ ...o, [g.title]: !shut }))}
                >
                  <Icon name={shut ? 'plus' : 'minus'} size={9} />
                </button>
              </div>

              {!shut && (
                <>
                  <div className="flex flex-wrap items-start gap-x-3.5 gap-y-1 px-2.5 pb-1 pt-1">
                    {(g.fields || []).map((entry) => {
                      if (typeof entry === 'string' || !entry.range) {
                        const f = byKey.get(typeof entry === 'string' ? entry : entry.k);
                        if (!f) return null;
                        return (
                          <div key={f.k} className="w-full max-w-[190px]">
                            <label className={GROUP_LABEL}>{f.label}</label>
                            <Field f={f} value={draft[f.k]} onChange={(v) => set(f.k, v)} draft={draft} />
                          </div>
                        );
                      }
                      const [lo, hi] = entry.range;
                      return (
                        <div key={lo} className="w-full max-w-[190px]">
                          <label className={GROUP_LABEL}>{entry.label}</label>
                          <div className="flex gap-1.5">
                            <input
                              type="text"
                              className="f-input !h-[30px] !py-0 min-w-0 flex-1 text-[12.5px]"
                              placeholder="Start"
                              value={draft[lo] || ''}
                              onChange={(e) => set(lo, e.target.value)}
                            />
                            <input
                              type="text"
                              className="f-input !h-[30px] !py-0 min-w-0 flex-1 text-[12.5px]"
                              placeholder="End"
                              value={draft[hi] || ''}
                              onChange={(e) => set(hi, e.target.value)}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-end px-2.5 pb-1 pt-0">
                    <button type="button" className="btn !h-[22px] !py-0 !px-2 !text-[10.5px]" onClick={() => clearGroup(g)}>
                      <Icon name="refresh" size={10} /> Clear
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
