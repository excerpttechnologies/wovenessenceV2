import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import JournalEntry from '@/models/JournalEntry';
import { json, guard, sessionAndScope, writeScope } from '@/lib/accounting/route';
import { SCREENS, ACTIONS } from '@/lib/screenPermission';
import { createJournal, JournalError } from '@/lib/accounting/journal';
import { escapeRegex } from '@/lib/validate';
import { r2 } from '@/lib/accounting/calc';

/* /api/accounting/journals - the journal register: list + post a manual entry.

   Only POSTED / REVERSED documents exist here: a journal is the record, so
   there is no draft state to list. A posting is edited by reversing it and
   writing another - see lib/accounting/journal.js. */

const PER_PAGE = 10;

export async function GET(req) {
  const denied = await guard(req, SCREENS.ACCOUNTS_JOURNAL, ACTIONS.READ);
  if (denied) return denied;

  await dbConnect();
  const { scope } = await sessionAndScope(req);
  const sp = new URL(req.url).searchParams;

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(200, Math.max(1, Number(sp.get('perPage') || PER_PAGE)));

  const filter = {};
  if (scope.businessId) filter.businessId = scope.businessId;
  if (scope.locationId) filter.locationId = scope.locationId;
  if (scope.finYear) filter.finYear = scope.finYear;

  const source = sp.get('source');
  if (['manual', 'purchase', 'sales', 'stocktransfer'].includes(source)) filter.source = source;

  const kind = sp.get('kind');
  if (kind === 'entry' || kind === 'reversal') filter.kind = kind;

  const accountId = sp.get('accountId');
  if (accountId && isValidObjectId(accountId)) filter['lines.accountId'] = accountId;

  const from = sp.get('fromDate');
  const to = sp.get('toDate');
  if (from || to) {
    filter.journalDate = {};
    if (from) filter.journalDate.$gte = new Date(from);
    if (to) filter.journalDate.$lte = new Date(to + 'T23:59:59.999');
  }

  const search = String(sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ referenceNo: rx }, { narration: rx }, { sourceRefNo: rx }];
  }

  const total = await JournalEntry.countDocuments(filter);
  const rows = await JournalEntry.find(filter)
    .sort({ journalDate: -1, createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((row) => ({
      ...row,
      _id: String(row._id),
      lines: (row.lines || []).map((line) => ({
        ...line,
        _id: String(line._id),
        accountId: String(line.accountId),
        debit: r2(line.debit),
        credit: r2(line.credit),
      })),
      totalDebit: r2(row.totalDebit),
      totalCredit: r2(row.totalCredit),
    })),
    labels: {},
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    total,
    perPage,
  });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));

  const denied = await guard(req, SCREENS.ACCOUNTS_JOURNAL, ACTIONS.CREATE, body?.business);
  if (denied) return denied;

  await dbConnect();
  const data = body.data || {};
  const scope = writeScope(body, new URL(req.url).searchParams);
  const { session } = await sessionAndScope(req);

  if (!scope.businessId) return json({ error: 'Select a business in the top bar.' }, 422);

  let journal;
  try {
    journal = await createJournal({
      scope,
      journalDate: data.journalDate || new Date(),
      lines: data.lines,
      meta: {
        source: 'manual',
        referenceNo: data.referenceNo,
        narration: data.narration,
        createdBy: session?.userId || session?.id || null,
        createdByName: session?.name || session?.userName || '',
      },
    });
  } catch (error) {
    if (error instanceof JournalError) {
      return json({
        errors: { lines: error.problems[0] },
        error: error.problems[0],
        problems: error.problems,
      }, 422);
    }
    throw error;
  }

  return json({ ok: true, id: String(journal._id), referenceNo: journal.referenceNo });
}
