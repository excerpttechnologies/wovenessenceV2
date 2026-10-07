'use client';
import TransactionFormView from '@/components/TransactionFormView';
import { FORM, SUPPLIER_QUICK_FIELDS } from '../form';

/* Add Goods Receipt Challan */

export default function AddTransactionPurchaseGrcPage() {
  return (
    <TransactionFormView
      cfg={{
        title: "Goods Receiptc Challans",
        addTitle: "Add Goods Receipt Challan",
        basePath: '/admin/',
        slugPath: "transaction/purchase/grc",
        endpoint: '/api/purchase-grc',
        scope: ["business","location","finYear"],
        docType: "Goods Receipt Challan",
        form: FORM,
        quickAdd: {
          field: 'supplierId', label: '', title: '', slug: 'supplier', inline: true,
          endpoint: '/api/supplier', fields: SUPPLIER_QUICK_FIELDS,
          /* Navigate to the full Supplier Add page instead of opening a modal,
             so the operator gets the complete form including Import from GST. */
          navigate: '/admin/contact/supplier/add',
        },
        quickAdds: {
          agentId: {
            label: '', title: '', slug: 'agent', endpoint: '/api/agent', inline: true,
            fields: [
              { k: 'typeId', label: 'Type', type: 'ref', ref: 'contact-type-agent', req: true },
              { k: 'shortName', label: 'Short Name', type: 'text' },
              { k: 'prefix', label: 'Prefix', type: 'select', def: 'Mr.', opts: [{ v: 'Mr.', l: 'Mr.' }, { v: 'Mrs.', l: 'Mrs.' }, { v: 'Ms.', l: 'Ms.' }] },
              { k: 'firstName', label: 'First Name', type: 'text', req: true },
              { k: 'billingMobile', label: 'Mobile', type: 'text', req: true },
              { k: 'openingBalance', label: 'Opening Balance', type: 'number', req: true, def: 0 },
            ],
          },
        },
        afterSaveBarcode: true,
        barcodePath: '/admin/transaction/purchase/grc/',
        barcodeSuffix: '/barcode-generation',
      }}
    />
  );
}