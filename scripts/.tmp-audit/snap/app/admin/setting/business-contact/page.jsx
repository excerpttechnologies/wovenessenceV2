'use client';
import MappingView from '@/components/MappingView';

/* Business Contact Mapping - one record per scope. This file IS the page. */

const CONFIG = {
  title: "Business Contact Mapping",
  basePath: '/admin/setting/',
  slugPath: "business-contact",
  endpoint: '/api/business-contact',
  scope: [],
  mapping: {
    "keyHeader": "Business",
    "valueHeader": "Contact",
    "ref": "business",
    "dynamicRowsFrom": "business"
  },
};

export default function BusinesscontactPage() {
  return <MappingView cfg={CONFIG} />;
}
