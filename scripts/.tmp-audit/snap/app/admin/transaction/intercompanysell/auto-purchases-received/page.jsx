'use client';
import IcInboxView from '@/components/IcInboxView';

/* Auto Purchases Received - /admin/transaction/intercompanysell/auto-purchases-received

   Two lists on one screen. The top one holds inter company sales invoices
   raised BY ANOTHER BRANCH and addressed to this one, that have not been
   accepted yet; accepting one creates a real Goods Receipt Challan in this
   branch's scope and moves the row to the list below. From that point the
   goods behave like any other receipt - the GRC shows up under
   Purchase -> Goods Receipt Challan and can be turned into a Purchase
   Invoice. That is why the lower list has a GRC No column.

   ("Form Business" / "Form Location" is the deployed screen's spelling of
   From. Kept as-is so the two apps read the same.) */

const PENDING = {
  title: 'Pending Auto Purchases Receiveds',
  endpoint: '/api/ic-sales-invoice',
  file: 'pending-auto-purchases-received',
  /* invoices addressed to me, not yet accepted */
  inboxParam: 'inbox',
  unconvertedParam: 'receivedId',
  actionEndpoint: '/api/ic-auto-purchase-received',
  actionKey: 'icSalesInvoiceId',
  actionLabel: 'Receive',
  confirm: 'Receive this invoice into stock? A Goods Receipt Challan will be created.',
  columns: [
    { k: 'invoiceNo', t: 'Invoice No' },
    { k: 'businessId', t: 'Transfer Business', f: 'ref' },
    { k: 'locationId', t: 'Transfer Location', f: 'ref' },
    { k: 'invoiceDate', t: 'Date', f: 'date' },
  ],
};

const RECEIVED = {
  title: 'Recieved Auto Purchases Receiveds',
  endpoint: '/api/ic-auto-purchase-received',
  file: 'auto-purchases-received',
  columns: [
    { k: 'recNo', t: 'Rec No' },
    { k: 'grcNo', t: 'GRC No', f: 'dash' },
    { k: 'fromBusinessId', t: 'Form Business', f: 'ref' },
    { k: 'fromLocationId', t: 'Form Location', f: 'ref' },
    { k: 'date', t: 'Date', f: 'date' },
    { k: 'finYear', t: 'Fin Year' },
  ],
};

export default function IcAutoPurchasesReceivedPage() {
  return <IcInboxView pending={PENDING} actioned={RECEIVED} />;
}
