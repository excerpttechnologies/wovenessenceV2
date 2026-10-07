

'use client';
import BarcodeSettingsView from '@/components/BarcodeSettingsView';

/* Barcode Settings - /admin/setting/barcodesetting

   The list, the Add overlay and the Edit dialog all live in one view, which
   is how the deployed screen behaves: Add and Edit open over the list rather
   than navigating to their own routes. That is why this page has no add/ or
   [id]/ folder beside it, unlike the other masters. */

export default function BarcodesettingPage() {
  return <BarcodeSettingsView />;
}