'use client';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM } from '../form';

/* Stock Adjustment */

export default function AddStockadjustmentPage() {

  return (
    <TransactionFormView
      cfg={{
        title: "Stock Adjustments",
        addTitle: "Stock Adjustment",
        basePath: '/admin/inventory/',
        slugPath: "stock-adjustment",
        endpoint: '/api/stock-adjustment',
        scope: ["business","location","finYear"],
        docType: "Stock Adjustment",
        form: FORM,
      }}
    />
  );
}
