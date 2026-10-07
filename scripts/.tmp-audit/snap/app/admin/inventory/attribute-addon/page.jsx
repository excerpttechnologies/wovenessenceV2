'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Attribute Addons - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Attribute Addons",
  basePath: '/admin/inventory/',
  slugPath: "attribute-addon",
  endpoint: '/api/attribute-addon',
  scope: ["business"],
  addTitle: "Add Addon Attribute",
  formMode: "modal",
  actionIcons: ["view"],
  columns: [
    { k: "name", t: "Name" },
    { k: "businessId", t: "Business", f: "ref" },
    { k: "status", t: "Status" },
  ],
  fields: FIELDS,
};

export default function AttributeaddonListPage() {
  return <ListView cfg={CONFIG} />;
}
