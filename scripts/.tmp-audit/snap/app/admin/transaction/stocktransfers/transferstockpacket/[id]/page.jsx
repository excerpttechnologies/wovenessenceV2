'use client';
import { use } from 'react';
import StockTransferPacketForm from '@/components/StockTransferPacketForm';

/* Edit Transfer Stock Packet.
   Locked once a Stock Transfer Location has claimed it - the API returns 409
   and the form surfaces the message. */

export default function EditStockTransferPacketPage({ params }) {
  const { id } = use(params);

  return (
    <StockTransferPacketForm
      id={id}
      cfg={{
        title: 'Transfer Stock Packets',
        addTitle: 'Edit Transfer Stock Packet',
        basePath: '/admin/transaction/stocktransfers/',
        slugPath: 'transferstockpacket',
        endpoint: '/api/stock-transfer-packet',
        scope: ['business', 'location', 'finYear'],
        docType: 'Stock Transfer Packet',
      }}
    />
  );
}
