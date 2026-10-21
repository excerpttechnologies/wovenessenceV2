'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Receipt Voucher Report */

export default function ReceiptVoucherReportPage() {
  return <ReportView spec={REPORT} />;
}
