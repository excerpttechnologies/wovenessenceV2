'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Stock Movement Report */

export default function StockMovementReportPage() {
  return <ReportView spec={REPORT} />;
}
