import { isValidObjectId } from 'mongoose';
import JournalEntry from '@/models/JournalEntry';
import AccountsMaster from '@/models/AccountsMaster';
import {
  r2, toPaise, fromPaise, journalTotals, journalProblems, reversalLines,
  fyBounds, isInFinYear,
} from './calc';

/* ==========================================================================
   THE ONLY WRITER OF JOURNAL ENTRIES.

   Everything that needs a journal goes through here: the manual Entry screen,
   the Purchase GRC posting, and every future source. One writer means the
   rules below are applied once rather than re-implemented per route:

     - the journal balances, checked in integer paise
     - every line names an account that exists IN THIS BUSINESS
     - the date sits inside the financial year being posted to
     - totals are computed from the lines, never read from the request
     - a reversal is the original with its sides swapped

   A refusal is a JournalError carrying the problems, which a route turns into
   a 422 with the same `{ errors }` shape every form in this project expects.
   ========================================================================== */

export class JournalError extends Error {
  constructor(problems) {
    const list = Array.isArray(problems) ? problems.filter(Boolean) : [problems].filter(Boolean);
    super(list[0] || 'That journal cannot be posted.');
    this.name = 'JournalError';
    this.status = 422;
    this.problems = list;
  }
}

const isId = (value) => isValidObjectId(String(value || ''));

/* The financial year a date belongs to, from the date itself: 1 April to
   31 March. Only used when the request carries no year of its own. */
export function finYearOf(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) return '';
  const year = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return year + '-' + (year + 1);
}

/* A request's lines, made safe to store.

   - ids become plain strings
   - money is rounded to the paisa
   - a line with no account and no money is dropped, so the blank row an
     operator left at the bottom is not an error
   - a line with an account but no money stays, and journalProblems says so
*/
export function normaliseLines(lines) {
  const list = Array.isArray(lines) ? lines : [];
  return list
    .map((line) => ({
      accountId: String(line?.accountId || '').trim(),
      accountName: String(line?.accountName || '').trim(),
      debit: r2(line?.debit),
      credit: r2(line?.credit),
      narration: String(line?.narration || '').trim(),
    }))
    .filter((line) => line.accountId || toPaise(line.debit) || toPaise(line.credit));
}

/* Account rows for the ids a journal names, narrowed to the journal's own
   business (and its location, or a business-wide account). Anything else is
   refused rather than posted. */
export async function accountsForLines(lines, { businessId, locationId }) {
  const ids = [...new Set(lines.map((l) => l.accountId).filter(isId))];
  if (!ids.length) return new Map();

  const filter = { _id: { $in: ids } };
  if (businessId) filter.businessId = businessId;
  if (isValidObjectId(String(locationId || ''))) {
    filter.$or = [{ locationId }, { locationId: null }, { locationId: { $exists: false } }];
  }

  const accounts = await AccountsMaster.find(filter)
    .select('accountName accountCode accountType isActive businessId locationId')
    .lean();

  return new Map(accounts.map((a) => [String(a._id), a]));
}

/* Replaces an id with the account's own name and code, and checks the id was
   actually resolvable. Returns { lines, problems }. */
export async function resolveLines(lines, scope) {
  const problems = [];
  const byId = await accountsForLines(lines, scope);

  const resolved = lines.map((line, index) => {
    const where = 'Line ' + (index + 1);
    if (!line.accountId) return line;
    if (!isId(line.accountId)) {
      problems.push(where + ': that account reference is not valid.');
      return line;
    }
    const account = byId.get(line.accountId);
    if (!account) {
      problems.push(where + ': that account is not in this business or location.');
      return line;
    }
    if (account.isActive === false) {
      problems.push(where + ': ' + (account.accountName || 'That account') + ' is inactive.');
      return line;
    }
    return {
      ...line,
      accountName: account.accountName || line.accountName || '',
      accountCode: account.accountCode || '',
    };
  });

  return { lines: resolved, problems };
}

/* Everything checked and stored. `scope` is { businessId, locationId,
   finYear }; `meta` is the rest of the document (source, reference,
   narration, createdBy, ...). */
export async function createJournal({ scope = {}, lines, meta = {}, journalDate }) {
  const date = journalDate ? new Date(journalDate) : new Date();
  if (Number.isNaN(date.getTime())) throw new JournalError(['Choose a valid journal date.']);

  const finYear = scope.finYear || finYearOf(date);
  const bounds = fyBounds(finYear);
  if (!bounds) {
    throw new JournalError(['The financial year on the top bar is not valid (expected 2026-2027).']);
  }
  if (!isInFinYear(date, finYear)) {
    throw new JournalError([
      'The journal date must fall inside the financial year ' + finYear
      + ' (' + bounds.start.getDate() + '/' + (bounds.start.getMonth() + 1) + '/'
      + bounds.start.getFullYear() + ' to 31/3/' + bounds.end.getFullYear() + ').',
    ]);
  }

  const normalised = normaliseLines(lines);
  const problems = [...journalProblems(normalised)];

  const { lines: resolved, problems: accountProblems } = await resolveLines(normalised, scope);
  problems.push(...accountProblems);
  if (problems.length) throw new JournalError(problems);

  const totals = journalTotals(resolved);

  const doc = {
    businessId: scope.businessId || null,
    locationId: scope.locationId || null,
    finYear,
    journalDate: date,
    lines: resolved.map((line) => ({
      accountId: line.accountId,
      accountName: line.accountName || '',
      debit: line.debit,
      credit: line.credit,
      narration: line.narration || '',
    })),
    totalDebit: totals.totalDebit,
    totalCredit: totals.totalCredit,
    source: meta.source || 'manual',
    kind: meta.kind || 'entry',
    postingSeq: Number(meta.postingSeq) || 1,
    referenceNo: String(meta.referenceNo || '').trim(),
    narration: String(meta.narration || '').trim(),
    sourceRefId: isId(meta.sourceRefId) ? meta.sourceRefId : null,
    sourceRefNo: String(meta.sourceRefNo || '').trim(),
    reversalOf: isId(meta.reversalOf) ? meta.reversalOf : null,
    createdBy: isId(meta.createdBy) ? meta.createdBy : null,
    createdByName: String(meta.createdByName || ''),
  };

  try {
    const entry = await JournalEntry.create(doc);
    return entry.toObject();
  } catch (error) {
    /* The unique posting index fired: this exact source + document + sequence
       + kind is already in the books. That is success, not a failure - two
       confirmations in flight must leave one journal, not an error page. */
    if (error?.code === 11000 && doc.sourceRefId) {
      const existing = await JournalEntry.findOne({
        businessId: doc.businessId,
        source: doc.source,
        sourceRefId: doc.sourceRefId,
        kind: doc.kind,
        postingSeq: doc.postingSeq,
      }).lean();
      if (existing) return existing;
    }
    if (error?.name === 'ValidationError') {
      throw new JournalError(Object.values(error.errors || {}).map((e) => e.message));
    }
    throw error;
  }
}

/* The reversal of a stored journal. Both sides are swapped, nothing is
   edited or deleted, and the original is marked reversed so a second cancel
   cannot reverse it twice. */
export async function reverseJournal(journal, { date } = {}) {
  const original = journal?.toObject ? journal.toObject() : journal;
  if (!original?._id) throw new JournalError(['That journal does not exist.']);
  if (original.kind === 'reversal') throw new JournalError(['A reversal cannot itself be reversed.']);
  if (original.status === 'reversed') throw new JournalError(['That journal has already been reversed.']);

  /* Dated on the ORIGINAL journal's own date unless a caller asks otherwise,
     so both sides of the correction stay in the period they affect. Dating a
     reversal "today" would silently move last year's receipt into this
     year's books. */
  const when = date ? new Date(date) : new Date(original.journalDate || Date.now());

  const reversal = await createJournal({
    scope: {
      businessId: original.businessId,
      locationId: original.locationId,
      finYear: original.finYear,
    },
    journalDate: when,
    lines: reversalLines(original.lines),
    meta: {
      source: original.source,
      kind: 'reversal',
      postingSeq: original.postingSeq || 1,
      referenceNo: original.referenceNo,
      narration: 'Reversal of ' + (original.referenceNo || 'journal'),
      sourceRefId: original.sourceRefId,
      sourceRefNo: original.sourceRefNo,
      reversalOf: original._id,
      createdBy: original.createdBy,
      createdByName: original.createdByName,
    },
  });

  await JournalEntry.updateOne(
    { _id: original._id },
    { $set: { status: 'reversed', reversedBy: reversal._id } }
  );

  return reversal;
}

/* Rounds a list of amounts so they add back to a total exactly. The last
   line absorbs the rounding, which is what keeps a split (CGST/SGST, or an
   invoice plus its tax) agreeing with the figure it was split from. */
export function allocate(total, parts) {
  const wanted = toPaise(total);
  const values = parts.map((p) => toPaise(p));
  const already = values.reduce((sum, v) => sum + v, 0);
  if (values.length) values[values.length - 1] += wanted - already;
  return values.map(fromPaise);
}
