'use client';
import ListView from '@/components/ListView';

/* Accounts > Journal Entries - the register.

   Every row is a POSTED journal: there is no draft state, because a journal
   is the record of what happened. A correction is another journal (a
   reversal), which is why the list shows both the kind and the status. */

const SOURCE_LABEL = {
  manual: 'Manual',
  purchase: 'Purchase GRC',
  sales: 'Sales',
  stocktransfer: 'Stock Transfer',
};

const CONFIG = {
  title: 'Journal Entries',
  basePath: '/admin/accounting/',
  slugPath: 'journal',
  endpoint: '/api/accounting/journals',
  pager: 'numbered',
  sortable: false,
  scope: ['business', 'location', 'finYear'],
  nowrapHead: true,
  actionMenu: [
    { label: 'View', icon: 'eye', to: (r) => '/admin/accounting/journal/' + r._id },
  ],
  filters: [
    { k: 'fromDate', label: 'Date From', type: 'date' },
    { k: 'toDate', label: 'Date To', type: 'date' },
    {
      k: 'source',
      label: 'Source',
      type: 'select',
      all: 'All Sources',
      opts: [
        { v: 'manual', l: 'Manual' },
        { v: 'purchase', l: 'Purchase GRC' },
      ],
    },
    {
      k: 'kind',
      label: 'Kind',
      type: 'select',
      all: 'Entries and reversals',
      opts: [
        { v: 'entry', l: 'Entry' },
        { v: 'reversal', l: 'Reversal' },
      ],
    },
  ],
  columns: [
    { k: 'journalDate', t: 'Date', f: 'date' },
    { k: 'referenceNo', t: 'Reference' },
    { k: 'source', t: 'Source', value: (r) => SOURCE_LABEL[r.source] || r.source },
    { k: 'sourceRefNo', t: 'Document' },
    { k: 'narration', t: 'Narration' },
    { k: 'kind', t: 'Kind', value: (r) => (r.kind === 'reversal' ? 'Reversal' : 'Entry') },
    { k: 'totalDebit', t: 'Debit', f: 'amount' },
    { k: 'totalCredit', t: 'Credit', f: 'amount' },
    { k: 'status', t: 'Status', f: 'pill' },
  ],
};

export default function JournalListPage() {
  return <ListView cfg={CONFIG} />;
}
