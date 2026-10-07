'use client';
import IcInboxView from '@/components/IcInboxView';

/* Inter Company Sales Return - /admin/transaction/intercompanysell/salereturn

   The mirror of Auto Purchases Received. The top list holds Auto Purchase
   Returns raised BY ANOTHER BRANCH and pointed back at this one; accepting
   one writes an Inter Company Sales Return here and moves the row down.

   Unlike a receipt, accepting a return does NOT create a GRC - the goods are
   coming back into the branch that originally shipped them, and the
   accounting side of that is a Credit Note, which lives in the Sell module.
   Say the word if you want the accept action to raise one automatically. */

const PENDING = {
  title: 'Pending Inter Company Sale Returns',
  endpoint: '/api/ic-auto-purchase-return',
  file: 'pending-ic-sales-return',
  /* returns pointed at me, not yet accepted */
  inboxParam: 'inbox',
  unconvertedParam: 'icSalesReturnId',
  actionEndpoint: '/api/ic-sales-return',
  actionKey: 'icAutoPurchaseReturnId',
  actionLabel: 'Accept',
  confirm: 'Accept this return?',
  columns: [
    { k: 'returnNo', t: 'Return No' },
    { k: 'returnDate', t: 'Date', f: 'date' },
    { k: 'businessId', t: 'From Business', f: 'ref' },
    { k: 'locationId', t: 'From Location', f: 'ref' },
    { k: 'totalQty', t: 'Total Qty', f: 'amount' },
  ],
};

const ACCEPTED = {
  title: 'Accepted Inter Company Sale Returns',
  endpoint: '/api/ic-sales-return',
  file: 'ic-sales-return',
  columns: [
    { k: 'refNo', t: 'Ref', f: 'dash' },
    { k: 'returnCode', t: 'Return Code' },
    { k: 'date', t: 'Date', f: 'date' },
    { k: 'fromBusinessId', t: 'From Business', f: 'ref' },
    { k: 'fromLocationId', t: 'From Location', f: 'ref' },
    { k: 'totalQty', t: 'Total Qty', f: 'amount' },
  ],
};

export default function IcSalesReturnPage() {
  return <IcInboxView pending={PENDING} actioned={ACCEPTED} />;
}
