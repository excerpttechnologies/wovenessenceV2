'use client';
import { use } from 'react';
import StoreDocPrintView from '@/components/StoreDocPrintView';

/* Print Inter Store Sales Return. */

export default function StoreSalesReturnPrintPage({ params }) {
  const { id } = use(params);
  return <StoreDocPrintView kind="return" id={id} />;
}
