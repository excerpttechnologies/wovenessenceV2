'use client';

import { use } from 'react';
import BarcodeSplitForm from '@/components/BarcodeSplitForm';

/* Tools > Barcode Split > Edit draft.

   Only a Draft is editable. The form keeps the child numbers the draft
   already reserved and updates the same document. */
export default function EditBarcodeSplitPage({ params }) {
  const { id } = use(params);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-[18px] font-bold tracking-tight">Edit Barcode Split Draft</h1>
        <p className="text-[12.5px] text-inkmuted">
          Update the quantities and prices, then save the draft or finalize it. No stock has moved yet.
        </p>
      </div>
      <BarcodeSplitForm draftId={id} />
    </div>
  );
}
