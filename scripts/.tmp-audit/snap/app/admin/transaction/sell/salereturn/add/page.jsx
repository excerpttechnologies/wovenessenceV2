'use client';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Sales Return */

export default function AddTransactionSellSalereturnPage() {

  return (
    <TransactionFormView
      cfg={{
        title: "Sales Returns",
        addTitle: "Sales Return",
        basePath: '/admin/',
        slugPath: "transaction/sell/salereturn",
        endpoint: '/api/sell-salereturn',
        scope: ["business","location","finYear"],
        docType: "Sales Return",
        form: FORM,
      }}
    />
  );
}
