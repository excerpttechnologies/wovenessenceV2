'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Accounts > Profit & Loss */

export default function ProfitLossReportPage() {
  return <ReportView spec={REPORT} />;
}
