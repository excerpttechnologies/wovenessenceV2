/* Contact IDs are prefix + running number, taken from the Contact Type
   prefix: G1309, PO510, AGENT7.

   The original sorted `contactId` descending as a STRING, so with G1..G10
   present the top hit was "G9" -> next was G10 again, forever. This sorts
   on the numeric part instead. */

export async function nextContactId(Contact, ContactType, typeId) {
  const type = typeId ? await ContactType.findById(typeId).lean() : null;
  const prefix = (type && type.prefix) || 'C';

  const [top] = await Contact.aggregate([
    { $match: { contactId: { $regex: '^' + escapeRegex(prefix) + '\\d+$' } } },
    { $addFields: { seq: { $toInt: { $substrBytes: ['$contactId', prefix.length, 16] } } } },
    { $sort: { seq: -1 } },
    { $limit: 1 },
  ]);

  return prefix + ((top?.seq || 0) + 1);
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
