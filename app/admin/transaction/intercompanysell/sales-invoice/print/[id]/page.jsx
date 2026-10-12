'use client';
import { use } from 'react';
import IcTaxInvoiceView from '@/components/IcTaxInvoiceView';

/* Print a consignment Sales Invoice - reached from the Print button on the
   Billed list. The document is the same Tax Invoice layout the older IC
   invoice prints; only the endpoint feeding it differs. */

export default function IcItemInvoicePrintPage({ params, searchParams }) {
  const { id } = use(params);
  /* ?einv=1 prints the same document under the e-Invoice heading */
  const sp = use(searchParams);
  const einv = sp?.einv === '1';
  return (
    <IcTaxInvoiceView
      id={id}
      /* ?einv=1 also returns the IRN / Ack / QR once one is generated */
      endpoint={'/api/ic-item-invoice/' + id + '/print' + (einv ? '?einv=1' : '')}
      backHref="/admin/transaction/intercompanysell/sales-invoice"
      einvoice={einv}
      einvoiceEndpoint={einv ? '/api/ic-item-invoice/' + id + '/einvoice' : ''}
    />
  );
}
