'use client';

import BarcodeSplitForm from '@/components/BarcodeSplitForm';

/* Tools > Barcode Split > Add */
export default function AddBarcodeSplitPage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[18px] font-bold tracking-tight">Create Barcode Split</h1>
        <p className="text-[12.5px] text-inkmuted">
          Split one original barcode into child barcodes. Stock moves only when the split is finalized.
        </p>
      </div>
      <BarcodeSplitForm />
    </div>
  );
}
