/* Scope and authorisation for the dashboard APIs.

   The existing dashboard accepts business/location from the query string,
   like every report in the project. The difference here is that a session
   restricted to particular branches cannot widen that restriction by editing
   the URL: the requested location must be one the account holds, and with no
   location named the query is narrowed to all the locations it holds. */

import { isValidObjectId, Types } from 'mongoose';
import { AuthzError } from '@/lib/rbac';

export function objectId(value) {
  return value && isValidObjectId(String(value)) ? new Types.ObjectId(String(value)) : null;
}

function allowedLocations(session) {
  return [...new Set((session?.locationIds || []).map(String).filter((id) => isValidObjectId(id)))];
}

export function dashboardScope(searchParams, session) {
  const requestedBusiness = objectId(searchParams.get('business'));
  const requestedLocation = objectId(searchParams.get('location'));
  const allowed = allowedLocations(session).map(objectId);

  if (requestedLocation && allowed.length && !allowed.some((id) => String(id) === String(requestedLocation))) {
    throw new AuthzError(403, 'Your account is not assigned to that location.', 'WRONG_LOCATION');
  }

  const locationIds = requestedLocation
    ? [requestedLocation]
    : allowed;

  return {
    businessId: requestedBusiness,
    locationId: requestedLocation,
    locationIds,
    finYear: String(searchParams.get('finYear') || '').trim(),
  };
}

/* Transaction collections carry ObjectId business/location ids. */
export function transactionFilter(scope) {
  const filter = {};
  if (scope.businessId) filter.businessId = scope.businessId;
  if (scope.locationId) filter.locationId = scope.locationId;
  else if (scope.locationIds?.length) filter.locationId = { $in: scope.locationIds };
  if (scope.finYear) filter.finYear = scope.finYear;
  return filter;
}

/* BarcodeLabel is the exception: its businessId/locationId are stored as
   strings, while currentLocationId is a real ObjectId. Matching the wrong
   type silently returns no stock, so it gets its own filter. */
export function stockFilter(scope) {
  const filter = { status: 'IN_STOCK' };
  if (scope.businessId) filter.businessId = String(scope.businessId);
  if (scope.locationId) filter.currentLocationId = scope.locationId;
  else if (scope.locationIds?.length) filter.currentLocationId = { $in: scope.locationIds };
  return filter;
}

/* Website events are business-scoped. A location is only applied when one
   was explicitly asked for - storefront sessions do not necessarily know
   which physical branch they belong to, and filtering by the dashboard's
   default warehouse would hide every event.

   When the account is restricted to particular locations but has not named
   one, events carrying another branch's location must still stay out. The
   allowed locations AND the locationless events are admitted; nothing else
   is. */
export function websiteEventFilter(scope) {
  const filter = {};
  if (scope.businessId) filter.businessId = scope.businessId;
  if (scope.locationId) {
    filter.locationId = scope.locationId;
  } else if (scope.locationIds?.length) {
    filter.$or = [
      { locationId: { $in: scope.locationIds } },
      { locationId: null },
    ];
  }
  return filter;
}

export function scopeDescription(scope, session) {
  return {
    businessId: scope.businessId ? String(scope.businessId) : '',
    locationId: scope.locationId ? String(scope.locationId) : '',
    finYear: scope.finYear,
    restrictedToAssignedLocations: Boolean(scope.locationIds?.length),
    allowedLocationCount: (session?.locationIds || []).length,
  };
}
