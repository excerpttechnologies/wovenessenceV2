'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';
import StockFilterCard from './StockFilterCard';
import { filterDefaults } from './FilterPanel';
import { useScope } from './ScopeContext';

/* The filter card on Ecommerce -> Product.

   The card itself is StockFilterCard - the same component the Master Stock
   Report renders - so both screens have the same scope row (Company +
   Location + date range), section order, Clear placement, typography, field
   controls and actions. The Barcode Number field is the Master Stock Report's
   own multi-barcode search (StockFilterCard's `tags` field): type or scan a
   number, pick from the suggestions, press Enter, and repeat - every chosen
   barcode stays as a chip and the list answers ANY of them.

   COMPANY AND LOCATION ARE ONE CONTEXT, not two. The Company is the top
   bar's branch (ScopeContext), which already reloads the location list and
   every option list when it changes. The Location dropdown in the card's
   scope row is that same context: it is seeded from the top bar's location,
   follows it when the top bar moves, and a pick in the card is applied to the
   list at once. There is no second location master - the choices are
   useScope().locations, exactly the ones the top bar and the Master Stock
   Report use.

   This wrapper owns only the draft values. The APPLIED filters live in
   ListviewEccom, which sends them straight to /api/product-eccom as
   `business` + `locationFilter`, so the company/location context reaches the
   query and not just the screen. Search applies the draft; a section's Clear
   blanks only that section; Reset Filters returns every box to the screen's
   defaults - the company's current location included - and re-runs the
   list. */

/* Filters whose value NAMES a record of the company's masters (supplier,
   agent, group, item, UOM, city). A pick made under one company/location can
   point at a record the new one does not have, so these are blanked when the
   context moves rather than left to narrow the list in silence. Typed values
   (barcode, HSN, GST, price ranges, dates) are not tied to a location and
   stay. */
const SCOPE_BOUND_TYPES = new Set(['ref', 'city']);

export default function EccomProductFilterCard({
  filters = [],
  groups = [],
  headerDates = [],
  onSearch,
  loading = false,
}) {
  const { business, location: scopeLocation, locationReady, setLocation } = useScope();
  const [selectedCompany, setSelectedCompany] = useState(business || '');
  const [companyLocations, setCompanyLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLocationsLoading(true);
    const url = selectedCompany
      ? '/api/options?ref=companylocations&business=' + encodeURIComponent(selectedCompany)
      : '/api/options?ref=companylocations';
    fetch(url, { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setCompanyLocations(Array.isArray(d.options) ? d.options : []);
      })
      .catch(() => {
        if (!cancelled) setCompanyLocations([]);
      })
      .finally(() => {
        if (!cancelled) setLocationsLoading(false);
      });
    return () => { cancelled = true; };
  }, [selectedCompany]);

  const customLocationOptions = useMemo(() => {
    const seen = new Set(['']);
    const out = [{ value: '', label: 'All Locations' }];
    (companyLocations || []).forEach((opt) => {
      const val = String(opt?.value ?? '');
      if (seen.has(val)) return;
      seen.add(val);
      out.push({
        value: val,
        label: String(opt?.label || '').trim() || val,
      });
    });
    return out;
  }, [companyLocations]);

  const [draft, setDraft] = useState(() => filterDefaults(filters));
  const byKey = useMemo(() => new Map(filters.map((f) => [f.k, f])), [filters]);
  const locationKey = (filters.find((f) => f.type === 'location') || {}).k || '';

  /* The value every handler reads. A pick is applied in the same turn it is
     made, so reading `draft` state there would be one render behind. */
  const draftRef = useRef(draft);
  const commit = (next) => {
    draftRef.current = next;
    setDraft(next);
    return next;
  };

  const blankValue = (f) => (f && f.multi ? [] : '');

  /* Blank every record pick except the location itself - see
     SCOPE_BOUND_TYPES. */
  const withoutScopeBound = (base) => {
    const next = { ...base };
    filters.forEach((f) => {
      if (f.k !== locationKey && SCOPE_BOUND_TYPES.has(f.type)) next[f.k] = blankValue(f);
    });
    return next;
  };

  /* Setting a filter clears every filter that depends on it: the suppliers
     picked for one city are not a valid pick for another. */
  const set = (k, v) => {
    const f = byKey.get(k);
    const next = { ...draftRef.current, [k]: v };
    filters.forEach((other) => {
      if (other.dependsOn === k) next[other.k] = blankValue(other);
    });
    const locationPick = f && f.type === 'location';
    commit(locationPick ? withoutScopeBound(next) : next);
    /* Location IS the page's data context: moving it reloads the products and
       the option lists at once, instead of leaving the list on the previous
       location until Search is pressed. */
    if (locationPick) {
      if (typeof setLocation === 'function') {
        setLocation(v || '');
      }
      onSearch?.(draftRef.current);
    }
  };

  const apply = (next) => { commit(next); onSearch?.(next); };

  /* The bottom Search button and Enter in a filter box both land here. A
     second identical search while the first is still running is the same
     request, so it is dropped rather than sent again. */
  const lastSearchRef = useRef('');
  const runSearch = () => {
    const next = draftRef.current;
    const signature = JSON.stringify(next);
    if (loading && signature === lastSearchRef.current) return;
    lastSearchRef.current = signature;
    apply(next);
  };

  /* A section's Clear blanks only its own keys. Any filter that depends on
     one of those keys goes too, so clearing City cannot leave a Supplier
     picked for the old city behind. The values stay in the draft until
     Search is pressed, the same as typing into a box does. */
  const clearGroup = (keys) => {
    const drop = new Set(keys);
    filters.forEach((f) => {
      if (drop.has(f.dependsOn)) drop.add(f.k);
    });
    const next = { ...draftRef.current };
    drop.forEach((key) => { next[key] = blankValue(byKey.get(key)); });
    commit(next);
  };

  const reset = () => {
    const next = filterDefaults(filters);
    next.companyFilter = selectedCompany;
    if (locationKey) next[locationKey] = '';
    if (typeof setLocation === 'function') {
      setLocation('');
    }
    apply(next);
  };

  const handleCompanyChange = (newBusinessId) => {
    const val = newBusinessId || '';
    if (val === selectedCompany) return;
    setSelectedCompany(val);
    const next = filterDefaults(filters);
    next.companyFilter = val;
    if (locationKey) next[locationKey] = '';
    if (typeof setLocation === 'function') {
      setLocation('');
    }
    apply(next);
  };

  const lastTopbarBusinessRef = useRef(business);
  useEffect(() => {
    if (lastTopbarBusinessRef.current !== business) {
      lastTopbarBusinessRef.current = business;
      setSelectedCompany(business || '');
      const next = filterDefaults(filters);
      next.companyFilter = business || '';
      if (locationKey) next[locationKey] = '';
      apply(next);
    }
  }, [business]);

  /* Follow the top bar. The Company and its Location are one context, so a
     branch change starts the page's filters from scratch (nothing picked for
     another company is valid here) and a location change adopts that location
     and re-runs the list. Skipped when the draft already agrees, so the first
     render does not fire a second identical request. */
  const previous = useRef(null);

  useEffect(() => {
    if (!locationKey) return undefined;
    /* Wait until the location list belongs to this company: on the render
       right after a company switch `scopeLocation` still names the previous
       company's location, and adopting that would query the new company for a
       location it does not have. */
    if (!locationReady) return undefined;
    const last = previous.current;
    previous.current = { business, location: scopeLocation };

    if (!last) {
      /* first settled scope: adopt the top bar's location unless the screen
         already drafted one (a filter `def` does that on mount) */
      if (scopeLocation && draftRef.current[locationKey] === undefined) {
        onSearch?.(commit({ ...draftRef.current, [locationKey]: scopeLocation }));
      }
      return undefined;
    }
    if (last.business !== business) {
      const next = filterDefaults(filters);
      next[locationKey] = scopeLocation || '';
      onSearch?.(commit(next));
      return undefined;
    }
    if (last.location !== scopeLocation) {
      const next = withoutScopeBound({ ...draftRef.current, [locationKey]: scopeLocation || '' });
      onSearch?.(commit(next));
    }
    return undefined;
  }, [business, scopeLocation, locationReady, locationKey, filters, onSearch]);

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
      onSearch={runSearch}
      onEnter={runSearch}
      loading={loading}
      business={business}
      companyValue={selectedCompany}
      locationOptionsOverride={customLocationOptions}
      locationsLoading={locationsLoading}
      /* The company dropdown in the card allows filtering by any company or
         searching across All Companies without changing the global top bar. */
      onCompanyChange={handleCompanyChange}
      /* A dedicated Search button directly below the last section (Barcode
         Pattern) so a pattern search can be run from where it is typed. It
         sends the WHOLE draft - company/location, dates and every other
         section included - exactly as the header Search does. */
      footer={(
        <div className="stock-filter-footer">
          <button
            type="button"
            className="btn btn-primary stock-filter-footer-search"
            onClick={runSearch}
            disabled={loading}
          >
            {loading ? <span className="spin" /> : <Icon name="search" size={15} />} Search
          </button>
        </div>
      )}
    />
  );
}
