'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Sales Person Report */

export default function SalesPersonReportPage() {
  return <ReportView spec={REPORT} />;
}
