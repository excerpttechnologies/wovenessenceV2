'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Accounts > Balance Sheet */

export default function BalanceSheetReportPage() {
  return <ReportView spec={REPORT} />;
}
