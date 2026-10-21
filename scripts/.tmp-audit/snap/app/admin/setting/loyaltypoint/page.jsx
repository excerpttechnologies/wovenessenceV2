'use client';
import SingleFormView from '@/components/SingleFormView';
import { SECTIONS } from './fields';

/* Loyalty Point - one record per scope. This file IS the page. */

const CONFIG = {
  title: "Loyalty Point",
  basePath: '/admin/setting/',
  slugPath: "loyaltypoint",
  endpoint: '/api/loyalty-point',
  scope: ["business"],
  sections: SECTIONS,
};

export default function LoyaltypointPage() {
  return <SingleFormView cfg={CONFIG} />;
}
