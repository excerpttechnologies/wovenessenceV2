'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Supplier Bill Report */

export default function SupplierBillReportPage() {
  return <ReportView spec={REPORT} />;
}
