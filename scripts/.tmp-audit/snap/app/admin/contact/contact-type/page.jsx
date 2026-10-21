'use client';
import ListView from '@/components/ListView';
import { FIELDS } from './fields';

/* Contact Types - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Contact Types",
  basePath: '/admin/contact/',
  slugPath: "contact-type",
  endpoint: '/api/contact-type',
  scope: ["business"],
  addTitle: "Add Contact Type",
  formMode: "modal",
  columns: [
    { k: "name", t: "Type Name" },
    { k: "contactType", t: "Contact Type" },
    { k: "prefix", t: "Prefix" },
    { k: "status", t: "Status" },
    { k: "businessId", t: "Business Name", f: "ref" },
  ],
  fields: FIELDS,
};

export default function ContacttypeListPage() {
  return <ListView cfg={CONFIG} />;
}
