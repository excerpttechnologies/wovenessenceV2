'use client';
import ListView from '@/components/ListView';

/* City Groups - list. Columns are declared here, not fetched from a registry. */

const CONFIG = {
  title: "City Groups",
  basePath: '/admin/setting/',
  slugPath: "citygroup",
  endpoint: '/api/city-group',
  scope: ["business"],
  columns: [
    { k: "groupName", t: "Group Name" },
    { k: "cities", t: "Cities", f: "list" },
    { k: "cities", t: "No. of Cities", f: "count" },
    { k: "createdAt", t: "Created", f: "datetime" },
  ],
};

export default function CitygroupListPage() {
  return <ListView cfg={CONFIG} />;
}
