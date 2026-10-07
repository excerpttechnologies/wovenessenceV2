'use client';
import SingleFormView from '@/components/SingleFormView';
import { FIELDS } from './fields';

/* POS Setting - one record per scope. This file IS the page. */

const CONFIG = {
  title: "POS Setting",
  basePath: '/admin/setting/',
  slugPath: "pos_setting",
  endpoint: '/api/pos-setting',
  scope: ["business","location"],
  fields: FIELDS,
};

export default function PossettingPage() {
  return <SingleFormView cfg={CONFIG} />;
}
