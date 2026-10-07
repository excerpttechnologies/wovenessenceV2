'use client';
import SingleFormView from '@/components/SingleFormView';
import { FIELDS } from './fields';

/* Location Setting - one record per scope. This file IS the page. */

const CONFIG = {
  title: "Location Setting",
  basePath: '/admin/setting/',
  slugPath: "location-setting",
  endpoint: '/api/location-setting',
  scope: ["business","location"],
  fields: FIELDS,
};

export default function LocationsettingPage() {
  return <SingleFormView cfg={CONFIG} />;
}
