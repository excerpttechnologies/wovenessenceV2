import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';

import Contact from '@/models/Contact';
import Business from '@/models/Business';
import Ledger from '@/models/Ledger';

import PurchaseInvoice from '@/models/PurchaseInvoice';
import DebitNote from '@/models/DebitNote';
import SalesInvoice from '@/models/SalesInvoice';
import CreditNote from '@/models/CreditNote';
import SalesReturn from '@/models/SalesReturn';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import Voucher from '@/models/Voucher';

/* /api/ledger-transaction - one read-only list, no writes.

   DERIVED, NOT POSTED. Nothing in this project writes journal entries, so an
   entry here is computed from the document that caused it. See the note at
   the top of app/admin/ledger-transaction/fields.js for what that costs.

   Each source declares where its date, number, party and amount live, and
   which side of the party's account it lands on. Adding a document type is
   one entry in SOURCES plus one string in DOC_TYPES. */

const json = (d, s = 200) => Response.json(d, { status: s });

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (v) => Math.round(num(v) * 100) / 100;

/* Credit Note and Sales Return carry no total on the header - only line
   items - so their value is summed from the lines. */
const sumLines = (d) => r2((Array.isArray(d.items) ? d.items : [])
  .reduce((a, l) => a + num(l.netAmount ?? l.beforeTax), 0));

/* `side` is from the PARTY's point of view: buying on credit CREDITS the
   supplier, returning goods to them DEBITS them. */
const SOURCES = [
  {
    docType: 'Purchase Invoice',
    Model: PurchaseInvoice,
    party: 'supplierId', partyKind: 'contact',
    date: 'purchaseDate', number: 'purchaseInvoiceNo',
    side: 'Cr',
    description: 'Purchase Invoice',
    amount: (d) => r2(d.totalPayable ?? d.netPurchaseAmt),
  },
  {
    docType: 'Debit Note',
    Model: DebitNote,
    party: 'supplierId', partyKind: 'contact',
    date: 'debitCreadted', number: 'debitNoteNo',
    side: 'Dr',
    description: 'Debit Note for Supplier',
    amount: (d) => r2(d.value),
  },
  {
    docType: 'Sales Invoice',
    Model: SalesInvoice,
    party: 'customerId', partyKind: 'contact',
    /* SalesInvoice has no date field of its own - createdAt stands in */
    date: 'createdAt', number: 'salesInvoiceNo',
    side: 'Dr',
    description: 'Sales Invoice',
    amount: (d) => r2(d.netValue),
  },
  {
    docType: 'Credit Note',
    Model: CreditNote,
    party: 'customerId', partyKind: 'contact',
    date: 'createdAt', number: 'creditNoteCode',
    side: 'Cr',
    description: 'Credit Note for Customer',
    amount: sumLines,
  },
  {
    docType: 'Sales Return',
    Model: SalesReturn,
    party: 'customerId', partyKind: 'contact',
    date: 'returnDate', number: 'salesReturnNo',
    side: 'Cr',
    description: 'Sales Return',
    amount: sumLines,
  },
  {
    docType: 'POS',
    Model: PosInvoice,
    party: 'customerId', partyKind: 'contact',
    date: 'date', number: 'invoiceNo',
    side: 'Dr',
    description: 'POS Invoice',
    amount: (d) => r2(d.totalAmount),
  },
  {
    docType: 'POS Return',
    Model: PosReturn,
    party: 'customerId', partyKind: 'contact',
    date: 'date', number: 'invoiceNo',
    side: 'Cr',
    description: 'POS Return',
    amount: (d) => r2(d.totalAmount),
  },
  {
    docType: 'Inter Company Sales Invoice',
    Model: IcSalesInvoice,
    party: 'toBusinessId', partyKind: 'business',
    date: 'invoiceDate', number: 'invoiceNo',
    side: 'Dr',
    description: 'Inter Company Sales Invoice',
    amount: (d) => r2(d.netValue),
  },

  /* The two settlement documents. Unlike everything above, these are not
     documents that happen to imply a ledger entry - they ARE ledger entries,
     which is why the amount is read straight off the voucher.

     `where` narrows one Model to one docType; Voucher holds all three types
     in one collection.

     partyKind 'ledger' means the party IS the ledger, so the name is taken
     from what the voucher copied down at save time rather than looked up -
     no query, and a renamed ledger never rewrites an issued voucher.

     Contra is deliberately absent: it moves money between the business's own
     accounts, so there is no party for it to sit against. It would produce a
     row with both name columns blank. Same reasoning that keeps GRC and
     Delivery Challan out. */
  {
    docType: 'Receipt Voucher',
    Model: Voucher,
    where: { type: 'Receipt' },
    party: 'partyLedgerId', partyKind: 'ledger',
    date: 'voucherDate', number: 'voucherNo',
    /* money in from a customer - they owe you less */
    side: 'Cr',
    description: 'Receipt from Customer',
    amount: (d) => r2(d.totalAmount),
  },
  {
    docType: 'Payment Voucher',
    Model: Voucher,
    where: { type: 'Payment' },
    party: 'partyLedgerId', partyKind: 'ledger',
    date: 'voucherDate', number: 'voucherNo',
    /* money out to a supplier - you owe them less */
    side: 'Dr',
    description: 'Payment to Supplier',
    amount: (d) => r2(d.totalAmount),
  },
];

/* Merging several collections means sorting in memory, so each source is
   capped. At this ceiling the page is still honest - it just shows the most
   recent slice - and the response says so through `capped`. A real
   LedgerTransaction collection removes the need entirely. */
const PER_SOURCE_CAP = 2000;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || 10));

  const business = sp.get('business');
  const location = sp.get('location');
  const finYear = sp.get('finYear') || '';

  const wantType = (sp.get('type') || '').trim();
  const wantDocType = (sp.get('docType') || '').trim();
  const wantNumber = (sp.get('docNumber') || '').trim();
  const wantLedger = (sp.get('ledgerName') || '').trim().toLowerCase();
  const from = sp.get('fromDate');
  const to = sp.get('toDate');

  /* ------------------------------------------------------------ collect */
  const wanted = SOURCES.filter((s) => !wantDocType || s.docType === wantDocType)
    .filter((s) => !wantType || s.side === wantType);

  const collected = await Promise.all(wanted.map(async (s) => {
    const filter = {};
    if (business && isValidObjectId(business)) filter.businessId = business;
    if (location && isValidObjectId(location)) filter.locationId = location;
    if (finYear) filter.finYear = finYear;
    /* a source can narrow its own collection - Voucher holds three types */
    if (s.where) Object.assign(filter, s.where);

    if (wantNumber) {
      filter[s.number] = { $regex: escapeRegex(wantNumber), $options: 'i' };
    }
    if (from) filter[s.date] = { ...(filter[s.date] || {}), $gte: new Date(from) };
    if (to) filter[s.date] = { ...(filter[s.date] || {}), $lte: new Date(to + 'T23:59:59') };

    const rows = await s.Model.find(filter)
      .sort({ [s.date]: -1 })
      .limit(PER_SOURCE_CAP + 1)
      .lean();

    return { s, rows: rows.slice(0, PER_SOURCE_CAP), capped: rows.length > PER_SOURCE_CAP };
  }));

  const capped = collected.some((c) => c.capped);

  /* --------------------------------------------------- resolve the party */
  const contactIds = new Set();
  const businessIds = new Set();
  collected.forEach(({ s, rows }) => rows.forEach((d) => {
    const id = d[s.party];
    if (!id) return;
    /* a voucher already carries its ledger's name - nothing to look up */
    if (s.partyKind === 'ledger') return;
    (s.partyKind === 'business' ? businessIds : contactIds).add(String(id));
  }));

  const [contacts, businesses] = await Promise.all([
    contactIds.size ? Contact.find({ _id: { $in: [...contactIds] } })
      .select('businessName firstName lastName paymentLedgerId').lean() : [],
    businessIds.size ? Business.find({ _id: { $in: [...businessIds] } })
      .select('name').lean() : [],
  ]);

  /* a party's ledger name comes from its mapped ledger when there is one,
     and falls back to "<party> A/C" - which is how the deployed screen reads
     for parties that were never mapped */
  const ledgerIds = contacts.map((c) => c.paymentLedgerId).filter(Boolean);
  const ledgers = ledgerIds.length
    ? await Ledger.find({ _id: { $in: ledgerIds } }).select('name').lean()
    : [];
  const ledgerById = new Map(ledgers.map((l) => [String(l._id), l.name || '']));

  const partyById = new Map();
  contacts.forEach((c) => {
    const name = c.businessName
      || [c.firstName, c.lastName].filter(Boolean).join(' ')
      || '';
    partyById.set(String(c._id), {
      contact: name,
      ledgerName: (c.paymentLedgerId && ledgerById.get(String(c.paymentLedgerId)))
        || (name ? name + ' A/C' : ''),
    });
  });
  businesses.forEach((b) => {
    partyById.set(String(b._id), {
      contact: b.name || '',
      ledgerName: b.name ? b.name + ' A/C' : '',
    });
  });

  /* ------------------------------------------------------------ flatten */
  let entries = [];
  collected.forEach(({ s, rows }) => rows.forEach((d) => {
    /* a voucher's party IS a ledger, and its name was copied onto the
       voucher at save time - so it needs no resolution and shows the name
       the voucher was raised against, not the ledger's current one */
    const party = s.partyKind === 'ledger'
      ? { contact: d.partyName || '', ledgerName: d.partyName || '' }
      : (partyById.get(String(d[s.party])) || { contact: '', ledgerName: '' });
    entries.push({
      _id: String(d._id) + ':' + s.docType,
      date: d[s.date] || d.createdAt || null,
      ledgerName: party.ledgerName,
      contact: party.contact,
      type: s.side,
      amount: s.amount(d),
      description: s.description,
      docType: s.docType,
      docNumber: d[s.number] || '',
    });
  }));

  /* the ledger box matches the ledger name OR the party name, so it finds
     unmapped parties too */
  if (wantLedger) {
    entries = entries.filter((e) =>
      String(e.ledgerName).toLowerCase().includes(wantLedger)
      || String(e.contact).toLowerCase().includes(wantLedger));
  }

  entries.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const total = entries.length;
  const rows = entries.slice((page - 1) * perPage, page * perPage);

  return json({
    rows,
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
    /* true when a source hit its cap - the page is showing the most recent
       slice rather than everything */
    capped,
  });
}
