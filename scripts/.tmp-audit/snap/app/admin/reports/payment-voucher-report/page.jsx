'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Payment Voucher Report */

export default function PaymentVoucherReportPage() {
  return <ReportView spec={REPORT} />;
}
