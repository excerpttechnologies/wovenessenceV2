'use client';
import StoreSellDocForm from '@/components/StoreSellDocForm';

/* Inter Store Sell > Sales Invoice > Add

   The invoice is raised from a received Delivery Challan - the form lists the
   challan's saved lines, never a blank item grid. */

export default function StoreSalesInvoiceAddPage() {
  return <StoreSellDocForm kind="invoice" />;
}
