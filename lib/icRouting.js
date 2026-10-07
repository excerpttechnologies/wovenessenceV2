import Business from '@/models/Business';

/* ==========================================================================
   INTER COMPANY ROUTING — who a branch may send goods to.

   Any branch to any other branch, directly. Nothing mediates, nothing is
   approved on the way.

   WHAT WAS REMOVED. This module used to route every transfer through the main
   branch's warehouse: a child could only pick the hub, then later could pick
   any branch but the hub was stamped onto the document as viaBusinessId /
   viaLocationId. That went with it - resolveHub(), isHub(), routeVia() and
   the hub checks inside checkHubRoute().

   The DATA behind it is untouched and still correct, so this can be put back
   without a migration: Business.isMainBranch and Business.parentBusinessId
   still mark the hierarchy, and CompanyLocation.isMediator still flags the
   warehouse. Nothing reads them at runtime now.
   ========================================================================== */

/* Who `businessId` may send inter company goods to: every other branch.

   Returns rows shaped like /api/options so a form can drop them straight into
   a <select>. */
export async function allowedDestinations(businessId) {
  if (!businessId) return { options: [] };

  const others = await Business.find({ _id: { $ne: businessId } })
    .select('_id name').sort({ name: 1 }).lean();

  return {
    options: others.map((b) => ({ value: String(b._id), label: b.name || '(unnamed)' })),
  };
}

/* The guard the write routes call.

   Returns null when the pair is allowed, or a { error, code } object to be
   sent back as 422. Enforced on the SERVER as well as in the dropdown because
   every route in this module takes businessId and toBusinessId straight from
   the request body - a restricted <select> stops an honest mistake, not a
   crafted request.

   Only one rule left: a branch cannot send to itself. */
export async function checkRoute(fromBusinessId, toBusinessId) {
  if (!fromBusinessId || !toBusinessId) {
    return { error: 'Both the sending and receiving branch are required.', code: 'BAD_ROUTE' };
  }
  if (String(fromBusinessId) === String(toBusinessId)) {
    return { error: 'A branch cannot send inter company goods to itself.', code: 'SAME_BRANCH' };
  }
  return null;
}
