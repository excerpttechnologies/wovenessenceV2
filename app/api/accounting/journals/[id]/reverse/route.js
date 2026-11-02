import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import JournalEntry from '@/models/JournalEntry';
import { json, guard, sessionAndScope } from '@/lib/accounting/route';
import { SCREENS, ACTIONS } from '@/lib/screenPermission';
import { reverseJournal, JournalError } from '@/lib/accounting/journal';

/* POST /api/accounting/journals/<id>/reverse

   A correction is another journal, never an edit. Automatic postings are
   reversed by their own document (see lib/accounting/posting.js), so this is
   only for manual entries - reversing those here keeps the register honest
   instead of deleting the original. */

export async function POST(req, { params }) {
  const denied = await guard(req, SCREENS.ACCOUNTS_JOURNAL, ACTIONS.UPDATE);
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;
  const { scope } = await sessionAndScope(req);

  if (!isValidObjectId(id)) return json({ error: 'Not found' }, 404);

  const filter = { _id: id };
  if (scope.businessId) filter.businessId = scope.businessId;
  if (scope.locationId) filter.locationId = scope.locationId;

  const doc = await JournalEntry.findOne(filter).lean();
  if (!doc) return json({ error: 'Not found' }, 404);

  if (doc.source !== 'manual') {
    return json({
      error: 'This journal was posted automatically from a document. Cancel or change the document to reverse it.',
    }, 422);
  }

  try {
    const reversal = await reverseJournal(doc);
    return json({ ok: true, id: String(reversal._id) });
  } catch (error) {
    if (error instanceof JournalError) {
      return json({ error: error.problems.join(' '), problems: error.problems }, 422);
    }
    throw error;
  }
}
