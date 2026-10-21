'use client';
import SingleFormView from '@/components/SingleFormView';
import { FIELDS } from './fields';

/* E-commerce Settings - one record per scope. This file IS the page. */

const CONFIG = {
  title: "E-commerce Settings",
  basePath: '/admin/setting/',
  slugPath: "ecom_setting",
  endpoint: '/api/ecom-setting',
  scope: ["business"],
  fields: FIELDS,
};

export default function EcomsettingPage() {
  return <SingleFormView cfg={CONFIG} />;
}
