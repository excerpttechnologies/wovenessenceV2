'use client';
import ListView from '@/components/ListView';

/* Company Locations - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Company Locations",
  basePath: '/admin/setting/',
  slugPath: "companylocations",
  endpoint: '/api/company-location',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business"],
  columns: [
    { k: "name", t: "Name" },
    { k: "landmark", t: "Landmark" },
    { k: "zipCode", t: "Zip Code" },
    { k: "state", t: "State" },
    { k: "city", t: "City" },
    { k: "businessId", t: "Business", f: "ref" },
  ],
};

export default function CompanylocationsListPage() {
  return <ListView cfg={CONFIG} />;
}
