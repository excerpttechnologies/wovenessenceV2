'use client';
import { use } from 'react';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Edit Delivery Challans */

export default function EditTransactionSellDeliverychallanPage({ params }) {
  const { id } = use(params);

  return (
    <TransactionFormView
      id={id}
      cfg={{
        title: "Delivery Challans",
        addTitle: "Edit Delivery Challans",
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
