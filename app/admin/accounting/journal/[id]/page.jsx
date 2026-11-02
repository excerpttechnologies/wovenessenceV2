'use client';
import { use } from 'react';
import JournalEntryView from '@/components/accounting/JournalEntryView';

/* Accounts > Journal Entries - one journal */

export default function JournalDetailPage({ params }) {
  const { id } = use(params);
  return <JournalEntryView id={id} />;
}
