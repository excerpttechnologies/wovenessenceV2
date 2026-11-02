'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Accounts > Trial Balance */

export default function TrialBalanceReportPage() {
  return <ReportView spec={REPORT} />;
}
