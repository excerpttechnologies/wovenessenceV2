'use client';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Credit Note */

export default function AddTransactionSellCreditnotePage() {

  return (
    <TransactionFormView
      cfg={{
        title: "Credit Notes",
        addTitle: "Credit Note",
        basePath: '/admin/',
        slugPath: "transaction/sell/creditnote",
        endpoint: '/api/sell-creditnote',
        scope: ["business","location","finYear"],
        docType: "Credit Note",
        form: FORM,
      }}
    />
  );
}
