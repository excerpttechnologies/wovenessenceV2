'use client';
import VoucherList from '@/components/VoucherList';
import { SPECS, PAYMENT } from '../fields';

/* Voucher -> Payment Vouchers. Money out: debits the supplier, credits the
   bank or cash it came from, and optionally credits a discount ledger so the
   supplier account still clears in full. */

export default function PaymentVouchersPage() {
  return <VoucherList spec={SPECS[PAYMENT]} />;
}
