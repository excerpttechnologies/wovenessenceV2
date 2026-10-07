'use client';
import ListView from '@/components/ListView';
import { LIST } from './fields';

/* Masters -> Users. Who can sign in, what they may do, and where. */
export default function UsersListPage() {
  return <ListView cfg={LIST} />;
}
