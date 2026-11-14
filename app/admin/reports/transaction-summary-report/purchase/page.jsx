'use client';
import { Suspense } from 'react';
import PurchaseDetailView from './PurchaseDetailView';

export default function PurchaseDetailPage() {
  return (
    <Suspense fallback={<div className="card"><div className="card-body dt-empty"><span className="spin" /></div></div>}>
      <PurchaseDetailView />
    </Suspense>
  );
}
