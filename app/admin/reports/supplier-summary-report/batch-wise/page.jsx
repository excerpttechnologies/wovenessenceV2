'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Supplier Summary Report -> Bill-wise -> Batch-wise */

export default function SupplierBatchWiseReportPage() {
  return <ReportView spec={REPORT} />;
}
