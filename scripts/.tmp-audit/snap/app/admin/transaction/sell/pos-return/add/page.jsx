'use client';
import { Suspense } from 'react';
import PosReturnForm from '@/components/PosReturnForm';

/* Customer return / refund. Reads ?business=&location= with useSearchParams,
   which needs a Suspense boundary - the till links here with the counter's
   scope so the operator does not have to re-pick it. */
export default function AddPosReturnPage() {
  return (
    <Suspense fallback={<div className="card"><div className="card-body text-inkmuted">Loading...</div></div>}>
      <PosReturnForm />
    </Suspense>
  );
}
