'use client';
import { useEffect, useMemo, useState } from 'react';
import ListView from '@/components/ListView';
import { useScope } from '@/components/ScopeContext';

/* E-commerce -> product-eccom (19-10-2026).

   A test screen over the `ecommerceproduct` collection that the separate
   e-commerce project writes (built there from barcodeLabel). Read through
   /api/product-eccom, which returns the documents exactly as stored.

   THE COLUMNS ARE THE COLLECTION'S OWN FIELDS. The page first asks the API
   which fields the documents carry (?fields=1) and makes one column per
   field, so a field added or renamed on the e-commerce side appears here
   with no change to this file. The most useful ones are put first; the rest
   follow in the order the collection has them. Column visibility hides any.

   ADD opens ./add - a form with one input per field of the collection. The
   row action opens the Item the product was made from. */

/* shown first, in this order, when the collection has them */
const FIRST = [
  'displayName', 'ecommItemCode', 'productType', 'status', 'isPublished', 'isFeatured',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'salesCount', 'slug',
];

/* camelCase -> "Camel Case" */
const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const isId = (v) => /^[0-9a-f]{24}$/i.test(String(v || ''));

function columnFor({ k, type }) {
  const t = labelOf(k);
  if (type === 'boolean') return { k, t, f: 'yesno' };
  if (type === 'date') return { k, t, f: 'datetime' };
  if (type === 'array') {
    /* a list of ids reads as how many; a list of words reads as the words */
    return {
      k, t,
      value: (r) => {
        const list = Array.isArray(r[k]) ? r[k] : [];
        if (!list.length) return '';
        if (list.every(isId)) return String(list.length);
        return list.map((x) => (x && typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
      },
    };
  }
  if (type === 'text' || type === 'number' || type === 'id') {
    return { k, t, value: (r) => (r[k] && typeof r[k] === 'object' ? JSON.stringify(r[k]) : r[k]) };
  }
  return { k, t };
}

export default function ProductEccomPage() {
  const { business } = useScope();
  const [fields, setFields] = useState(null);

  useEffect(() => {
    let off = false;
    setFields(null);
    fetch('/api/product-eccom?fields=1&business=' + (business || ''), { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => { if (!off) setFields(Array.isArray(d.fields) ? d.fields : []); })
      .catch(() => { if (!off) setFields([]); });
    return () => { off = true; };
  }, [business]);

  const cfg = useMemo(() => {
    const list = fields || [];
    const ordered = [
      ...FIRST.map((k) => list.find((f) => f.k === k)).filter(Boolean),
      ...list.filter((f) => !FIRST.includes(f.k)),
    ];
    return {
      title: 'product-eccom',
      basePath: '/admin/ecommerce/',
      slugPath: 'product-eccom',
      endpoint: '/api/product-eccom',
      scope: ['business'],
      /* ADD opens a form with every field of the collection (./add) */
      addHref: '/admin/ecommerce/product-eccom/add',
      pager: 'numbered',
      sortable: true,
      actionVariant: 'dropdown',
      actionMenu: [
        {
          label: 'View Item',
          icon: 'eye',
          to: (r) => '/admin/inventory/item/' + r.itemId,
        },
      ],
      columns: ordered.map(columnFor),
    };
  }, [fields]);

  if (fields === null) return <div className="card p-6 text-[13px] text-inkmuted">Loading...</div>;
  return <ListView key={cfg.columns.map((c) => c.k).join('|')} cfg={cfg} />;
}
