'use client';
import VoucherList from '@/components/VoucherList';
import { SPECS, CONTRA } from '../fields';

/* Voucher -> Contra Vouchers. A transfer between the business's own bank and
   cash accounts - no party is involved, which is why this list has no filter
   card and shows To / From instead of a name. */

export default function ContraVouchersPage() {
  return <VoucherList spec={SPECS[CONTRA]} />;
}
