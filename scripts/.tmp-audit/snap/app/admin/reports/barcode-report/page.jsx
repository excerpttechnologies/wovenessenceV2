'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> Barcode Report */

export default function BarcodeReportPage() {
  return <ReportView spec={REPORT} />;
}
