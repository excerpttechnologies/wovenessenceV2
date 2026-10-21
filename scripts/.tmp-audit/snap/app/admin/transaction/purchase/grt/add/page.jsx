'use client';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Add GRT */

export default function AddTransactionPurchaseGrtPage() {

  return (
    <TransactionFormView
      cfg={{
        title: "Goods Return Notes",
        addTitle: "Add GRT",
        basePath: '/admin/',
        slugPath: "transaction/purchase/grt",
        endpoint: '/api/purchase-grt',
        scope: ["business","location","finYear"],
        docType: "GRT",
        form: FORM,
      }}
    />
  );
}
