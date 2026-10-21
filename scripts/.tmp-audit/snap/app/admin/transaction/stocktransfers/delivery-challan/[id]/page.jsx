'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';

export default function DeliveryChallanViewPage() {
  const params = useParams();
  const router = useRouter();
  const [challan, setChallan] = useState(null);
  const [labels, setLabels] = useState({});
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    const fetch_challan = async () => {
      if (!params.id) return;
      try {
        const r = await fetch(`/api/delivery-challan/${params.id}`);
        const d = await r.json();
        if (d.challan) {
          setChallan(d.challan);
          setLabels(d.labels || {});
        }
      } catch (error) {
        console.error('Error fetching challan:', error);
      } finally {
        setLoading(false);
      }
    };
    fetch_challan();
  }, [params.id]);

  const handlePrint = () => {
    setPrinting(true);
    window.print();
    setTimeout(() => setPrinting(false), 500);
  };

  const handleDownloadPDF = () => {
    /* Generate PDF from current content - uses print-to-pdf browser function */
    const filename = `delivery-challan-${challan?.deliveryChallanNo || 'export'}.pdf`;
    const link = document.createElement('a');
    link.href = '#';
    link.download = filename;
    window.print();
  };

  if (loading) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="dt-empty"><span className="spin" /></div>
        </div>
      </div>
    );
  }

  if (!challan) {
    return (
      <div className="card">
        <div className="card-body text-center">
          <p className="text-danger">Delivery Challan not found.</p>
          <button className="btn btn-ghost mt-4" onClick={() => router.back()}>
            <Icon name="arrow-left" size={14} /> Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="card print:p-0 print:shadow-none">
      <div className="card-head print:hidden">
        <span className="card-title">Delivery Challan - {challan.deliveryChallanNo}</span>
        <span className="flex-1" />
        <button
          className="btn btn-ghost"
          onClick={handlePrint}
          disabled={printing}
          title="Print Delivery Challan"
        >
          <Icon name="printer" size={14} /> {printing ? 'Printing...' : 'Print'}
        </button>
        <button className="btn btn-ghost" onClick={() => router.back()} title="Close">
          <Icon name="x" size={14} />
        </button>
      </div>

      <div className="card-body print:p-4">
        <div className="bg-white p-6 print:p-0">
          {/* Header */}
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold mb-2">DELIVERY CHALLAN</h2>
            <p className="text-sm text-gray-600">
              Challan No: <span className="font-semibold">{challan.deliveryChallanNo}</span>
            </p>
            <p className="text-sm text-gray-600">
              Date: <span className="font-semibold">
                {new Date(challan.dcDate).toLocaleDateString()}
              </span>
            </p>
          </div>

          {/* Location Details */}
          <div className="grid grid-cols-2 gap-6 mb-6">
            <div>
              <h4 className="font-bold mb-2">From Location</h4>
              <p className="text-sm">
                {labels[String(challan.fromLocationId)] || 'N/A'}
              </p>
            </div>
            <div>
              <h4 className="font-bold mb-2">To Location</h4>
              <p className="text-sm">
                {labels[String(challan.toLocationId)] || 'N/A'}
              </p>
            </div>
          </div>

          {/* Items Table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-gray-800">
                  <th className="text-left py-2 px-2">Doc No</th>
                  <th className="text-left py-2 px-2">Item Code</th>
                  <th className="text-left py-2 px-2">Item Name</th>
                  <th className="text-center py-2 px-2">Barcode</th>
                  <th className="text-right py-2 px-2">Qty</th>
                  <th className="text-left py-2 px-2">UOM</th>
                  <th className="text-right py-2 px-2">RSP Rate</th>
                  <th className="text-right py-2 px-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {challan.items && challan.items.length > 0 ? (
                  challan.items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-300">
                      <td className="py-2 px-2">{item.docNo || item.documentNo || challan.sourceDocNo || '-'}</td>
                      <td className="py-2 px-2">{item.itemCode || '-'}</td>
                      <td className="py-2 px-2">{item.itemName || '-'}</td>
                      <td className="py-2 px-2 text-center text-xs">{item.barcode || '-'}</td>
                      <td className="py-2 px-2 text-right">{item.qty || 0}</td>
                      <td className="py-2 px-2">{item.uom || '-'}</td>
                      <td className="py-2 px-2 text-right">
                        {Number(item.rspRate ?? item.rsp ?? item.netRate) > 0
                          ? `₹${Number(item.rspRate ?? item.rsp ?? item.netRate).toFixed(2)}` : '-'}
                      </td>
                      <td className="py-2 px-2 text-right">
                        {item.amount ? `₹${item.amount.toFixed(2)}` : '-'}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="text-center py-4 text-gray-500">
                      No items
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex justify-end mb-6">
            <div className="w-48">
              <div className="flex justify-between py-2 px-2 border-t-2 border-gray-800">
                <span className="font-bold">Total Qty:</span>
                <span className="font-bold">{challan.totalQty || 0}</span>
              </div>
              <div className="flex justify-between py-2 px-2 border-b-2 border-gray-800">
                <span className="font-bold">Total Amount:</span>
                <span className="font-bold">
                  ₹{(challan.totalAmount || 0).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="text-xs text-gray-600 text-center pt-4 border-t border-gray-300">
            <p>This is a computer-generated document. No signature required.</p>
            <p className="mt-2">
              Generated on {new Date(challan.createdAt).toLocaleDateString()} at{' '}
              {new Date(challan.createdAt).toLocaleTimeString()}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
