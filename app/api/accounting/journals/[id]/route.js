import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import JournalEntry from '@/models/JournalEntry';
import { json, guard, sessionAndScope } from '@/lib/accounting/route';
import { SCREENS, ACTIONS } from '@/lib/screenPermission';
import { r2 } from '@/lib/accounting/calc';

/* /api/accounting/journals/<id> - read one, delete a manual entry.

   An automatic posting is NOT deletable here: it belongs to the document
   that made it, and the way to undo it is to cancel or change the document
   (which reverses the journal). Deleting it by hand would leave the source
   claiming to be posted while the books no longer contain it. */

const findScoped = async (id, scope) => {
  if (!isValidObjectId(id)) return null;
  const filter = { _id: id };
  if (scope.businessId) filter.businessId = scope.businessId;
  if (scope.locationId) filter.locationId = scope.locationId;
  return JournalEntry.findOne(filter).lean();
};

export async function GET(req, { params }) {
  const denied = await guard(req, SCREENS.ACCOUNTS_JOURNAL, ACTIONS.READ);
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;
  const { scope } = await sessionAndScope(req);

  const doc = await findScoped(id, scope);
  if (!doc) return json({ doc: null }, 404);

  return json({
    doc: {
      ...doc,
      _id: String(doc._id),
      lines: (doc.lines || []).map((line) => ({
        ...line,
        _id: String(line._id),
        accountId: String(line.accountId),
        debit: r2(line.debit),
        credit: r2(line.credit),
      })),
      totalDebit: r2(doc.totalDebit),
      totalCredit: r2(doc.totalCredit),
    },
  });
}

export async function DELETE(req, { params }) {
  const denied = await guard(req, SCREENS.ACCOUNTS_JOURNAL, ACTIONS.DELETE);
  if (denied) return denied;

  await dbConnect();
  const { id } = await params;
  const { scope } = await sessionAndScope(req);

  const doc = await findScoped(id, scope);
  if (!doc) return json({ error: 'Not found' }, 404);

  if (doc.source !== 'manual' || doc.sourceRefId) {
    return json({
      error: 'This journal was posted automatically from a document and cannot be deleted here. '
        + 'Cancel or change the document instead - that reverses its journal and keeps the audit trail.',
    }, 422);
  }
  if (doc.kind === 'reversal' || doc.status === 'reversed' || doc.reversedBy) {
    return json({
      error: 'A journal that has been reversed, or is itself a reversal, cannot be deleted. '
        + 'Both sides are the record of the correction.',
    }, 422);
  }

  await JournalEntry.deleteOne({ _id: doc._id });
  return json({ ok: true });
}
