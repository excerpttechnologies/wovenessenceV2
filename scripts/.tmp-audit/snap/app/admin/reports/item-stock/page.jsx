'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Item Stock Report */

export default function ItemStockReportPage() {
  return <ReportView spec={REPORT} />;
}
