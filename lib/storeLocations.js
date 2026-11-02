import { isValidObjectId } from 'mongoose';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';

/* ==========================================================================
   WHICH STORES MAY RECEIVE AN INTER STORE SELL DOCUMENT.

   The destination of an inter store transfer is a store of the COMPANY, not
   of one `businessId` row. The group is the branch hierarchy the Business
   master already records: the main branch and every sub-branch hanging off
   it (Business.isMainBranch / parentBusinessId - see lib/icRouting.js).

   This exists because filtering the destination picker on the header's own
   `businessId` hid the rest of the company: a group keeps stock in several
   branches, and an operator in the warehouse could only ever offer the one or
   two locations filed under their own branch - which is exactly what made the
   Location Name dropdown look like it held a single store.

   What is NOT offered: locations owned by an unrelated company, and rows left
   behind by a branch that has since been deleted (their `businessId` matches
   no business, so no master list shows them either).

   Two master rows can carry the same store name after a restructure. They are
   the same store, so the list keeps one and prints the branch name beside
   every store belonging to a SIBLING branch - the choice has to be
   unambiguous on screen.

   Nothing here filters on the top bar's location: that is the SOURCE, a
   separate selection.
   ========================================================================== */

const same = (a, b) => String(a || '') === String(b || '');

/* The branch ids that make up this company: the branch itself, its parent
   (the main branch) and the parent's other children. A branch with no parent
   is its own group. */
export async function groupBusinessIds(businessId) {
  if (!isValidObjectId(businessId)) return [];

  const self = await Business.findById(businessId)
    .select('_id parentBusinessId isMainBranch').lean();
  if (!self) return [];

  const rootId = self.parentBusinessId ? String(self.parentBusinessId) : String(self._id);

  const members = await Business.find({
    $or: [{ _id: rootId }, { parentBusinessId: rootId }],
  }).select('_id').lean();

  return [...new Set([String(businessId), rootId, ...members.map((m) => String(m._id))])];
}

/* Stores that may be the destination, shaped like /api/options so a form can
   drop them straight into a <select>. */
export async function destinationStores(businessId, { excludeLocationId = '' } = {}) {
  if (!isValidObjectId(businessId)) return { options: [] };

  const groupIds = await groupBusinessIds(businessId);
  if (!groupIds.length) return { options: [] };

  const branches = await Business.find({ _id: { $in: groupIds } })
    .select('name businessPrintName').lean();
  const branchName = new Map(
    branches.map((b) => [String(b._id), String(b.businessPrintName || b.name || '').trim()])
  );

  const rows = await CompanyLocation.find({ businessId: { $in: groupIds } })
    .select('name businessId city state gstin').lean();

  const seen = new Map();
  rows.forEach((row) => {
    if (same(row._id, excludeLocationId)) return;

    const bid = String(row.businessId || '');
    const key = String(row.name || '').trim().toLowerCase()
      + '|' + String(row.city || '').trim().toLowerCase();
    if (seen.has(key)) return;

    const branch = branchName.get(bid) || '';
    const label = (!branch || same(bid, businessId))
      ? String(row.name || '')
      : String(row.name || '') + ' — ' + branch;

    seen.set(key, {
      value: String(row._id),
      label,
      name: String(row.name || ''),
      businessId: bid,
      businessName: branch,
      state: String(row.state || ''),
      gstin: String(row.gstin || ''),
    });
  });

  return {
    options: [...seen.values()].sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/* Which branch a store belongs to. Used where a document's stock has to be
   filed under the store that actually holds it rather than under the branch
   that raised the document - the two differ as soon as a transfer crosses
   branches of the same company. */
export async function businessOfLocation(locationId) {
  if (!isValidObjectId(locationId)) return '';
  const loc = await CompanyLocation.findById(locationId).select('businessId').lean();
  return String(loc?.businessId || '');
}

/* The write-side guard. Mirrors destinationStores exactly, so a store the
   picker offers is never refused on save - and one it does not offer still
   is. Enforced on the server as well because the dropdown is not a boundary. */
export async function isDestinationStore(businessId, locationId) {
  if (!isValidObjectId(businessId) || !isValidObjectId(locationId)) return false;

  const loc = await CompanyLocation.findById(locationId).select('businessId').lean();
  if (!loc) return false;

  const bid = String(loc.businessId || '');
  if (same(bid, businessId)) return true;

  const groupIds = await groupBusinessIds(businessId);
  return groupIds.includes(bid);
}
