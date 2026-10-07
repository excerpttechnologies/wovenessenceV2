'use client';
import VoucherList from '@/components/VoucherList';
import { SPECS, RECEIPT } from '../fields';

/* Voucher -> Receipt Vouchers. Money in: credits the customer, debits the
   bank or cash account it landed in. */

export default function ReceiptVouchersPage() {
  return <VoucherList spec={SPECS[RECEIPT]} />;
}
