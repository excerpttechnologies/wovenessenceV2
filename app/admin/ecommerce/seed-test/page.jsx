'use client';

import { useState } from 'react';
import { useScope } from '@/components/ScopeContext';
import Icon from '@/components/Icon';

export default function SeedTestPage() {
  const { business } = useScope();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function seedData() {
    if (!business) {
      setError('Please select a business in the top bar first.');
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/v1/admin/seed-classification-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ business }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to seed data');
      }

      setResult(data);
    } catch (err) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card">
      <div className="card-head">
        <span className="card-title">Seed Classification Test Data</span>
      </div>
      <div className="card-body">
        {!business && (
          <div className="flash flash-err">Select a business in the top bar first.</div>
        )}

        {business && (
          <>
            <p className="mb-4 text-[14px]">
              This will add sample classification options (By Weave, By Fabric, By Craft, By Occasion, By Colour) 
              for testing purposes.
            </p>

            <button
              type="button"
              className="btn btn-primary"
              onClick={seedData}
              disabled={loading || !business}
            >
              <Icon name={loading ? 'loader' : 'plus'} size={14} />
              {loading ? 'Seeding...' : 'Seed Sample Data'}
            </button>

            {error && (
              <div className="flash flash-err mt-4">{error}</div>
            )}

            {result && (
              <div className="mt-4">
                <div className="flash flash-ok mb-3">{result.message}</div>
                
                <div className="rounded border border-line bg-slate-50 p-4">
                  <h3 className="mb-2 text-[14px] font-semibold">Details:</h3>
                  <ul className="space-y-1 text-[13px]">
                    {result.details?.map((detail, i) => (
                      <li key={i} className="text-inkmuted">{detail}</li>
                    ))}
                  </ul>
                </div>

                <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-4">
                  <h3 className="mb-2 text-[14px] font-semibold text-emerald-800">Next Steps:</h3>
                  <ol className="list-inside list-decimal space-y-1 text-[13px] text-emerald-700">
                    <li>Go to E-commerce → product-eccom → Add</li>
                    <li>Select Product Type: SAREES</li>
                    <li>Open the "By Weave" dropdown - you should see options!</li>
                    <li>Open the "By Fabric" dropdown - you should see options!</li>
                  </ol>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
