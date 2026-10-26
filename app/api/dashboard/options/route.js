import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { CHANNELS, loadDashboardOptions } from '@/lib/dashboard/access';
import {
  defaultPeriod, financialYearLabel, financialYearOf, financialYearOptions, todayInIndia,
} from '@/lib/dashboard/date';

export const dynamic = 'force-dynamic';

const PRIVATE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Vary: 'Cookie',
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: PRIVATE_HEADERS });
}

function fail(err) {
  if (err && err.status && err.message) {
    return json({ error: err.message, code: err.code || 'ERROR', field: err.field || undefined }, err.status);
  }
  console.error('[dashboard/options]', err);
  return json({ error: 'Could not load dashboard filters. Please retry.', code: 'INTERNAL' }, 500);
}

/* Filter vocabulary for the dashboard. Only sessions allowed to view reports
   may enumerate it, and the branch list is already narrowed to the locations
   the session is assigned to by loadDashboardOptions(). */
export async function GET() {
  try {
    const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
    const access = await loadDashboardOptions(session);

    const currentFinancialYear = financialYearOf(todayInIndia());
    const financialYears = financialYearOptions().map((fy) => ({
      ...fy,
      current: fy.value === currentFinancialYear,
    }));
    const fallbackPeriod = defaultPeriod(currentFinancialYear);

    return json({
      companies: access.authorizedBusinesses.map((b) => ({
        value: b.businessId,
        label: b.name,
        isMainBranch: b.isMainBranch,
      })),
      branches: access.authorizedBranches.map((b) => ({
        value: b.branchId,
        label: [b.branchName, b.city].filter(Boolean).join(' · '),
        branchName: b.branchName,
        branchCode: b.branchCode,
        city: b.city,
        companyId: b.businessId,
        companyName: b.businessName,
        isMainBranch: b.isMainBranch,
      })),
      channels: CHANNELS,
      financialYears,
      currentFinancialYear: { value: currentFinancialYear, label: financialYearLabel(currentFinancialYear) },
      defaultPeriod: { startDate: fallbackPeriod.start, endDate: fallbackPeriod.end },
      comparisonOptions: [
        { value: 'previous_period', label: 'Previous period' },
        { value: 'previous_month', label: 'Previous month' },
        { value: 'previous_year', label: 'Previous year' },
        { value: 'none', label: 'No comparison' },
      ],
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      sourceNote:
        'Branch names and cities come from the storefront branches collection mapped to ERP businesses. No branch is invented.',
    });
  } catch (err) {
    return fail(err);
  }
}
