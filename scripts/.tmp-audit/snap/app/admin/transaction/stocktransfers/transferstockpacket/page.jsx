'use client';
import StockTransferPacketList from '@/components/StockTransferPacketList';

/* Transfer Stock Packets - list.

   The row's View action opens a dialog rather than navigating, so this list
   owns its own view instead of going through ListView - see the note at the
   top of StockTransferPacketList. */

export default function StockTransferPacketListPage() {
  return <StockTransferPacketList />;
}
