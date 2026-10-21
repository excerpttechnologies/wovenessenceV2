'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Reports -> POS Credit Note Report */

export default function PosCreditNoteReportPage() {
  return <ReportView spec={REPORT} />;
}
