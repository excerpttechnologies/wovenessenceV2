'use client';

import BarcodeMergeForm from '@/components/BarcodeMergeForm';

/* Tools > Barcode Merge > Add */
export default function AddBarcodeMergePage() {
  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[18px] font-bold tracking-tight">Create Barcode Merge</h1>
        <p className="text-[12.5px] text-inkmuted">
          Combine compatible source barcodes into one merged barcode. Stock moves only when the merge is finalized.
        </p>
      </div>
      <BarcodeMergeForm />
    </div>
  );
}
