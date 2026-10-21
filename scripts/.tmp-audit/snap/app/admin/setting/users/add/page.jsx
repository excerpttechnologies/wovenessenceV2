'use client';
import FormView from '@/components/FormView';
import { CONFIG } from '../fields';

export default function AddUserPage() {
  return <FormView cfg={CONFIG} slug="users" />;
}
