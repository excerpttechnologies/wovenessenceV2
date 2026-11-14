'use client';
import { Suspense } from 'react';
import PurchaseDetailView from '../purchase/PurchaseDetailView';

export default function StockInDetailPage() {
  return (
    <Suspense fallback={<div className="card"><div className="card-body dt-empty"><span className="spin" /></div></div>}>
      <PurchaseDetailView isStockIn />
    </Suspense>
  );
}
