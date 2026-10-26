import mongoose, { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';

/* ==========================================================================
   Authorisation and filter resolution for the dashboard.

   The dashboard has its own company / branch filters because it is a
   consolidated report: an operator may deliberately look across all four
   boutiques even while the top-bar is parked on one company. That freedom
   must not become a way around a location restriction, so every request is
   narrowed in two independent steps:

     1. What may this session see at all?  (session.locationIds -> business)
     2. What did the operator ask to see?  (company / branch filters)

   The second is intersected with the first. A branch that the session cannot
   access is rejected with 403 rather than silently omitted, so the client
   cannot mistake "not allowed" for "no sales".

   Nothing here is cached: the response is always private to one session.
   ========================================================================== */

export class DashboardError extends Error {
  constructor(status, message, { code = '', field = '' } = {}) {
    super(message);
    this.name = 'DashboardError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

export const CHANNELS = [
  { value: 'all', label: 'All channels' },
  { value: 'website', label: 'E-commerce Website' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'offline', label: 'Offline Store' },
];

const CHANNEL_VALUES = new Set(CHANNELS.map((c) => c.value));

function validOid(value) {
  return value && isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

function cityOf(branch) {
  return String(branch?.address?.city || branch?.branchCity || '').trim();
}

export async function loadDashboardOptions(session) {
  if (!String(process.env.MONGODB_URI || '').trim()) {
    throw new DashboardError(
      503,
      'The dashboard database is not configured. Set MONGODB_URI and try again.',
      { code: 'DATABASE_NOT_CONFIGURED' }
    );
  }
  await dbConnect();
  const db = mongoose.connection.db;

  const [businesses, locations, branchDocs] = await Promise.all([
    Business.find({}).select('_id name isMainBranch').lean(),
    CompanyLocation.find({}).select('_id name businessId').lean(),
    db.collection('branches').find({ isDeleted: { $ne: true } }).project({
      branchName: 1, branchCode: 1, erpBusinessId: 1, address: 1, status: 1,
      lifecycleStage: 1, isDeleted: 1,
    }).toArray(),
  ]);

  const businessById = new Map(businesses.map((b) => [String(b._id), b]));
  const locationById = new Map(locations.map((l) => [String(l._id), l]));

  const locationIds = [...new Set((session?.locationIds || []).map(String).filter(Boolean))];
  const unrestricted = locationIds.length === 0;
  const allowedLocations = unrestricted ? [] : locations.filter((l) => locationIds.includes(String(l._id)));
  const allowedFromLocations = new Set(
    unrestricted ? [] : allowedLocations.map((l) => String(l.businessId || '')).filter(Boolean)
  );

  const authorizedBranches = branchDocs
    .filter((b) => b.erpBusinessId && (!b.status || b.status === 'active'))
    .filter((b) => unrestricted || allowedFromLocations.has(String(b.erpBusinessId)))
    .map((b) => {
      const business = businessById.get(String(b.erpBusinessId));
      return {
        branchId: String(b._id),
        branchCode: String(b.branchCode || ''),
        branchName: String(b.branchName || business?.name || ''),
        businessId: String(b.erpBusinessId),
        businessName: String(business?.name || b.branchName || ''),
        city: cityOf(b),
        isMainBranch: Boolean(business?.isMainBranch),
      };
    })
    .sort((a, b) => {
      if (a.isMainBranch !== b.isMainBranch) return a.isMainBranch ? -1 : 1;
      return a.branchName.localeCompare(b.branchName);
    });

  /* The ERP may hold businesses that have no storefront branch record yet.
     They stay visible as companies (and their sales surface as unassigned
     branch revenue), but they never invent a branch row. */
  const branchBusinessIds = new Set(authorizedBranches.map((b) => b.businessId));
  const authorizedBusinesses = businesses
    .filter((b) => unrestricted || allowedFromLocations.has(String(b._id)))
    .filter((b) => branchBusinessIds.size === 0 || branchBusinessIds.has(String(b._id)))
    .map((b) => ({
      businessId: String(b._id),
      name: String(b.name || ''),
      isMainBranch: Boolean(b.isMainBranch),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  /* If a restricted account sits on a business with no storefront branch,
     still allow that business as a company so its own sales are not hidden. */
  if (unrestricted) {
    const known = new Set(authorizedBusinesses.map((b) => b.businessId));
    businesses.forEach((b) => {
      if (!known.has(String(b._id)) && branchBusinessIds.has(String(b._id))) {
        authorizedBusinesses.push({
          businessId: String(b._id),
          name: String(b.name || ''),
          isMainBranch: Boolean(b.isMainBranch),
        });
      }
    });
  }

  const branchByBusiness = new Map();
  authorizedBranches.forEach((b) => {
    if (!branchByBusiness.has(b.businessId)) branchByBusiness.set(b.businessId, b);
  });

  return {
    db,
    unrestricted,
    locationIds,
    allowedLocations,
    allowedFromLocations,
    branchBusinessIds,
    businesses,
    authorizedBusinesses,
    authorizedBranches,
    branchByBusiness,
    businessById,
    locationById,
    allowedLocationIds: unrestricted ? null : new Set(locationIds),
    authorizedBusinessIds: unrestricted
      ? new Set(businesses.map((b) => String(b._id)))
      : allowedFromLocations,
  };
}

export function parseFilters(sp, access) {
  const rawCompany = String(sp.get('company') || '').trim();
  const rawBranch = String(sp.get('branch') || '').trim();
  const rawChannel = String(sp.get('channel') || 'all').trim();
  const rawFy = String(sp.get('financialYear') || '').trim();

  if (rawCompany && !validOid(rawCompany)) {
    throw new DashboardError(422, 'company must be a valid id.', { field: 'company', code: 'INVALID_FILTER' });
  }
  if (rawBranch && !validOid(rawBranch)) {
    throw new DashboardError(422, 'branch must be a valid id.', { field: 'branch', code: 'INVALID_FILTER' });
  }
  if (!CHANNEL_VALUES.has(rawChannel)) {
    throw new DashboardError(422, 'channel must be all, website, instagram or offline.', {
      field: 'channel', code: 'INVALID_FILTER',
    });
  }

  let company = rawCompany || '';
  if (company && !access.authorizedBusinessIds.has(company)) {
    throw new DashboardError(403, 'You do not have access to that company.', {
      code: 'WRONG_COMPANY', field: 'company',
    });
  }

  let branch = null;
  if (rawBranch) {
    branch = access.authorizedBranches.find(
      (b) => b.branchId === rawBranch || b.businessId === rawBranch
    ) || null;
    if (!branch) {
      throw new DashboardError(403, 'You do not have access to that branch.', {
        code: 'WRONG_BRANCH', field: 'branch',
      });
    }
  }

  if (company && branch && branch.businessId !== company) {
    throw new DashboardError(422, 'The selected branch does not belong to the selected company.', {
      field: 'branch', code: 'MISMATCHED_FILTERS',
    });
  }

  const selectedBusinessId = branch?.businessId || company || '';
  const selectedBusinessIds = selectedBusinessId ? new Set([selectedBusinessId]) : null;

  const companyLabel = selectedBusinessId
    ? (access.businessById.get(selectedBusinessId)?.name || branch?.businessName || '')
    : 'All companies';
  const branchLabel = branch
    ? [branch.branchName, branch.city].filter(Boolean).join(' · ')
    : 'All branches';
  const channelLabel = CHANNELS.find((c) => c.value === rawChannel)?.label || 'All channels';

  return {
    company: selectedBusinessId || '',
    branch: branch?.branchId || '',
    branchBusinessId: branch?.businessId || '',
    channel: rawChannel,
    financialYear: rawFy,
    companyLabel,
    branchLabel,
    channelLabel,
    selectedBusinessId,
    selectedBusinessIds,
    selectedBranch: branch,
  };
}

export function businessQueryIds(access, filters) {
  if (filters.selectedBusinessIds) return [...filters.selectedBusinessIds];
  return [...access.authorizedBusinessIds];
}

export function branchForBusiness(access, businessId) {
  return access.branchByBusiness.get(String(businessId || '')) || null;
}

export function assertReadableBranch(access, branch) {
  if (!branch) return;
  if (!access.authorizedBranches.some((b) => b.branchId === branch.branchId)) {
    throw new DashboardError(403, 'You do not have access to that branch.', { code: 'WRONG_BRANCH' });
  }
}
