'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Accounts > GST Ledger */

export default function GstLedgerReportPage() {
  return <ReportView spec={REPORT} />;
}
