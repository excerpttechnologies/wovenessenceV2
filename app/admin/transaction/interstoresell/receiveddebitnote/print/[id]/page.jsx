'use client';
import { use } from 'react';
import StoreDocPrintView from '@/components/StoreDocPrintView';

/* Print Inter Store Received Debit Note. */

export default function StoreDebitNotePrintPage({ params }) {
  const { id } = use(params);
  return <StoreDocPrintView kind="debitnote" id={id} />;
}
