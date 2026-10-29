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
     2. What did the operator ask to see?  (company / ERP location filters)

   The second is intersected with the first. A location that the session cannot
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
    Business.find({}).select('_id name businessPrintName isMainBranch').lean(),
    CompanyLocation.find({}).select('_id name businessId city').lean(),
    db.collection('branches').find({ isDeleted: { $ne: true } }).project({
      branchName: 1, branchCode: 1, erpBusinessId: 1, address: 1, status: 1,
      lifecycleStage: 1, isDeleted: 1,
    }).toArray(),
  ]);

  const businessById = new Map(businesses.map((b) => [String(b._id), b]));

  const locationIds = [...new Set((session?.locationIds || []).map(String).filter(Boolean))];
  const unrestricted = locationIds.length === 0;
  const allowedLocations = unrestricted ? locations : locations.filter((l) => locationIds.includes(String(l._id)));
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
  const authorizedBusinesses = businesses
    .filter((b) => unrestricted || allowedFromLocations.has(String(b._id)))
    .map((b) => ({
      businessId: String(b._id),
      name: String(b.name || b.businessPrintName || '(untitled)'),
      isMainBranch: Boolean(b.isMainBranch),
    }))
    .sort((a, b) => {
      if (a.isMainBranch !== b.isMainBranch) return a.isMainBranch ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const authorizedLocations = allowedLocations
    .filter((location) => unrestricted || allowedFromLocations.has(String(location.businessId || '')))
    .map((location) => ({
      locationId: String(location._id),
      name: String(location.name || '(untitled)'),
      city: String(location.city || ''),
      businessId: String(location.businessId || ''),
    }))
    .filter((location) => location.businessId && businessById.has(location.businessId))
    .sort((a, b) => a.name.localeCompare(b.name) || a.city.localeCompare(b.city));

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
    businesses,
    authorizedBusinesses,
    authorizedLocations,
    authorizedBranches,
    branchByBusiness,
    businessById,
    allowedLocationIds: unrestricted
      ? null
      : new Set(allowedLocations.map((location) => String(location._id))),
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

  let location = null;
  if (rawBranch) {
    location = access.authorizedLocations.find(
      (candidate) => candidate.locationId === rawBranch
    ) || null;
    if (!location) {
      throw new DashboardError(403, 'You do not have access to that location.', {
        code: 'WRONG_BRANCH', field: 'branch',
      });
    }
  }

  if (company && location && location.businessId !== company) {
    throw new DashboardError(422, 'The selected location does not belong to the selected company.', {
      field: 'branch', code: 'MISMATCHED_FILTERS',
    });
  }

  const selectedBusinessId = location?.businessId || company || '';
  const selectedBusinessIds = selectedBusinessId ? new Set([selectedBusinessId]) : null;

  const companyLabel = selectedBusinessId
    ? (access.businessById.get(selectedBusinessId)?.name
      || access.businessById.get(selectedBusinessId)?.businessPrintName
      || '')
    : 'All companies';
  const branchLabel = location
    ? [location.name, location.city].filter(Boolean).join(' · ')
    : 'All branches';
  const channelLabel = CHANNELS.find((c) => c.value === rawChannel)?.label || 'All channels';

  return {
    company: selectedBusinessId || '',
    branch: location?.locationId || '',
    selectedLocation: location,
    channel: rawChannel,
    financialYear: rawFy,
    companyLabel,
    branchLabel,
    channelLabel,
    selectedBusinessId,
    selectedBusinessIds,
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
