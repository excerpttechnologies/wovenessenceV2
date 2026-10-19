'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import MultiSelect from '@/components/MultiSelect';
import { useScope } from '@/components/ScopeContext';

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
  isPublished: 'boolean', isFeatured: 'boolean',
  ecommOffPercent: 'number', barcodePriceOverride: 'number', barcodeQtyOverride: 'number', salesCount: 'number',
  barcodeStatusOverride: 'text', printDescriptionOverride: 'text', image: 'text',
  seoTitle: 'text', seoDescription: 'textarea',
  colourDescription: 'textarea', craftDescription: 'textarea', fabricDescription: 'textarea',
  occasionDescription: 'textarea', weaveDescription: 'textarea',
  additionalImages: 'lines',
  byColour: 'classification', byCraft: 'classification', byFabric: 'classification',
  byOccasion: 'classification', byWeave: 'classification',
};
const FIRST = ['itemId', 'displayName', 'ecommItemCode', 'productType', 'status', 'slug', 'isPublished', 'isFeatured',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'salesCount'];
const SKIP = new Set(['businessId', 'createdAt', 'updatedAt']);

const labelOf = (k) => k.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
const kindOf = (f) => (f.k === 'itemId' ? 'item' : KNOWN[f.k] || (f.type === 'boolean' ? 'boolean' : f.type === 'number' ? 'number' : f.type === 'array' ? 'lines' : 'text'));

export default function ProductEccomAddPage() {
  const router = useRouter();
  const { business } = useScope();
  const [fields, setFields] = useState(null);
  const [classes, setClasses] = useState({});
  const [items, setItems] = useState([]);
  const [data, setData] = useState({ status: 'active', isPublished: false, isFeatured: false });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!business) return undefined;
    let off = false;
    const q = 'business=' + business;
    Promise.all([
      fetch('/api/product-eccom?fields=1&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/product-eccom?classifications=1&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
      fetch('/api/options?ref=item&' + q, { cache: 'no-store' }).then((r) => r.json()).catch(() => ({})),
    ]).then(([f, c, it]) => {
      if (off) return;
      /* the known fields always, plus whatever else the collection carries */
      const seen = (f.fields || []).filter((x) => !SKIP.has(x.k));
      const all = [...seen];
      ['itemId', ...Object.keys(KNOWN)].forEach((k) => { if (!all.some((x) => x.k === k)) all.push({ k, type: 'text' }); });
      setFields(all);
      setClasses(c.classifications || {});
      setItems((it.options || []).map((o) => ({ ...o, value: String(o.value) })));
    });
    return () => { off = true; };
  }, [business]);

  const ordered = useMemo(() => {
    const list = fields || [];
    return [...FIRST.map((k) => list.find((f) => f.k === k)).filter(Boolean), ...list.filter((f) => !FIRST.includes(f.k))];
  }, [fields]);

  const set = (k, v) => { setData((d) => ({ ...d, [k]: v })); setErrors((e) => ({ ...e, [k]: '' })); };

  /* picking the item fills Display Name and Ecomm Item Code when still empty */
  const pickItem = (v) => {
    const it = items.find((o) => o.value === v);
    setData((d) => ({
      ...d,
      itemId: v,
      displayName: d.displayName || it?.name || it?.label || '',
      ecommItemCode: d.ecommItemCode || it?.code || '',
    }));
    setErrors((e) => ({ ...e, itemId: '' }));
  };

  async function save() {
    setSaving(true);
    setError('');
    try {
      const r = await fetch('/api/product-eccom', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business, data }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErrors(d.errors || {});
        setError(d.error || 'Could not save.');
        return;
      }
      router.push('/admin/ecommerce/product-eccom');
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
    if (kind === 'item') {
      return <MultiSelect mode="single" options={items} value={v || ''} placeholder="Select item" onChange={pickItem} />;
    }
    if (kind === 'boolean') {
      return (
        <label className="flex h-[38px] cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4" checked={Boolean(v)} onChange={(e) => set(k, e.target.checked)} /> {labelOf(k)}
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
      const opts = classes[k] || [];
      const picked = Array.isArray(v) ? v : [];
      if (!opts.length) return <div className="py-2 text-[12px] text-inkmuted">No options for this business.</div>;
      return (
        <div className="flex flex-wrap gap-x-4 gap-y-1 rounded border border-line p-2">
          {opts.map((o) => (
            <label key={o.value} className="flex cursor-pointer items-center gap-1.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={picked.includes(o.value)}
                onChange={(e) => set(k, e.target.checked ? [...picked, o.value] : picked.filter((x) => x !== o.value))}
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    return <input className="f-input" value={v ?? ''} onChange={(e) => set(k, e.target.value)} />;
  };

  const wide = (f) => ['textarea', 'lines', 'classification'].includes(kindOf(f));

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Add product-eccom</span>
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
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 md:grid-cols-3">
              {ordered.map((f) => (
                <div key={f.k} className={wide(f) ? 'md:col-span-3' : undefined}>
                  {kindOf(f) !== 'boolean' && (
                    <label className="f-label">
                      {f.k === 'itemId' ? 'Item' : labelOf(f.k)}
                      {(f.k === 'itemId' || f.k === 'displayName') && <span className="text-danger"> *</span>}
                    </label>
                  )}
                  {input(f)}
                  {errors[f.k] && <div className="mt-0.5 text-[12px] text-danger">{errors[f.k]}</div>}
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => router.push('/admin/ecommerce/product-eccom')}>Cancel</button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={save}>
                {saving ? <span className="spin" /> : <Icon name="save" size={14} />} Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
