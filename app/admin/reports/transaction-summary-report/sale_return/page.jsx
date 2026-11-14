'use client';
import { Suspense } from 'react';
import PurchaseDetailView from '../purchase/PurchaseDetailView';

export default function SaleReturnDetailPage() {
  return (
    <Suspense fallback={<div className="card"><div className="card-body dt-empty"><span className="spin" /></div></div>}>
      <PurchaseDetailView isSaleReturn />
    </Suspense>
  );
}
