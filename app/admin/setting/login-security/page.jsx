'use client';
import SingleFormView from '@/components/SingleFormView';
import { FIELDS } from './fields';

/* Login Security - one record per scope. This file IS the page. */

const CONFIG = {
  title: "Login Security",
  basePath: '/admin/setting/',
  slugPath: "login-security",
  endpoint: '/api/login-security',
  scope: ["business"],
  fields: FIELDS,
};

export default function LoginsecurityPage() {
  return <SingleFormView cfg={CONFIG} />;
}
