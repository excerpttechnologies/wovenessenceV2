'use client';
import { use } from 'react';
import StockTransferLocationForm from '@/components/StockTransferLocationForm';

/* View an Inter Location Stock Transfer.

   Deliberately read-only. Every line came from a packet this transfer has
   already claimed, so editing it would put the two documents out of step. To
   change what it carries, delete the transfer - which releases its packets -
   and raise it again. Same rule as the Inter Company Sales Invoice. */

export default function ViewStockTransferLocationPage({ params }) {
  const { id } = use(params);

  return (
    <StockTransferLocationForm
      id={id}
      cfg={{
        title: 'Transfer Stock Locations',
        addTitle: 'Transfer Stock Location',
        basePath: '/admin/transaction/stocktransfers/',
        slugPath: 'transferstocklocation',
        endpoint: '/api/stock-transfer-location',
        scope: ['business', 'location', 'finYear'],
        docType: 'Stock Transfer Location',
      }}
    />
  );
}
