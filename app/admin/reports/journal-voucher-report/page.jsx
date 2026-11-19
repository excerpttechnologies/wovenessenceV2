'use client';

import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

export default function JournalVoucherReportPage() {
  return <ReportView spec={REPORT} />;
}
