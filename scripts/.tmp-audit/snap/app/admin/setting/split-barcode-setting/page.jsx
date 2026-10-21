'use client';
import ListView from '@/components/ListView';

/* Split Barcode Settings - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Split Barcode Settings",
  basePath: '/admin/setting/',
  slugPath: "split-barcode-setting",
  endpoint: '/api/split-barcode-setting',
  scope: ["business","finYear"],
  columns: [
    { k: "useFor", t: "Use For" },
    { k: "prefix", t: "Prefix" },
    { k: "suffix", t: "Suffix" },
    { k: "startNumber", t: "Start Number" },
    { k: "sampleBarcode", t: "Sample Barcode" },
    { k: "effectiveDate", t: "Effective Date", f: "date" },
    { k: "expiryDate", t: "Expiry Date", f: "date" },
    { k: "finYear", t: "Financial Year" },
  ],
};

export default function SplitbarcodesettingListPage() {
  return <ListView cfg={CONFIG} />;
}
