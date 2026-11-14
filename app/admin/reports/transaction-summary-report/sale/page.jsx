'use client';
import { Suspense } from 'react';
import PurchaseDetailView from '../purchase/PurchaseDetailView';

export default function SaleDetailPage() {
  return (
    <Suspense fallback={<div className="card"><div className="card-body dt-empty"><span className="spin" /></div></div>}>
      <PurchaseDetailView isSale />
    </Suspense>
  );
}
