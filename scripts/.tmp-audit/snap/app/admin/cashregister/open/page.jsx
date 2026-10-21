'use client';
import CashRegisterOpenView from '@/components/CashRegisterOpenView';

/* Cash Register -> Open Register.

   Shows whichever register is open for the business + location in the top
   bar. Takes no id: there is at most one open at a time, which the API
   enforces. */

export default function CashRegisterOpenPage() {
  return <CashRegisterOpenView />;
}
