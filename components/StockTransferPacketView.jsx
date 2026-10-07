'use client';
import { useEffect, useState } from 'react';
import Icon from './Icon';
import { fmt } from '@/lib/format';
import { money } from '@/app/admin/transaction/stocktransfers/transferstockpacket/fields';

/* View Stock Transfer Packet - the read-only dialog the packet list opens.

   "Is Location Created" is the human-readable form of
   stockTransferLocationId: once a Stock Transfer Location has claimed this
   packet the flag reads Yes and the packet can no longer be edited or
   deleted. It is printed in red on the deployed screen because it is the one
   field that tells you whether the packet is still yours to change. */

const Row = ({ label, value, tone }) => (
  <div className="flex py-[3px] text-[13.5px]">
    <span className={'w-[160px] shrink-0 font-semibold ' + (tone === 'red' ? 'text-danger' : 'text-ink')}>
      {label}
    </span>
    <span className={tone === 'red' ? 'text-danger' : 'text-cell'}>: {value || ''}</span>
  </div>
);

const Heading = ({ children }) => (
  <div className="mb-1 mt-3 flex items-center justify-center gap-2 text-[14.5px] font-bold text-danger">
    <Icon name="home" size={15} /> {children}
  </div>
);

export default function StockTransferPacketView({ id, labels = {}, onClose }) {
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    fetch('/api/stock-transfer-packet/' + id)
      .then(async (r) => {
        if (!r.ok) throw new Error('Could not load that packet');
        return r.json();
      })
      .then((d) => setDoc(d.doc))
      .catch((e) => setError(e.message));
  }, [id]);

  const items = Array.isArray(doc?.items) ? doc.items : [];
  const totalQty = items.reduce((a, r) => a + (Number(r.qty) || 0), 0);
  const totalRate = items.reduce((a, r) => a + (Number(r.netRate) || 0), 0);
  const totalAmount = items.reduce((a, r) => a + (Number(r.beforeTax) || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/45 p-4 pt-12"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-[1080px] rounded-lg bg-white shadow-pop"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="relative flex items-center border-b border-line px-5 py-3">
          <span className="text-[16px] font-bold">View Stock Transfer Packet</span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-[#e0342c] text-white"
            title="Close"
          >
            <Icon name="x" size={14} />
          </button>
        </div>

        <div className="px-5 py-4">
          {error && <div className="flash flash-err">{error}</div>}
          {!doc && !error && <div className="py-6 text-center"><span className="spin" /></div>}

          {doc && (
            <>
              <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                <div>
                  <Row label="Packet No" value={doc.packetNo} />
                  <Row
                    label="Is Location Created"
                    value={doc.stockTransferLocationId ? 'Yes' : 'No'}
                    tone="red"
                  />
                </div>
                <div>
                  <Row label="STP Date" value={fmt('date', doc.stpDate)} />
                  <Row label="Financial Year" value={doc.finYear} />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-x-10 md:grid-cols-2">
                <div>
                  <Heading>Transfer From</Heading>
                  <Row label="Location Name" value={labels[String(doc.fromLocationId)]} />
                  <Row label="GSTN" value={doc.fromGstn} />
                  <Row label="Address" value={doc.fromAddress} />
                  <Row label="State" value={doc.fromState} />
                </div>
                <div>
                  <Heading>Transfer To</Heading>
                  <Row label="Location Name" value={labels[String(doc.toLocationId)]} />
                  <Row label="GSTN" value={doc.toGstn} />
                  <Row label="Address" value={doc.toAddress} />
                  <Row label="State" value={doc.toState} />
                  <Row label="Stock Point" value={labels[String(doc.toStockPointId)]} />
                </div>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="dt">
                  <thead>
                    <tr>
                      <th>Sl No</th>
                      <th>Item Code</th>
                      <th>Item Name</th>
                      <th>HSN</th>
                      <th>GST</th>
                      <th className="text-right">QTY</th>
                      <th className="text-right">Net Rate</th>
                      <th className="text-right">Net Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={8} className="dt-empty">No items on this packet.</td></tr>
                    )}
                    {items.map((r, i) => (
                      <tr key={i}>
                        <td>{i + 1}</td>
                        <td>{r.itemCode}</td>
                        <td>{r.itemName}</td>
                        <td>{r.hsn}</td>
                        <td>{r.slabName}</td>
                        <td className="text-right">{money(r.qty)}</td>
                        <td className="text-right">{money(r.netRate)}</td>
                        <td className="text-right">{money(r.beforeTax)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold">
                      <td colSpan={5} className="text-right">Total</td>
                      <td className="text-right">{money(totalQty)}</td>
                      <td className="text-right">{money(totalRate)}</td>
                      <td className="text-right">{money(totalAmount)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
