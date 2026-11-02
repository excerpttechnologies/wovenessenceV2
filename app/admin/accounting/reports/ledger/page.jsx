'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Accounts > Ledger */

export default function LedgerReportPage() {
  return <ReportView spec={REPORT} />;
}
