'use client';
import StockTransferLocationForm from '@/components/StockTransferLocationForm';

/* Add Transfer Stock Location.
   Packet No is issued by the server on save from the Doc Setup master. */

export default function AddStockTransferLocationPage() {
  return (
    <StockTransferLocationForm
      cfg={{
        title: 'Transfer Stock Locations',
        addTitle: 'Add Transfer Stock Location',
        basePath: '/admin/transaction/stocktransfers/',
        slugPath: 'transferstocklocation',
        endpoint: '/api/stock-transfer-location',
        scope: ['business', 'location', 'finYear'],
        docType: 'Stock Transfer Location',
      }}
    />
  );
}
