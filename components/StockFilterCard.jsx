'use client';
import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon';
import MultiSelect from './MultiSelect';
import { useOptions } from './useOptions';
import { useScope } from './ScopeContext';

/* The grouped filter card shared by the Master Stock Report and the
   E-commerce Product listing.

   Both screens render exactly this component: the same scope row (Company +
   Location + date range), the same coloured collapsible sections, the same field
   controls, the same right-aligned per-section Clear, and the same
   Reset Filters / Search actions. A screen supplies the specs and owns the
   draft values; this card owns only the presentation and the option lists.

   A field entry is either a filter key or { label, range: [minKey, maxKey] },
   which draws one label over a Start / End pair. `location` fields are drawn
   once in the scope row from the same useScope().locations list the top bar
   uses - never from a second location master. Company uses the top bar's own
   business list and updates that same global branch. */

const GROUP_LABEL = 'stock-filter-label';

/* A ref filter needs its own option list, so it is its own component -
   useOptions is a hook and cannot run inside a map. */
function RefField({ f, value, onChange, waiting, params, hint = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const { options, loading, error } = useOptions(f.ref, searchTerm, !waiting, params);
  const uniqueOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    for (const option of options) {
      if (!option?.label || typeof option.label !== 'string') continue;
      const trimmed = option.label.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...option, label: trimmed });
    }
    return out;
  }, [options]);
  const merged = hint.length
    ? uniqueOptions.concat(hint.filter((h) => !uniqueOptions.some((o) => o.value === h.value)))
    : uniqueOptions;
  return (
    <MultiSelect
      mode={f.multi ? 'multi' : 'single'}
      /* A picker waiting for its city shows nothing to pick from - but a
         value the barcode lookup already gave it still has to read as a
         name. */
      options={waiting ? hint : merged}
      loading={loading}
      error={error}
      disabled={waiting && !hint.length}
      value={f.multi ? (Array.isArray(value) ? value : value ? [value] : []) : value || ''}
      placeholder={waiting ? (f.waitPlaceholder || 'Select...') : (f.all || 'Select...')}
      maxOptions={f.showAllOptions ? Infinity : undefined}
      onSearch={setSearchTerm}
      onChange={onChange}
    />
  );
}

/* A free-text city with suggestions from the canonical city master. Picking a
   suggestion only completes the spelling - the typed text is the value, which
   is what the API matches against the supplier's billing or shipping city. */
function CityField({ f, value, onChange, business }) {
  const term = String(value || '');
  const [open, setOpen] = useState(false);
  const [cities, setCities] = useState([]);

  useEffect(() => {
    let off = false;
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ q: term, business: business || '' });
      fetch((f.suggest || '/api/cities') + '?' + qs, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (!off) setCities(Array.isArray(d.options) ? d.options : []); })
        .catch(() => { if (!off) setCities([]); });
    }, 200);
    return () => { off = true; clearTimeout(timer); };
  }, [f.suggest, term, business]);

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

/* Several typed values, each kept as a chip - used for barcode numbers, of
   which there is one per piece of stock. Enter or a comma commits what has
   been typed; Backspace on an empty box takes the last one back off. */
function TagsField({ f, value, onChange, business }) {
  const [term, setTerm] = useState('');
  const [hits, setHits] = useState([]);
  const [open, setOpen] = useState(false);
  const chips = Array.isArray(value) ? value : (value ? [value] : []);

  useEffect(() => {
    if (!f.suggest) return undefined;
    const q = term.trim();
    if (!q) { setHits([]); return undefined; }

    let off = false;
    const timer = setTimeout(() => {
      const qs = new URLSearchParams({ q, business: business || '' });
      fetch(f.suggest + '?' + qs, { cache: 'no-store' })
        .then((r) => r.json())
        .then((d) => { if (!off) { setHits(d.options || []); setOpen(true); } })
        .catch(() => { if (!off) setHits([]); });
    }, 250);

    return () => { off = true; clearTimeout(timer); };
  }, [f.suggest, term, business]);

  const commit = (raw) => {
    const parts = String(raw).split(',').map((v) => v.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...chips];
    parts.forEach((p) => { if (!next.some((c) => c.toLowerCase() === p.toLowerCase())) next.push(p); });
    onChange(next);
    setTerm('');
  };

  const choices = hits.filter((h) => !chips.some((c) => c.toLowerCase() === String(h.value).toLowerCase()));

  return (
    <div className="relative">
      <div className="f-input stock-filter-tags flex flex-wrap items-center gap-1 !h-auto py-1">
        {chips.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded bg-pillgrey px-1.5 py-0.5 text-[12px]">
            {c}
            <button
              type="button"
              aria-label={'Remove ' + c}
              className="text-inkmuted hover:text-danger"
              onClick={() => onChange(chips.filter((x) => x !== c))}
            >
              <Icon name="x" size={10} />
            </button>
          </span>
        ))}
        <input
          className="min-w-[90px] flex-1 border-0 bg-transparent p-0 text-[13px] outline-none"
          placeholder={chips.length ? '' : (f.placeholder || '')}
          value={term}
          onChange={(e) => {
            const v = e.target.value;
            if (v.includes(',')) commit(v);
            else setTerm(v);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(term); }
            if (e.key === 'Backspace' && !term && chips.length) onChange(chips.slice(0, -1));
          }}
          onBlur={() => { commit(term); setOpen(false); }}
          onFocus={() => { if (choices.length) setOpen(true); }}
        />
      </div>

      {open && choices.length > 0 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 overflow-auto rounded border border-line bg-white shadow-lg">
          {choices.map((h) => (
            <button
              key={h.value}
              type="button"
              className="block w-full border-b border-line px-2 py-1.5 text-left text-[12.5px] last:border-b-0 hover:bg-[#f4f7fb]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { commit(h.value); setOpen(false); }}
            >
              {h.label || h.value}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ f, value, onChange, draft, hint, business }) {
  if (f.type === 'tags') return <TagsField f={f} value={value} onChange={onChange} business={business} />;
  if (f.type === 'city') return <CityField f={f} value={value} onChange={onChange} business={business} />;
  if (f.type === 'ref') {
    const waiting = Boolean(f.dependsOn) && !String(draft[f.dependsOn] || '').trim();
    const params = {};
    if (f.dependsOn && !waiting) params[f.dependsParam || f.dependsOn] = String(draft[f.dependsOn]).trim();
    Object.entries(f.optionsFrom || {}).forEach(([param, key]) => {
      const optionValue = draft[key];
      if (optionValue !== undefined && optionValue !== null && String(optionValue).trim()) {
        params[param] = String(optionValue).trim();
      }
    });
    return (
      <RefField
        f={f}
        value={value}
        onChange={onChange}
        waiting={waiting}
        params={Object.keys(params).length ? params : null}
        hint={hint}
      />
    );
  }
  if (f.type === 'select') {
    return (
      <select className="f-input" value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {!f.req && <option value="">{f.all || 'Select...'}</option>}
        {(f.opts || []).map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    );
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

/* every key an entry touches - used by a section's Clear */
const keysOf = (entries) => (entries || []).flatMap((entry) => {
  if (typeof entry === 'string') return [entry];
  if (entry.range) return entry.range;
  return entry.k ? [entry.k] : [];
});

/* Fields that need a little more room than the default grid cell. */
const WIDE_FIELDS = new Set([
  'barcodeNo', 'groupName', 'itemId', 'city', 'supplierId', 'agentId',
]);

export default function StockFilterCard({
  filters = [],
  groups = [],
  headerDates = [],
  draft = {},
  onChange,
  onClear,
  onReset,
  onSearch,
  loading = false,
  business = '',
  title = 'Filter',
  messages = null,
  hint = '',
  toolbar = null,
  beforeGroups = null,
  className = '',
}) {
  const {
    businesses,
    locations,
    business: scopeBusiness,
    businessReady,
    locationReady,
  } = useScope();
  const [folded, setFolded] = useState({});
  const byKey = useMemo(() => new Map(filters.map((f) => [f.k, f])), [filters]);
  const locationField = filters.find((f) => f.type === 'location');
  const [fromK, toK] = headerDates || [];
  const hasScopeRow = Boolean(locationField || fromK);

  /* The Location choices are the top bar's own list - useScope already holds
     /api/options?ref=companylocations for this business. An empty value is the
     "All Locations" choice and leaves the query unrestricted. */
  const locationOptions = useMemo(() => {
    if (!locationField) return [];
    const seen = new Set();
    const out = [];
    const add = (option) => {
      const value = String(option?.value ?? '');
      if (seen.has(value)) return;
      seen.add(value);
      out.push({
        value,
        label: String(option?.label || '').trim() || (value ? value : 'All Locations'),
      });
    };
    add({ value: '', label: locationField.all || 'All Locations' });
    (locations || []).forEach(add);
    return out;
  }, [locations, locationField]);

  /* Company is shown from the top bar's branch selection (read-only here)
     so users can see both Company and Location in the filter scope without
     a second control interfering with top-nav behavior. */
  const companyOptions = useMemo(() => {
    const seen = new Set();
    const out = [];
    (businesses || []).forEach((option) => {
      const value = String(option?.value ?? '');
      if (!value || seen.has(value)) return;
      seen.add(value);
      out.push({
        value,
        label: String(option?.label || '').trim() || value,
      });
    });
    return out;
  }, [businesses]);

  /* Company is shown read-only here and controlled by the top bar, so the
     top bar remains the single place that changes branch/location scope. */

  return (
    <div className={'card stock-filter-card ' + className}>
      <div className="card-head stock-filter-head">
        <span className="card-title"><Icon name="filter" size={15} /> {title}</span>
        <span className="flex-1" />
        <div className="stock-filter-head-actions">
          {toolbar}
          <button type="button" className="btn stock-filter-reset" onClick={onReset} disabled={loading}>
            <Icon name="refresh" size={14} /> Reset Filters
          </button>
          <button
            type="button"
            className="btn btn-primary stock-filter-search"
            onClick={onSearch}
            disabled={loading}
          >
            {loading ? <span className="spin" /> : <Icon name="search" size={14} />} Search
          </button>
        </div>
      </div>

      <div className="card-body stock-filter-body">
        {messages}

        {hasScopeRow && (
          <div className="stock-filter-scope">
            {locationField && (
              <div className="stock-filter-scope-company">
                <label className={GROUP_LABEL}>Company</label>
                <div
                  className="f-input stock-filter-scope-readonly"
                  title={companyOptions.find((o) => o.value === scopeBusiness)?.label || ''}
                >
                  {!businessReady
                    ? 'Loading...'
                    : companyOptions.find((o) => o.value === scopeBusiness)?.label || 'Select company in top bar'}
                </div>
              </div>
            )}

            {locationField && (
              <div className="stock-filter-scope-location">
                <label className={GROUP_LABEL}>{locationField.label || 'Location'}</label>
                <MultiSelect
                  mode="single"
                  options={locationOptions}
                  loading={!locationReady}
                  disabled={!business}
                  value={draft[locationField.k] || ''}
                  placeholder={locationField.all || 'All Locations'}
                  onChange={(v) => onChange?.(locationField.k, v)}
                />
              </div>
            )}

            {fromK && (
              <div className="stock-filter-scope-dates">
                {[[fromK, 'From Date'], [toK, 'To Date']].filter(([k]) => k).map(([k, label]) => (
                  <div key={k} className="stock-filter-date">
                    <label className={GROUP_LABEL}>{label}</label>
                    <input
                      type="date"
                      className="f-input"
                      value={draft[k] || ''}
                      onChange={(e) => onChange?.(k, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {beforeGroups}

        {groups.map((g) => {
          const shut = Boolean(folded[g.title]);
          const keys = keysOf(g.fields);
          return (
            <div
              key={g.title}
              className="stock-filter-group"
              style={{ borderLeftColor: g.color }}
            >
              <div
                className="stock-filter-group-head"
                style={{ backgroundColor: g.color + '0d' }}
              >
                <span
                  className="stock-filter-group-icon"
                  style={{ backgroundColor: g.color + '22', color: g.color }}
                >
                  <Icon name={g.icon || 'filter'} size={13} />
                </span>
                <span className="stock-filter-group-title">{g.title}</span>
                <span className="flex-1" />
                <button
                  type="button"
                  className="stock-filter-head-clear"
                  title={'Clear ' + g.title}
                  onClick={(e) => { e.stopPropagation(); onClear?.(keys); }}
                >
                  <Icon name="refresh" size={11} /> Clear
                </button>
                <button
                  type="button"
                  aria-label={(shut ? 'Expand ' : 'Collapse ') + g.title}
                  className="stock-filter-fold"
                  onClick={() => setFolded((o) => ({ ...o, [g.title]: !shut }))}
                >
                  <Icon name={shut ? 'plus' : 'minus'} size={12} />
                </button>
              </div>

              {!shut && (
                <div className={`stock-filter-fields${g.cols ? ` stock-filter-cols-${g.cols}` : ''}`}>
                  {(g.fields || []).map((entry) => {
                    if (typeof entry === 'string' || !entry.range) {
                      const f = byKey.get(typeof entry === 'string' ? entry : entry.k);
                      if (!f || f.type === 'location') return null;
                      return (
                        <div
                          key={f.k}
                          className={'stock-filter-field'
                            + (WIDE_FIELDS.has(f.k) ? ' stock-filter-field-wide' : '')}
                        >
                          <label className={GROUP_LABEL}>
                            {f.label}{(f.req || f.oneOf) && <span className="f-req">*</span>}
                          </label>
                          <Field
                            f={f}
                            value={draft[f.k]}
                            onChange={(v) => onChange?.(f.k, v)}
                            draft={draft}
                            business={business}
                          />
                        </div>
                      );
                    }
                    const [lo, hi] = entry.range;
                    return (
                      <div key={lo} className="stock-filter-field stock-filter-field-range">
                        <label className={GROUP_LABEL}>{entry.label}</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            className="f-input min-w-0 flex-1"
                            placeholder="Start"
                            value={draft[lo] || ''}
                            onChange={(e) => onChange?.(lo, e.target.value)}
                          />
                          <input
                            type="text"
                            className="f-input min-w-0 flex-1"
                            placeholder="End"
                            value={draft[hi] || ''}
                            onChange={(e) => onChange?.(hi, e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {hint && <div className="stock-filter-hint">{hint}</div>}
      </div>
    </div>
  );
}
