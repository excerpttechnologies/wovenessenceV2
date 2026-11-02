import { isValidObjectId } from 'mongoose';
import Grc from '@/models/Grc';
import JournalEntry from '@/models/JournalEntry';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { grcMoney, headerGstIsAmount } from '@/lib/grcMoney';
import { loadSettings, mappingProblems, accountFor, gstSplit, gstModeOf, requiredPostingKeys } from './settings';
import { createJournal, reverseJournal, JournalError, finYearOf } from './journal';
import { r2, toPaise, isInFinYear, fyBounds } from './calc';

/* ==========================================================================
   AUTOMATIC POSTINGS FROM DOCUMENTS.

   A Purchase GRC is the first source: receiving goods debits what was bought
   and credits what is now owed to the supplier. The rules that keep this safe:

     - A POSTING NEVER FAILS THE DOCUMENT. A receipt is a warehouse event; if
       the books cannot take it, the GRC still saves and stores why posting
       failed, so it can be retried from the Accounts screens.
     - NO GUESSED ACCOUNTS. Every account comes from AccountingSettings. An
       unmapped role is a stored failure that names the role, not a silent
       debit somebody has to find later.
     - ONE JOURNAL PER DOCUMENT. The database index on (source, document,
       kind, sequence) makes a double confirmation one journal; a document
       that changes gets its old journal reversed and a new one written, so
       the history stays intact.
   ========================================================================== */

export const GRC_SOURCE = 'purchase';

/* The journal a GRC's money makes, before it is written.

   inclusive        Dr Inventory (taxable + GST)          Cr Accounts Payable
   input-igst       Dr Inventory (taxable) + Dr Input IGST Cr Accounts Payable
   input-cgst-sgst  Dr Inventory + Dr CGST + Dr SGST       Cr Accounts Payable

   The payable is the invoice total in every case, so the journal balances by
   construction rather than by a rounding line. */
export function grcJournalLines(money, settings) {
  const mode = gstModeOf(settings);
  const net = r2(money.netAmount);
  const taxable = r2(money.taxable);
  const split = gstSplit(mode, money.gst);

  const lines = [];
  if (mode === 'inclusive' || taxable <= 0) {
    lines.push({ ...accountFor(settings, 'inventory'), debit: net, credit: 0, narration: 'Goods received' });
  } else {
    lines.push({ ...accountFor(settings, 'inventory'), debit: taxable, credit: 0, narration: 'Goods received' });
    split.forEach((part) => {
      if (part.amount > 0) {
        lines.push({ ...accountFor(settings, part.key), debit: part.amount, credit: 0, narration: 'Input GST' });
      }
    });
  }
  lines.push({ ...accountFor(settings, 'accountsPayable'), debit: 0, credit: net, narration: 'Supplier payable' });
  return lines;
}

const dateFor = (grc, finYear) => {
  const candidates = [grc.grcDate, grc.createdAt, new Date()];
  for (const candidate of candidates) {
    const date = candidate ? new Date(candidate) : null;
    if (date && !Number.isNaN(date.getTime()) && isInFinYear(date, finYear)) return date;
  }
  const bounds = fyBounds(finYear);
  return bounds ? bounds.start : new Date();
};

/* The GRC's money as the accounting module reads it: the stored header, with
   its barcode rows only consulted when the header's GST is a percentage sum
   from before 2026-09-17 (see lib/grcMoney.js). */
export async function grcMoneyFor(grc) {
  const rows = headerGstIsAmount(grc)
    ? []
    : await BarcodeLabel.find({ grcId: grc._id }).select('gst qty qtyNum finalNet purRate').lean();
  return grcMoney(grc, rows);
}

const latestEntryFor = (grc) => JournalEntry.findOne({
  businessId: grc.businessId,
  source: GRC_SOURCE,
  sourceRefId: grc._id,
  kind: 'entry',
}).sort({ postingSeq: -1 }).lean();

async function mark(grcId, fields) {
  await Grc.updateOne({ _id: grcId }, { $set: fields });
}

/* Brings a GRC's journal in line with the document. Safe to call any number
   of times: it posts when nothing is posted, returns when the books already
   agree, and reverses + re-posts when the value changed. */
export async function syncGrcPosting(grcId, { actor = null } = {}) {
  if (!isValidObjectId(String(grcId || ''))) {
    return { status: 'pending', journalId: null, error: 'That GRC does not exist.' };
  }

  const grc = await Grc.findById(grcId).lean();
  if (!grc) return { status: 'pending', journalId: null, error: 'That GRC does not exist.' };

  const finYear = String(grc.finYear || '') || finYearOf(grc.grcDate || grc.createdAt || new Date());
  const latest = await latestEntryFor(grc);
  const money = await grcMoneyFor(grc);
  const net = r2(money.netAmount);

  /* Nothing to post (a draft with no priced lines). If a previous posting
     exists it is reversed, because the document no longer carries that
     value - leaving it would keep stock on the books for goods that are not
     in the receipt. */
  if (toPaise(net) <= 0) {
    if (latest && latest.status === 'posted') {
      try {
        await reverseJournal(latest);
      } catch (error) {
        await mark(grc._id, { accountingStatus: 'failed', accountingError: error.message });
        return { status: 'failed', journalId: latest._id ? String(latest._id) : null, error: error.message };
      }
    }
    await mark(grc._id, {
      accountingStatus: 'pending',
      accountingJournalId: null,
      accountingError: '',
      accountingPostedAt: null,
    });
    return { status: 'pending', journalId: null, error: '' };
  }

  const settings = await loadSettings({ businessId: grc.businessId, locationId: grc.locationId });
  const problems = await mappingProblems({
    businessId: grc.businessId,
    locationId: grc.locationId,
    keys: requiredPostingKeys(gstModeOf(settings)),
    settings,
  });
  if (problems.length) {
    const error = problems.join(' ');
    await mark(grc._id, { accountingStatus: 'failed', accountingError: error });
    return { status: 'failed', journalId: latest?._id ? String(latest._id) : null, error };
  }

  /* Already posted, for this exact value, in this financial year: nothing to
     do. Comparing in paise is what stops a float difference from rewriting a
     journal that is already correct. */
  if (latest && latest.status === 'posted'
    && toPaise(latest.totalDebit) === toPaise(net)
    && String(latest.finYear || '') === finYear) {
    await mark(grc._id, {
      accountingStatus: 'posted',
      accountingJournalId: latest._id,
      accountingError: '',
    });
    return { status: 'posted', journalId: String(latest._id), error: '' };
  }

  let seq = 1;
  let replaced = null;
  if (latest) {
    seq = Number(latest.postingSeq || 1) + 1;
    if (latest.status === 'posted') {
      try {
        replaced = await reverseJournal(latest);
      } catch (error) {
        await mark(grc._id, { accountingStatus: 'failed', accountingError: error.message });
        return { status: 'failed', journalId: latest._id ? String(latest._id) : null, error: error.message };
      }
    }
  }

  let lines;
  try {
    lines = grcJournalLines(money, settings);
  } catch (error) {
    const message = error instanceof JournalError ? error.message : error.message;
    await mark(grc._id, { accountingStatus: 'failed', accountingError: message });
    return { status: 'failed', journalId: latest?._id ? String(latest._id) : null, error: message };
  }

  let journal;
  try {
    journal = await createJournal({
      scope: { businessId: grc.businessId, locationId: grc.locationId, finYear },
      journalDate: dateFor(grc, finYear),
      lines,
      meta: {
        source: GRC_SOURCE,
        sourceRefId: grc._id,
        sourceRefNo: grc.grcNumber || '',
        postingSeq: seq,
        referenceNo: grc.grcNumber || '',
        narration: 'Purchase GRC ' + (grc.grcNumber || '') + ' received',
        createdBy: actor?.userId || actor?.id || null,
        createdByName: actor?.name || actor?.userName || '',
      },
    });
  } catch (error) {
    const message = error instanceof JournalError
      ? error.problems.join(' ')
      : (error.message || 'Could not write the journal.');
    await mark(grc._id, { accountingStatus: 'failed', accountingError: message });
    return { status: 'failed', journalId: latest?._id ? String(latest._id) : null, error: message };
  }

  await mark(grc._id, {
    accountingStatus: 'posted',
    accountingJournalId: journal._id,
    accountingError: '',
    accountingPostedAt: new Date(),
  });

  return {
    status: 'posted',
    journalId: String(journal._id),
    replacedJournalId: replaced?._id ? String(replaced._id) : null,
    error: '',
  };
}

/* Reverses whatever a GRC posted, and says so on the document. Used when a
   GRC is cancelled or deleted - the journal is never deleted, only offset.

   `reverseGrcJournal` takes the GRC itself, so a caller that has just
   deleted the document can still reverse the journal it left behind. */
export async function reverseGrcPosting(grcId, { reason = '' } = {}) {
  if (!isValidObjectId(String(grcId || ''))) return { status: 'pending', error: '' };

  const grc = await Grc.findById(grcId).lean();
  if (!grc) return { status: 'pending', error: '' };
  return reverseGrcJournal(grc, { reason });
}

export async function reverseGrcJournal(grc, { reason = '' } = {}) {
  if (!grc?._id) return { status: 'pending', error: '' };

  const entries = await JournalEntry.find({
    businessId: grc.businessId,
    source: GRC_SOURCE,
    sourceRefId: grc._id,
    kind: 'entry',
  }).sort({ postingSeq: -1 }).lean();

  let reversed = 0;
  try {
    for (const entry of entries) {
      if (entry.status !== 'posted') continue;
      // eslint-disable-next-line no-await-in-loop
      await reverseJournal(entry);
      reversed += 1;
    }
  } catch (error) {
    const message = error instanceof JournalError
      ? error.problems.join(' ')
      : (error.message || 'Could not reverse the journal.');
    await mark(grc._id, { accountingStatus: 'failed', accountingError: message });
    return { status: 'failed', reversed, error: message };
  }

  /* Marking is best-effort: a GRC that has just been deleted has no row left
     to mark, and the reversal above is the part that matters. */
  if (await Grc.exists({ _id: grc._id })) {
    await mark(grc._id, {
      accountingStatus: 'reversed',
      accountingError: reason ? String(reason) : '',
    });
  }
  return { status: 'reversed', reversed, error: '' };
}

/* The call a DOCUMENT route makes after saving: post the journal if it can,
   and never let a bookkeeping problem undo or fail the document itself. The
   outcome is stored on the GRC either way, so it can be retried from the
   Accounts screens. */
export async function trySyncGrcPosting(grcId, options = {}) {
  try {
    return await syncGrcPosting(grcId, options);
  } catch (error) {
    return { status: 'failed', journalId: null, error: error?.message || 'Posting failed.' };
  }
}

/* One entry point for the Accounts screens' "post / retry" action, so the
   browser never has to know which document type it is asking about. */
export async function syncSourcePosting(source, id, options = {}) {
  if (source === GRC_SOURCE) return syncGrcPosting(id, options);
  return { status: 'pending', error: 'Posting is not supported for that document type yet.' };
}
