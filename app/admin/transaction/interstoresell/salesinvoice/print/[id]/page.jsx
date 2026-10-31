'use client';
import { use } from 'react';
import StoreDocPrintView from '@/components/StoreDocPrintView';

/* Print Inter Store Sales Invoice. */

export default function StoreSalesInvoicePrintPage({ params }) {
  const { id } = use(params);
  return <StoreDocPrintView kind="invoice" id={id} />;
}
