'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Sales Report */

export default function SalesReportPage() {
  return <ReportView spec={REPORT} />;
}
