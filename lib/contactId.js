/* Contact IDs are prefix + running number, taken from the Contact Type
   prefix: G1309, PO510, AGENT7.

   The original sorted `contactId` descending as a STRING, so with G1..G10
   present the top hit was "G9" -> next was G10 again, forever. This sorts
   on the numeric part instead.

   The running number is taken across EVERY contact collection, not just the
   new record's own. While suppliers, customers and agents shared one
   collection a code could never be given twice, whatever the kind - a
   supplier and a customer created without a Contact Type both draw from the
   fallback prefix "C". Keeping the three collections under one sequence
   keeps that guarantee now that they live apart. */

import { CONTACT_MODELS } from '@/lib/contacts';

export async function nextContactId(ContactType, typeId) {
  const type = typeId ? await ContactType.findById(typeId).lean() : null;
  const prefix = (type && type.prefix) || 'C';

  const tops = await Promise.all(CONTACT_MODELS.map((Model) => Model.aggregate([
    { $match: { contactId: { $regex: '^' + escapeRegex(prefix) + '\\d+$' } } },
    { $addFields: { seq: { $toInt: { $substrBytes: ['$contactId', prefix.length, 16] } } } },
    { $sort: { seq: -1 } },
    { $limit: 1 },
  ])));

  const top = Math.max(0, ...tops.map(([row]) => row?.seq || 0));
  return prefix + (top + 1);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
