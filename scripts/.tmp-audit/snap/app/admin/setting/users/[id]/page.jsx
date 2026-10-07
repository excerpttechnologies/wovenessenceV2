'use client';
import { useParams } from 'next/navigation';
import FormView from '@/components/FormView';
import { CONFIG } from '../fields';

export default function EditUserPage() {
  const { id } = useParams();
  return <FormView cfg={{ ...CONFIG, addTitle: 'Edit User' }} id={id} slug="users" />;
}
