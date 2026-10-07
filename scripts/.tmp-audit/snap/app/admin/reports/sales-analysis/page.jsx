'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Sales Analysis */

export default function SalesAnalysisPage() {
  return <ReportView spec={REPORT} />;
}
