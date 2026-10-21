// 'use client';
// import TransactionFormView from '@/components/TransactionFormView';
// import { FORM } from '../form';

// /* Purchase Invoice */

// export default function AddTransactionPurchaseInvoicePage() {

//   return (
//     <TransactionFormView
//       cfg={{
//         title: "Purchase Invoices",
//         addTitle: "Purchase Invoice",
//         basePath: '/admin/',
//         slugPath: "transaction/purchase/invoice",
//         endpoint: '/api/purchase-invoice',
//         scope: ["business","location","finYear"],
//         docType: "Purchase Invoice",
//         form: FORM,
//       }}
//     />
//   );
// }




'use client';

import PurchaseInvoiceForm from '@/components/PurchaseInvoiceForm';
import { FORM } from '../form';

/* Add Purchase Invoice - the line grid and totals live in
   PurchaseInvoiceForm, not the generic TransactionFormView, so the other
   transaction screens are unaffected. */

export default function AddPurchaseInvoicePage() {

  return (
    <PurchaseInvoiceForm

      cfg={{
        title: 'Purchase Invoices',
        addTitle: 'Add Puechase Invoice',
        basePath: '/admin/',
        slugPath: 'transaction/purchase/invoice',
        endpoint: '/api/purchase-invoice',
        scope: ['business', 'location', 'finYear'],
        docType: 'Purchase Invoice',
        form: FORM,
      }}
    />
  );
}