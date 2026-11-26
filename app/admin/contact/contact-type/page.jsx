'use client';
import ListView from '@/components/ListView';
import Icon from '@/components/Icon';
import { FIELDS } from './fields';

/* Contact Types - list. Columns declared here, not fetched from a registry. */

const CONFIG = {
  title: "Contact Types",
  basePath: '/admin/contact/',
  slugPath: "contact-type",
  endpoint: '/api/contact-type',
  /* numbered pager with Rows-per-page, and every column header sorts on
     click (components/ListView.jsx) */
  pager: 'numbered',
  sortable: true,
  scope: ["business"],
  addTitle: "Add Contact Type",
  formMode: "modal",
  columns: [
    { k: "name", t: "Type Name" },
    { k: "contactType", t: "Contact Type" },
    { k: "prefix", t: "Prefix" },
    { k: "status", t: "Status" },
    {
      k: "loyaltyPointsApplicable",
      t: "Loyalty Points",
      f: "yesno",
      value: (r) => r.loyaltyPointsApplicable === true,
      render: (r) => {
        const enabled = r.loyaltyPointsApplicable === true;
        return (
          <span className={'pill inline-flex items-center gap-1 ' + (enabled ? 'pill-green' : 'pill-red')}>
            <Icon name={enabled ? 'checkCircle' : 'x'} size={12} stroke={2.2} />
            {enabled ? 'Enabled' : 'Disabled'}
          </span>
        );
      },
    },
    { k: "businessId", t: "Business Name", f: "ref" },
  ],
  fields: FIELDS,
};

export default function ContacttypeListPage() {
  return <ListView cfg={CONFIG} />;
}
