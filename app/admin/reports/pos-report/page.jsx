'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> POS Report */

export default function PosReportPage() {
  return <ReportView spec={REPORT} />;
}
