'use client';
import ReportView from '@/components/ReportView';
import { REPORT } from './fields';

/* Accounts > Bank & Cash */

export default function BankCashReportPage() {
  return <ReportView spec={REPORT} />;
}
