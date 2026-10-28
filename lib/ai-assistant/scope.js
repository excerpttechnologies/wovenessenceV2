/* Authorisation and filter resolution for the AI Business Assistant.

   The assistant may only see what the signed-in session may see. Nothing is
   accepted from the browser as proof of access:

     session.locationIds  ->  the locations this account may act on
     those locations      ->  the companies and storefront branches allowed

   lib/dashboard/access.js already answers that question for the sales
   dashboard, so it is reused here rather than re-implemented. What this
   module adds is the translation from human language ("Suvarna", "this
   branch", "Instagram") into that authorised filter set, and a hard refusal
   when a filter names something outside it.

   THE RULE: a name that matches nothing is ignored (the question was
   probably about something else), but an id or name that DOES match an
   unauthorised company or branch is a 403, not a silent omission. Silently
   dropping it would turn "show me Suvarna's sales" into "show me everything",
   which is the opposite of what was asked and a data leak besides.
   ========================================================================== */

import { loadDashboardOptions } from '@/lib/dashboard/access';

export class ScopeError extends Error {
  constructor(status, message, code = 'FORBIDDEN') {
    super(message);
    this.name = 'ScopeError';
    this.status = status;
    this.code = code;
  }
}

export const CHANNELS = [
  { value: 'all', label: 'All channels' },
  { value: 'offline', label: 'Offline store' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'website', label: 'E-commerce website' },
];

const CHANNEL_VALUES = new Set(CHANNELS.map((c) => c.value));

function normaliseChannel(value) {
  const raw = String(value || 'all').trim().toLowerCase();
  if (raw === 'online' || raw === 'ecommerce' || raw === 'e-com' || raw === 'web') return 'website';
  if (raw === 'store' || raw === 'retail' || raw === 'pos') return 'offline';
  if (raw === 'insta') return 'instagram';
  return CHANNEL_VALUES.has(raw) ? raw : 'all';
}

function normaliseText(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function words(value) {
  return normaliseText(value).split(' ').filter((w) => w.length > 2);
}

/* A loose but conservative name match: every meaningful word of the query
   must appear in the candidate. "temple fabrics" matches "TEMPLE FABRICS,
   SILKS & SAREES"; "suvarna" matches "SUVARNA FABRICS". */
function matchesName(query, candidate) {
  const q = normaliseText(query);
  const c = normaliseText(candidate);
  if (!q || !c) return false;
  if (q === c) return true;
  if (c.includes(q)) return true;
  const qWords = words(q);
  return qWords.length > 0 && qWords.every((w) => c.includes(w));
}

export async function createScope(session) {
  /* Reports permission is the existing gate on every analytics screen; the
     assistant reads the same data, so it holds the same gate. */
  if (!session) throw new ScopeError(401, 'Sign in to use the business assistant.', 'UNAUTHENTICATED');

  /* Imported here, not at module scope: lib/rbac reads the request cookie
     through next/headers, and this module is also exercised by a plain Node
     test that has no request. A static import would drag the request runtime
     into that test. */
  const { requirePermission, PERMISSIONS } = await import('@/lib/rbac');
  await requirePermission(PERMISSIONS.REPORTS_VIEW);

  const access = await loadDashboardOptions(session);
  return scopeFromAccess(session, access);
}

/* The part that needs no HTTP request context, so the test script can build
   the exact same scope for a known account without faking a cookie. The
   permission check stays in createScope(); nothing in a route calls this
   directly. */
export function scopeFromAccess(session, access) {
  if (!session) throw new ScopeError(401, 'Sign in to use the business assistant.', 'UNAUTHENTICATED');

  const businessIds = [...access.authorizedBusinessIds].map(String);
  if (!businessIds.length) {
    throw new ScopeError(403, 'This account has no branch assigned, so there is no business data to report on.', 'NO_SCOPE');
  }

  const locationIds = access.allowedLocationIds ? [...access.allowedLocationIds].map(String) : null;
  const businesses = access.authorizedBusinesses.map((b) => ({
    businessId: String(b.businessId),
    name: String(b.name || ''),
    isMainBranch: Boolean(b.isMainBranch),
  }));
  const branches = access.authorizedBranches.map((b) => ({
    branchId: String(b.branchId),
    branchName: String(b.branchName || b.businessName || ''),
    businessId: String(b.businessId),
    businessName: String(b.businessName || ''),
    city: String(b.city || ''),
    isMainBranch: Boolean(b.isMainBranch),
  }));

  const branchByBusiness = new Map(branches.map((b) => [b.businessId, b]));

  return {
    session,
    db: access.db,
    unrestricted: Boolean(access.unrestricted),
    businessIds,
    locationIds,
    businesses,
    branches,
    branchByBusiness,
    /* Every company the installation has. Used only to tell "that company
       does not exist" apart from "you cannot see that company"; the sales
       queries never read from it. */
    allBusinesses: access.businesses.map((b) => ({ businessId: String(b._id), name: String(b.name || '') })),
  };
}

export function branchLabelOf(scope, businessId) {
  const branch = scope.branchByBusiness.get(String(businessId || ''));
  if (!branch) return 'Unassigned branch';
  return [branch.branchName, branch.city].filter(Boolean).join(' · ');
}

/* Which company (business) did the question name? Only authorised companies
   are considered; an id that exists but is not authorised is a 403. */
export function resolveCompany(scope, query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const byId = scope.businesses.find((b) => b.businessId === raw);
  if (byId) return byId;

  /* An explicit id is a request for THAT company, so an id this session does
     not hold must be refused rather than ignored. A free-text name that
     matches nothing is simply not a filter. */
  if (/^[0-9a-f]{24}$/i.test(raw)) {
    const exists = scope.allBusinesses.find((b) => b.businessId === raw);
    throw new ScopeError(403,
      exists ? `You do not have access to ${exists.name}.` : 'That company could not be found in your scope.',
      'WRONG_COMPANY');
  }

  const byName = scope.businesses.find((b) => matchesName(raw, b.name));
  if (byName) return byName;

  return null;
}

export function resolveBranch(scope, query) {
  const raw = String(query || '').trim();
  if (!raw) return null;

  const byId = scope.branches.find((b) => b.branchId === raw);
  if (byId) return byId;

  /* A company id is resolved by resolveCompany, not here. Any other explicit
     id is a branch request and must exist inside this session's scope. */
  if (/^[0-9a-f]{24}$/i.test(raw) && !scope.businessIds.includes(raw)) {
    throw new ScopeError(403, 'You do not have access to that branch.', 'WRONG_BRANCH');
  }

  const byName = scope.branches.find((b) =>
    matchesName(raw, b.branchName) || matchesName(raw, b.businessName) || matchesName(raw, b.city));
  if (byName) return byName;

  return null;
}

/* Parse the channel a question names. "online" means the website; a POS bill
   is never inferred to be Instagram from a customer name or a note. */
export function resolveChannel(question) {
  const text = String(question || '');
  if (/instagram|\binsta\b/i.test(text)) return 'instagram';
  if (/website|web sales|online|e-?commerce|\becom\b|storefront/i.test(text)) return 'website';
  if (/offline|walk-?in|retail store|\bpos\b|till/i.test(text)) return 'offline';
  return 'all';
}

/* Build the filter set one query will run under.

   `requested` comes from the browser (the chat's filter chips) or from the
   AI tool arguments. Both are untrusted and both are checked here. */
export function resolveFilters(scope, requested = {}, question = '') {
  const fromQuestion = String(question || '');
  const requestedCompany = requested.company || requested.companyId || '';
  const requestedBranch = requested.branch || requested.branchId || '';

  /* The top bar's company selector sends a businessId; the assistant's own
     branch chip sends a storefront branchId. Both are accepted, and each is
     recognised for what it is rather than guessed at by position. */
  const branchFromRequest = scope.branches.find((b) => b.branchId === requestedBranch) || null;
  const companyFromRequest = resolveCompany(scope, requestedCompany)
    || (requestedBranch && !branchFromRequest && scope.businessIds.includes(requestedBranch)
      ? resolveCompany(scope, requestedBranch)
      : null);

  const company = companyFromRequest
    || (!requestedBranch ? resolveCompany(scope, extractCompanyName(scope, fromQuestion)) : null);
  const branch = branchFromRequest
    || (!company && !requestedBranch ? resolveBranch(scope, extractBranchName(scope, fromQuestion)) : null);

  const channel = normaliseChannel(
    requested.channel || (requested.channel === undefined ? resolveChannel(fromQuestion) : 'all')
  );

  if (company && branch && branch.businessId !== company.businessId) {
    throw new ScopeError(422, 'The selected branch does not belong to the selected company.', 'MISMATCHED_FILTERS');
  }

  const businessIds = branch ? [branch.businessId] : company ? [company.businessId] : scope.businessIds;
  const branchLabel = branch
    ? [branch.branchName, branch.city].filter(Boolean).join(' · ')
    : company
      ? branchLabelOf(scope, company.businessId)
      : 'All branches';
  const companyLabel = company
    ? company.name
    : branch
      ? (branch.businessName || branch.branchName)
      : 'All companies';

  return {
    companyId: company?.businessId || branch?.businessId || '',
    companyLabel,
    branchId: branch?.branchId || '',
    branchLabel,
    channel,
    channelLabel: CHANNELS.find((c) => c.value === channel)?.label || 'All channels',
    businessIds,
    locationIds: scope.locationIds,
    /* A branch in this ERP is an operating company; its sales may be recorded
       at any of that business's locations, so the branch filter narrows by
       businessId exactly as the sales dashboard does. */
    businessIdScope: branch ? branch.businessId : (company?.businessId || ''),
    includesWebsite: channel === 'all' || channel === 'website',
    includesErp: channel === 'all' || channel === 'offline' || channel === 'instagram',
  };
}

function extractCompanyName(scope, question) {
  const q = normaliseText(question);
  if (!q) return '';
  const hit = scope.businesses.find((b) => {
    const name = normaliseText(b.name);
    return name && q.includes(name);
  });
  if (hit) return hit.name;
  const short = scope.businesses.find((b) => {
    const first = normaliseText(b.name).split(/[ ,(&]+/).filter((w) => w.length > 4)[0];
    return first && q.includes(first);
  });
  return short?.name || '';
}

function extractBranchName(scope, question) {
  const q = normaliseText(question);
  if (!q) return '';
  const hit = scope.branches.find((b) => {
    const name = normaliseText(b.branchName);
    return name && q.includes(name);
  });
  if (hit) return hit.branchName;
  const city = scope.branches.find((b) => b.city && b.city.length > 3 && q.includes(normaliseText(b.city)));
  return city?.branchName || '';
}

/* What this session may choose from, for the interface's filter chips and
   for the model's system prompt. No ids the session cannot use appear here. */
export function publicScope(scope) {
  return {
    unrestricted: scope.unrestricted,
    companies: scope.businesses.map((b) => ({
      id: b.businessId, name: b.name, isMainBranch: b.isMainBranch,
    })),
    branches: scope.branches.map((b) => ({
      id: b.branchId,
      businessId: b.businessId,
      name: b.branchName,
      city: b.city,
      isMainBranch: b.isMainBranch,
    })),
    channels: CHANNELS,
  };
}
