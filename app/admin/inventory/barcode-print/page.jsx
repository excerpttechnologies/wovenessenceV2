import { Suspense } from 'react';
import BarcodePrintLabel from '@/components/BarcodePrintLabel';

/* Inventory -> Print Label.

   The sidebar has linked here since the restructure but the folder was never
   created, so the route 404'd. The component already existed and is shared
   with the GRC list's "Barcode Print" action, which arrives as ?grc=<id>.

   That query string is read with useSearchParams(), which needs a Suspense
   boundary - same reason the POS till page has one. */

export const metadata = { title: 'Barcode Print Label | GROO ERP' };

export default function BarcodePrintPage() {
  return (
    <Suspense
      fallback={
        <div className="card">
          <div className="card-body">
            <span className="spin" />
          </div>
        </div>
      }
    >
      <BarcodePrintLabel />
    </Suspense>
  );
}
