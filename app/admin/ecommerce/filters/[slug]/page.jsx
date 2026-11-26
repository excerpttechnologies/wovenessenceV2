'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import ClassificationOptionsPage from '@/components/ClassificationOptionsPage';
import { useScope } from '@/components/ScopeContext';

export default function DynamicCustomFilterPage() {
  const params = useParams();
  const slug = String(params?.slug || '').trim().toLowerCase();
  const { business } = useScope();

  const [filterDef, setFilterDef] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadFilter = useCallback(async () => {
    if (!business || !slug) {
      setFilterDef(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        '/api/v1/admin/ecommerce-filters?includeInactive=1&business=' + encodeURIComponent(business),
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Could not load custom filter.');
      const matched = (Array.isArray(data.filters) ? data.filters : []).find(
        (f) => String(f.slug || '').toLowerCase() === slug || String(f.key || '').toLowerCase() === slug
      );
      setFilterDef(matched || null);
    } catch (err) {
      setFilterDef(null);
      setError(err.message || 'Could not load custom filter.');
    } finally {
      setLoading(false);
    }
  }, [business, slug]);

  useEffect(() => {
    loadFilter();
    const onUpdate = () => loadFilter();
    window.addEventListener('ecommerce-filters-updated', onUpdate);
    return () => window.removeEventListener('ecommerce-filters-updated', onUpdate);
  }, [loadFilter]);

  if (!business) {
    return (
      <div className="card">
        <div className="card-head">
          <span className="card-title">Custom Filter</span>
        </div>
        <div className="card-body">
          <div className="flash flash-err">Select a company in the top bar.</div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="card">
        <div className="card-head">
          <span className="card-title">Loading filter...</span>
        </div>
        <div className="card-body text-[13px] text-inkmuted">Loading filter details...</div>
      </div>
    );
  }

  if (error || !filterDef) {
    return (
      <div className="card">
        <div className="card-head">
          <span className="card-title">Filter Not Found</span>
        </div>
        <div className="card-body space-y-3">
          <div className="flash flash-err">
            {error || 'No custom filter matches this route for the selected company.'}
          </div>
          <Link href="/admin/ecommerce/product-type" className="btn btn-primary inline-flex">
            Back to Product Type
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filterDef.isActive === false && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
          This filter is currently marked inactive and will be hidden from active menus and storefront filters.
        </div>
      )}
      <ClassificationOptionsPage
        type={filterDef.key}
        label={filterDef.name || filterDef.label}
        isCustom={!filterDef.isBuiltIn}
      />
    </div>
  );
}
