'use client';
import { useEffect, useState } from 'react';
import ChallanDocument from './ChallanDocument';

/* Printed Delivery Challan for a SELL delivery challan.

   This screen did not exist: the module had a list and an edit form and no
   way to print the document the goods travel with. It now prints the same
   challan as a stock transfer, from the same component - so both carry the
   Total Qty / Total PC / Total MTR summary and both offer the detailed and
   non-detailed formats, without a second copy of the layout or the
   arithmetic.

   The line items on this document are keyed by column heading ('Item Code',
   'QTY') rather than by field name. lib/challan.js reads both, so nothing
   here has to reshape them. */

export default function SellChallanView({ id }) {
  const [doc, setDoc] = useState(null);
  const [labels, setLabels] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/sell-deliverychallan/' + id, { cache: 'no-store' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (!ok || !d.doc) { setError(d.error || 'Could not load this challan.'); return; }
        setDoc(d.doc);
        setLabels(d.labels || {});
      })
      .catch(() => setError('Could not reach the server.'));
  }, [id]);

  if (error) return <div className="card"><div className="card-body text-danger">{error}</div></div>;
  if (!doc) return <div className="card"><div className="card-body text-inkmuted">Loading challan...</div></div>;

  const customerName = labels[String(doc.customerId)] || doc.customerName || '';

  return (
    <ChallanDocument
      title="Delivery Challan"
      docNo={doc.deliveryChallanNo}
      docDate={doc.dcDate || doc.createdAt}
      from={{
        label: 'Despatched From',
        name: labels[String(doc.locationId)] || '',
        address: doc.fromAddress || '',
        gstn: doc.fromGstn || '',
      }}
      to={{
        label: 'Delivered To',
        name: customerName,
        address: doc.customerAddress,
        gstn: doc.customerGstn,
        mobile: doc.customerMobile,
      }}
      meta={[
        { label: 'Waybill', value: doc.customerWaybill },
        { label: 'Logistics', value: labels[String(doc.logisticId)] || '' },
      ]}
      lines={doc.items}
      remarks={doc.salesTerm}
      signatures={[
        { label: 'Prepared By' },
        { label: 'Driver / Transporter' },
        { label: 'Received By', value: customerName },
      ]}
    />
  );
}
