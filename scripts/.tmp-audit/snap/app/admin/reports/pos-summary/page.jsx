'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> POS Summary Report */

export default function PosSummaryReportPage() {
  return <ReportView spec={REPORT} />;
}
