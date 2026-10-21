'use client';
import LedgerTransactionView from '@/components/LedgerTransactionView';

/* Ledger Transactions - /admin/ledger-transaction

   The whole module is this one screen: a filter card over a read-only list of
   Dr / Cr entries. Nothing is created here.

   Entries are DERIVED from the documents that caused them, because this
   project has no posting engine - see the note at the top of fields.js. */

export default function LedgerTransactionPage() {
  return <LedgerTransactionView />;
}
