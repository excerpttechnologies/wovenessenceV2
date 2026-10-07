'use client';
import StockTransferPacketForm from '@/components/StockTransferPacketForm';

/* Add Transfer Stock Packet.
   Packet No is issued by the server on save from the Doc Setup master. */

export default function AddStockTransferPacketPage() {
  return (
    <StockTransferPacketForm
      cfg={{
        title: 'Transfer Stock Packets',
        addTitle: 'Add Transfer Stock Packet',
        basePath: '/admin/transaction/stocktransfers/',
        slugPath: 'transferstockpacket',
        endpoint: '/api/stock-transfer-packet',
        scope: ['business', 'location', 'finYear'],
        docType: 'Stock Transfer Packet',
      }}
    />
  );
}
