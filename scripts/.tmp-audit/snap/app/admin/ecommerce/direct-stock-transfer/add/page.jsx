'use client';
import StockTransferForm from '@/components/StockTransferForm';

/* E-Commerce -> Direct Stock Transfer.

   Deliberately the SAME component and the SAME endpoint as an ordinary stock
   transfer. Only the origin stamped on the document differs, so e-commerce
   despatches move stock by identical rules and appear in the same ledger,
   the same reports and the same barcode history. Building a second transfer
   path for e-commerce would have produced a second inventory. */

export default function EcomDirectStockTransferPage() {
  return (
    <StockTransferForm
      source="ECOMMERCE"
      title="E-Commerce Direct Stock Transfer"
      referenceLabel="E-Commerce Order / Reference"
      returnPath="/admin/transaction/stocktransfers/transfer"
    />
  );
}
