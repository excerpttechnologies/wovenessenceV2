// 'use client';
// import { use } from 'react';
// import TransactionFormView from '@/components/TransactionFormView';
// import { FORM } from '../form';

// /* Edit Purchase Invoices */

// export default function EditTransactionPurchaseInvoicePage({ params }) {
//   const { id } = use(params);

//   return (
//     <TransactionFormView
//       id={id}
//       cfg={{
//         title: "Purchase Invoices",
//         addTitle: "Edit Purchase Invoices",
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
import { use } from 'react';
import PurchaseInvoiceForm from '@/components/PurchaseInvoiceForm';
import { FORM } from '../form';

/* Edit Purchase Invoice - the line grid and totals live in
   PurchaseInvoiceForm, not the generic TransactionFormView, so the other
   transaction screens are unaffected. */

export default function EditPurchaseInvoicePage({ params }) {
  const { id } = use(params);
  return (
    <PurchaseInvoiceForm
      id={id}
      cfg={{
        title: 'Purchase Invoices',
        addTitle: 'Edit Puechase Invoice',
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