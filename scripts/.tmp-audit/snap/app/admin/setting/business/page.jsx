// 'use client';
// import ListView from '@/components/ListView';

// /* Business - list. Columns are declared here, not fetched from a registry. */

// const CONFIG = {
//   title: "Business",
//   basePath: '/admin/setting/',
//   slugPath: "business",
//   endpoint: '/api/business',
//   scope: [],
//   columns: [
//     { k: "name", t: "Business Name" },
//     { k: "zipCode", t: "Zip Code" },
//     { k: "state", t: "State" },
//     { k: "city", t: "City" },
//     { k: "isActive", t: "Is Active", f: "activeText" },
//   ],
// };

// export default function BusinessListPage() {
//   return <ListView cfg={CONFIG} />;
// }


'use client';
import ListView from '@/components/ListView';

/* Business - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "Business",
  basePath: '/admin/setting/',
  slugPath: "business",
  endpoint: '/api/business',
  scope: [],
  columns: [
    {
      k: "name",
      t: "Business Name",
      /* The seeded main store carries isMainBranch; everything added through
         this page is a sub-branch of it. Keyed off the stored flag rather
         than the name, so renaming the main store doesn't lose the label. */
      badge: (row) => (row.isMainBranch ? { label: 'Main Branch', tone: 'green' } : null),
    },
    { k: "zipCode", t: "Zip Code" },
    { k: "state", t: "State" },
    { k: "city", t: "City" },
    { k: "isActive", t: "Is Active", f: "activeText" },
  ],
};

export default function BusinessListPage() {
  return <ListView cfg={CONFIG} />;
}