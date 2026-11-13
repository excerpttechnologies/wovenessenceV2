'use client';
import { useMemo, useState } from 'react';
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

   This wrapper owns only the draft values. The APPLIED filters live in
   ListviewEccom, which sends them to /api/product-eccom. Search applies the
   draft; a section's Clear blanks only that section; Reset Filters blanks
   every box, Location included, and re-runs the list. */

export default function EccomProductFilterCard({
  filters = [],
  groups = [],
  headerDates = [],
  onSearch,
}) {
  const { business } = useScope();
  const [draft, setDraft] = useState(() => filterDefaults(filters));
  const byKey = useMemo(() => new Map(filters.map((f) => [f.k, f])), [filters]);

  /* Setting a filter clears every filter that depends on it: the suppliers
     picked for one city are not a valid pick for another. */
  const set = (k, v) => {
    const dependents = (filters || [])
      .filter((f) => f.dependsOn === k)
      .map((f) => f.k);
    setDraft((d) => {
      const next = { ...d, [k]: v };
      dependents.forEach((key) => {
        const f = byKey.get(key);
        next[key] = f?.multi ? [] : '';
      });
      return next;
    });
  };

  const apply = (next) => { setDraft(next); onSearch?.(next); };

  /* A section's Clear blanks only its own keys. Any filter that depends on
     one of those keys goes too, so clearing City cannot leave a Supplier
     picked for the old city behind. The values stay in the draft until
     Search is pressed, the same as typing into a box does. */
  const clearGroup = (keys) => {
    const drop = new Set(keys);
    (filters || []).forEach((f) => {
      if (drop.has(f.dependsOn)) drop.add(f.k);
    });
    setDraft((d) => {
      const next = { ...d };
      drop.forEach((key) => {
        const f = byKey.get(key);
        next[key] = f?.multi ? [] : '';
      });
      return next;
    });
  };

  const reset = () => apply(filterDefaults(filters));

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
    />
  );
}
