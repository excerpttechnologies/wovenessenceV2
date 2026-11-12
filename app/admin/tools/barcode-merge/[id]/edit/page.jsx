'use client';

import { use } from 'react';
import BarcodeMergeForm from '@/components/BarcodeMergeForm';

/* Tools > Barcode Merge > Edit draft.

   Only a Draft is editable. The merged barcode number reserved on the draft
   is kept, and no stock moves until the draft is finalized. */
export default function EditBarcodeMergePage({ params }) {
  const { id } = use(params);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[18px] font-bold tracking-tight">Edit Barcode Merge Draft</h1>
        <p className="text-[12.5px] text-inkmuted">
          Change the sources, merged UOM or approved prices, then update the draft or finalize it. No stock has moved yet.
        </p>
      </div>
      <BarcodeMergeForm draftId={id} />
    </div>
  );
}
