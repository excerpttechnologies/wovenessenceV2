'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Master Stock Report */

export default function MasterStockReportPage() {
  return <ReportView spec={REPORT} />;
}
