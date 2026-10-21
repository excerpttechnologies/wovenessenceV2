'use client';
import { useEffect, useMemo, useState } from 'react';
import ChallanDocument from './ChallanDocument';
import { qtyText } from '@/lib/challan';

/* Delivery Challan for a stock transfer.

   This file used to carry its own copy of the printed layout and its own
   quantity arithmetic. Both now come from ChallanDocument and lib/challan, so
   the transfer challan and the sell delivery challan cannot drift apart on
   what a consignment contains - which is the number that gets checked when
   the goods arrive.

   What is left here is the part that is genuinely about a TRANSFER: fetching
   it, attaching supplier names, and offering the despatched-versus-accepted
   view that only a document with returns can have. */

export default function TransferChallanView({ id }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  /* A challan normally lists what was despatched. Once part of it has come
     back, the receiving branch wants the accepted position instead - so the
     view can be switched, and the summary says which it is showing. */
  const [scope, setScope] = useState('sent');

  useEffect(() => {
    fetch('/api/stock-transfer/' + id, { cache: 'no-store' })
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => (ok ? setData(d) : setError(d.error || 'Could not load this transfer.')))
      .catch(() => setError('Could not reach the server.'));
  }, [id]);

  const doc = data?.doc;
  const supplierNames = data?.supplierNames || {};

  const lines = useMemo(() => {
    const all = doc?.lines || [];
    const visible = scope === 'accepted' ? all.filter((l) => !l.returned) : all;
    /* the supplier is stored as an id on the line; the challan prints a name */
    return visible.map((l) => ({ ...l, supplierName: supplierNames[String(l.supplierId)] || '' }));
  }, [doc, scope, supplierNames]);

  if (error) return <div className="card"><div className="card-body text-danger">{error}</div></div>;
  if (!doc) return <div className="card"><div className="card-body text-inkmuted">Loading challan...</div></div>;

  /* Only shown once something has actually come back - a clean transfer does
     not need a Returned row reading zero. */
  const extraSummary = doc.returnedCount > 0 && scope === 'sent'
    ? [
      { label: 'Returned', value: qtyText(doc.returnedQty) },
      { label: 'Billable', value: qtyText(doc.billableQty), strong: true },
    ]
    : [];

  return (
    <ChallanDocument
      title="Delivery Challan"
      docNo={doc.transferNo}
      docDate={doc.transferDate}
      from={{
        label: 'Despatched From',
        name: doc.fromLocationName, address: doc.fromAddress, gstn: doc.fromGstn,
      }}
      to={{
        label: 'Delivered To',
        name: doc.toLocationName, address: doc.toAddress, gstn: doc.toGstn,
      }}
      meta={[
        { label: 'Waybill / LR', value: doc.waybill },
        { label: 'Status', value: String(doc.status).replace(/_/g, ' ') },
      ]}
      lines={lines}
      remarks={doc.remarks}
      extraSummary={extraSummary}
      signatures={[
        { label: 'Prepared By', value: doc.submittedBy },
        { label: 'Driver / Transporter' },
        { label: 'Received By', value: doc.receivedBy },
      ]}
      scopeOptions={[
        { value: 'sent', label: 'Everything despatched' },
        { value: 'accepted', label: 'Accepted only (excludes returns)' },
      ]}
      scopeValue={scope}
      onScopeChange={setScope}
    />
  );
}
