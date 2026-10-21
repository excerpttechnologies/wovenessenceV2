'use client';
import CashRegisterList from '@/components/CashRegisterList';

/* Cash Register -> Cash Registers.

   One session per open-to-close cycle. The list owns its own table rather
   than using ListView, because the row action is a labelled Close button
   that opens a dialog - see the note at the top of the component. */

export default function CashRegisterPage() {
  return <CashRegisterList />;
}
