'use client';
import ListView from '@/components/ListView';

/* Stock Adjustments - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Stock Adjustments",
  basePath: '/admin/inventory/',
  slugPath: "stock-adjustment",
  endpoint: '/api/stock-adjustment',
  scope: ["business","location","finYear"],
  addTitle: "Stock Adjustment",
  actionIcons: ["view"],
  columns: [
    { k: "adjustmentNo", t: "Adjustment No" },
    { k: "type", t: "Type" },
    { k: "createdAt", t: "Creadted On", f: "date" },
    { k: "adjustmentReason", t: "Reason" },
    { k: "createdBy", t: "Created By" },
  ],
};

export default function StockadjustmentListPage() {
  return <ListView cfg={CONFIG} />;
}
