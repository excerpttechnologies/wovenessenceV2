'use client';
import { use } from 'react';
import StoreDocPrintView from '@/components/StoreDocPrintView';

/* Print Inter Store Delivery Challan - reached from the list's print icon. */

export default function StoreDeliveryChallanPrintPage({ params }) {
  const { id } = use(params);
  return <StoreDocPrintView kind="challan" id={id} />;
}
