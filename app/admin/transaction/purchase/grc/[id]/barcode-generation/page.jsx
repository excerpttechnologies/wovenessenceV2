'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import GCRBarcodeGeneration from '@/components/GCRBarcodeGeneration';

export default function GrcBarcodeGenerationPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  /* Also run after every successful Submit (onSaved below), so the grid is
     re-read from the database and shows what was actually saved rather than
     what the browser last held. The data is replaced, never cleared first, so
     the screen - and a print dialog opened by Submit & Print - stays mounted.

     ONE request: GET /api/grc/:id answers with the GRC, its barcode rows AND
     its supplier's Price Calculation Setup, so the form is never shown with
     prices that are not the supplier's. */
  const load = useCallback(() => {
    if (!id) return;
    fetch(`/api/grc/${id}`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((result) => {
        if (result.error) throw new Error(result.error);
        setData(result);
      })
      .catch((loadError) => setError(loadError.message || 'Failed to load GRC'));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-slate-500">Loading GRC and supplier price calculation setup...</div>;

  return (
    <div>
      <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button type="button" className="btn" onClick={() => router.push(`/admin/transaction/purchase/grc/${id}`)}>
          Back to GRC
        </button>
        <div className="text-sm font-semibold">Barcode Generation - {data.grc.grcNumber}</div>
      </div>


        {/* The GRC header is passed as grcHeader for the barcode value every
            barcode of this GRC carries - SUPPLIER_CODE * GRC_NUMBER *
            BILL_SL_NO * SERIAL_NO (lib/barcodeValue.js) - which the grid shows
            before a row is saved. The Bill Sl No. is the row's own, so it is
            not in the header; lastSerialByBill / serialFloorBase /
            lastBarcodeSeq are the serials the GRC has already given, so the
            grid counts on from where the save route will. */}
        <GCRBarcodeGeneration
          grcId={id}
          initialRows={data.rows}
          supplierMarkup={data.grc.supplierMarkup}
          supplierPriceSetup={data.grc.supplierPriceSetup || null}
          grcHeader={{
            grcId: id,
            grcNumber: data.grc.grcNumber || '',
            supplierCode: data.grc.supplierCode || '',
            lastBarcodeSeq: Number(data.grc.lastBarcodeSeq) || 0,
            lastSerialByBill: data.grc.lastSerialByBill,
            serialFloorBase: data.grc.serialFloorBase,
          }}
          onSaved={load}
          editMode
        />
    </div>
  );
}
