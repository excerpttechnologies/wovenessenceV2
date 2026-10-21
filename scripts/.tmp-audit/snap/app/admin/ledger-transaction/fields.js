/* Ledger Transactions - filter spec, columns and the document registry.

   Plain module (no 'use client'), so the API route imports the same document
   list the filter dropdown offers - one place to add a source.

   ------------------------------------------------------------------------
   WHY THIS IS DERIVED

   This project has no posting engine: no model holds journal entries and no
   route writes one. So a ledger entry here is computed at read time from the
   documents themselves - a Purchase Invoice credits its supplier, a Debit
   Note debits them, and so on. That is what the deployed screen shows, so
   the output matches; what it does not give you is an immutable audit trail,
   opening balances, or entries that survive editing the source document.

   When a real LedgerTransaction collection lands, this page keeps its shape:
   the route swaps its source from these documents to that collection, and
   nothing on the screen changes.
   ------------------------------------------------------------------------ */

export const LEDGER_TYPES = [
  { v: 'Dr', l: 'Dr' },
  { v: 'Cr', l: 'Cr' },
];

/* Every document that moves money against a party.

   `side` is from the PARTY's point of view, which is how the deployed screen
   reads it: buying on credit CREDITS the supplier (you owe them), returning
   goods to them DEBITS them (they owe you back).

   GRT is deliberately absent - a goods return moves stock, and the money
   only lands when the Debit Note is raised against it. Delivery challans and
   GRCs are absent for the same reason. */
export const DOC_TYPES = [
  'Purchase Invoice',
  'Debit Note',
  'Sales Invoice',
  'Credit Note',
  'Sales Return',
  'POS',
  'POS Return',
  'Inter Company Sales Invoice',
  /* the settlement side - these are ledger entries in their own right,
     not documents that merely imply one. Contra is absent: it moves money
     between the business's own accounts, so it has no party to sit against. */
  'Receipt Voucher',
  'Payment Voucher',
];

export const DOC_TYPE_OPTS = DOC_TYPES.map((d) => ({ v: d, l: d }));

export const COLUMNS = [
  { k: 'ledgerName', t: 'Ledger Name' },
  { k: 'contact', t: 'Contact' },
  { k: 'type', t: 'Type' },
  { k: 'amount', t: 'amount', f: 'amount' },
  { k: 'description', t: 'Description' },
  { k: 'docType', t: 'Doc Type' },
  { k: 'docNumber', t: 'Doc Number' },
];

/* The Ledger Name box is a free-text match rather than a dropdown of the
   Ledger master, deliberately: a party's ledger name is only mapped when the
   contact carries a paymentLedgerId, and most do not. Picking from the master
   would return nothing for those, which reads as "no data" rather than "not
   mapped". Typing matches the ledger name AND the party name, so it finds
   both. */
export const FILTERS = [
  { k: 'ledgerName', label: 'Ledger Name', type: 'text', placeholder: 'Search ledger...' },
  { k: 'type', label: 'Ledger Type', type: 'select', placeholder: 'Select...', opts: LEDGER_TYPES },
  { k: 'docType', label: 'Document Type', type: 'select', placeholder: 'Select...', opts: DOC_TYPE_OPTS },
  { k: 'docNumber', label: 'Document Number', type: 'text', placeholder: 'Document Number' },
  { k: 'fromDate', label: 'From Date', type: 'date' },
  { k: 'toDate', label: 'To Date', type: 'date' },
];

export const PER_PAGE = 10;
