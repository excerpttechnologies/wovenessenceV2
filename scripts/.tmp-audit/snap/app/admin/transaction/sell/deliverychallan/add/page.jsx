'use client';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Add Delivery Challan */

export default function AddTransactionSellDeliverychallanPage() {

  return (
    <TransactionFormView
      cfg={{
        title: "Delivery Challans",
        addTitle: "Add Delivery Challan",
        basePath: '/admin/',
        slugPath: "transaction/sell/deliverychallan",
        endpoint: '/api/sell-deliverychallan',
        scope: ["business","location","finYear"],
        docType: "Delivery Challan",
        form: FORM,
      }}
    />
  );
}
