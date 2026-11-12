'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Supplier Summary Report -> Bill-wise */

export default function SupplierBillWiseReportPage() {
  return <ReportView spec={REPORT} />;
}
