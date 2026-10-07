'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Logistics - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Logistics",
  basePath: '/admin/',
  slugPath: "logistic",
  endpoint: '/api/logistic',
  scope: ["business","location"],
  addTitle: "Add Logistic",
  formMode: "modal",
  modalWide: true,
  showRefresh: false,
  actionIcons: ["view"],
  columns: [
    { k: "logisticNo", t: "Logistic No" },
    { k: "vehicleNo", t: "Vehicle No" },
    { k: "paymentStatus", t: "Status" },
    { k: "shippingType", t: "Shipping Type" },
    { k: "ewayBillNo", t: "Eway Bill No" },
    { k: "logisticDate", t: "Logistic Date", f: "date" },
  ],
  fields: FIELDS,
};

export default function LogisticListPage() {
  return <ListView cfg={CONFIG} />;
}
