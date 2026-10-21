'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Customer Outstanding Report */

export default function CustomerOutstandingReportPage() {
  return <ReportView spec={REPORT} />;
}
