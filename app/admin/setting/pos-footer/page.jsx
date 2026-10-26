'use client';
import ListView from '@/components/ListView';

/* POS Footer Templates - list (26-10-2026). The footer picked on the POS
   invoice print page comes from here. */

const CONFIG = {
  title: "POS Footer Templates",
  basePath: '/admin/setting/',
  slugPath: "pos-footer",
  endpoint: '/api/pos-footer-template',
  pager: 'numbered',
  sortable: true,
  scope: ["business"],
  columns: [
    { k: "templateName", t: "Template Name" },
    { k: "reviewText", t: "Review Text" },
    { k: "reviewUrl", t: "Google Review Link" },
    { k: "ecommerceName", t: "E-commerce Name" },
    { k: "ecommerceUrl", t: "E-commerce Link" },
    { k: "instagramUrl", t: "Instagram Link" },
    { k: "communityUrl", t: "Community Link" },
    { k: "status", t: "Status" },
    { k: "businessId", t: "Business", f: "ref" },
  ],
};

export default function PosFooterListPage() {
  return <ListView cfg={CONFIG} />;
}
