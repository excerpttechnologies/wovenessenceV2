'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Supplier Outstanding Report */

export default function SupplierOutstandingReportPage() {
  return <ReportView spec={REPORT} />;
}
