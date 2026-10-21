'use client';
import ChoiceTableView from '@/components/ChoiceTableView';

/* Invoice Layout Settings - one record per scope. This file IS the page. */

const CONFIG = {
  title: "Invoice Layout Settings",
  basePath: '/admin/setting/',
  slugPath: "invoice-layout-setting",
  endpoint: '/api/invoice-layout-setting',
  scope: ["business","location"],
  choice: {
    "nameHeader": "Layout Name",
    "extraCols": [],
    "catalog": "invoiceLayouts"
  },
};

export default function InvoicelayoutsettingPage() {
  return <ChoiceTableView cfg={CONFIG} />;
}
