import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';

import Grc from '@/models/Grc';
import Grt from '@/models/Grt';
import DeliveryChallan from '@/models/DeliveryChallan';
import SalesReturn from '@/models/SalesReturn';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import IcDeliveryChallan from '@/models/IcDeliveryChallan';
import IcAutoPurchaseReturn from '@/models/IcAutoPurchaseReturn';
import StockTransferLocation from '@/models/StockTransferLocation';
import StockTransferPacket from '@/models/StockTransferPacket';
import BarcodeSetting from '@/models/BarcodeSetting';

/* ==========================================================================
   /api/notifications - what needs attention in the current scope.

   DERIVED, NOT STORED. There is no notification collection and nothing
   writes events; each item is a live count of documents sitting in a state
   that needs someone to act. Same approach as /api/ledger-transaction, and
   for the same reason - the state already exists, it just has never been
   surfaced anywhere but the individual screens.

   The consequence worth knowing: these are OUTSTANDING WORK counters, not
   messages. There is nothing to mark as read - a count drops when the work
   behind it is done. That is deliberate. A dismissable badge would go quiet
   while the GRCs stayed uninvoiced.

   Adding a source is one entry in SOURCES.

   `null` on a claim field matches missing AND null in MongoDB, which is what
   the rest of the app relies on for its "unconverted" filters.
   ========================================================================== */

const json = (d, s = 200) => Response.json(d, { status: s });

/* kind: 'inbox'   someone else acted and it is now your move
         'pending' your own document waiting on its next step
         'warning' a setup gap that blocks work                          */
const SOURCES = [
  /* ------------------------------------------------------------- inbox -- */
  {
    id: 'ic-to-receive',
    kind: 'inbox',
    label: 'Inter company invoices to receive',
    href: '/admin/transaction/intercompanysell/auto-purchases-received',
    /* addressed to my business, not accepted yet. Scoped by destination
       rather than by owner - that is the whole point of an inbox. */
    where: ({ business }) => (business
      ? { toBusinessId: business, receivedId: null }
      : null),
    Model: IcSalesInvoice,
  },
  {
    id: 'ic-returns-to-accept',
    kind: 'inbox',
    label: 'Inter company returns to accept',
    href: '/admin/transaction/intercompanysell/salereturn',
    where: ({ business }) => (business
      ? { toBusinessId: business, icSalesReturnId: null }
      : null),
    Model: IcAutoPurchaseReturn,
  },
  {
    id: 'transfers-to-receive',
    kind: 'inbox',
    label: 'Stock transfers to receive',
    href: '/admin/transaction/stocktransfers/transferstockreceiveds',
    /* addressed to my LOCATION - stock transfers move between locations of
       one business, so the business and year still apply */
    where: ({ business, location, finYear }) => (location
      ? {
        toLocationId: location,
        receivedId: null,
        ...(business ? { businessId: business } : {}),
        ...(finYear ? { finYear } : {}),
      }
      : null),
    Model: StockTransferLocation,
  },

  /* ----------------------------------------------------------- pending -- */
  {
    id: 'grc-uninvoiced',
    kind: 'pending',
    label: 'Goods receipts not yet invoiced',
    href: '/admin/transaction/purchase/grc',
    where: (s) => ({ ...scope(s), purchaseInvoiceId: null }),
    Model: Grc,
  },
  {
    id: 'grt-no-debit-note',
    kind: 'pending',
    label: 'Goods returns without a debit note',
    href: '/admin/transaction/purchase/grt',
    where: (s) => ({ ...scope(s), debitNoteId: null }),
    Model: Grt,
  },
  {
    id: 'dc-uninvoiced',
    kind: 'pending',
    label: 'Delivery challans not yet invoiced',
    href: '/admin/transaction/sell/deliverychallan',
    where: (s) => ({ ...scope(s), salesInvoiceId: null }),
    Model: DeliveryChallan,
  },
  {
    id: 'sales-return-no-credit-note',
    kind: 'pending',
    label: 'Sales returns without a credit note',
    href: '/admin/transaction/sell/salereturn',
    where: (s) => ({ ...scope(s), creditNoteId: null }),
    Model: SalesReturn,
  },
  {
    id: 'ic-dc-uninvoiced',
    kind: 'pending',
    label: 'Inter company challans not yet invoiced',
    href: '/admin/transaction/intercompanysell/deliverychallan',
    where: (s) => ({ ...scope(s), icSalesInvoiceId: null }),
    Model: IcDeliveryChallan,
  },
  {
    id: 'packets-unconsolidated',
    kind: 'pending',
    label: 'Stock packets not despatched',
    href: '/admin/transaction/stocktransfers/transferstockpacket',
    /* packets are scoped by business + year only, matching their own route */
    where: ({ business, finYear }) => ({
      ...(business ? { businessId: business } : {}),
      ...(finYear ? { finYear } : {}),
      stockTransferLocationId: null,
    }),
    Model: StockTransferPacket,
  },
];

function scope({ business, location, finYear }) {
  return {
    ...(business ? { businessId: business } : {}),
    ...(location ? { locationId: location } : {}),
    ...(finYear ? { finYear } : {}),
  };
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const b = sp.get('business');
  const l = sp.get('location');
  const ctx = {
    business: b && isValidObjectId(b) ? b : null,
    location: l && isValidObjectId(l) ? l : null,
    finYear: sp.get('finYear') || '',
  };

  await dbConnect();

  const counted = await Promise.all(SOURCES.map(async (s) => {
    const filter = s.where(ctx);
    /* a source with nothing to scope against is skipped rather than counted
       across every tenant - an inbox with no location is not "everyone's" */
    if (!filter) return null;
    try {
      const count = await s.Model.countDocuments(filter);
      return count > 0
        ? { id: s.id, kind: s.kind, label: s.label, href: s.href, count }
        : null;
    } catch {
      /* one broken source must not take the whole bell down */
      return null;
    }
  }));

  const items = counted.filter(Boolean);

  /* Setup warning: barcode generation refuses to run without a Barcode
     Setting whose effective/expiry window covers today, and the failure is
     only visible once you are already on that screen. */
  if (ctx.business) {
    try {
      const today = new Date();
      const active = await BarcodeSetting.countDocuments({
        businessId: ctx.business,
        ...(ctx.finYear ? { finYear: ctx.finYear } : {}),
        effectiveDate: { $lte: today },
        expiryDate: { $gte: today },
      });
      if (!active) {
        items.push({
          id: 'no-active-barcode-setting',
          kind: 'warning',
          label: 'No barcode setting covers today - generation is blocked',
          href: '/admin/setting/barcodesetting',
          count: 1,
        });
      }
    } catch { /* leave the warning off rather than fail the request */ }
  }

  const order = { inbox: 0, warning: 1, pending: 2 };
  items.sort((x, y) => order[x.kind] - order[y.kind] || y.count - x.count);

  return json({
    total: items.reduce((a, i) => a + i.count, 0),
    /* What the badge shows: how many documents are actually waiting on you,
       plus any setup warning. Deliberately excludes 'pending' - uninvoiced
       GRCs are normal business, and counting them would leave the badge red
       permanently, which is the same as it meaning nothing. */
    actionable: items
      .filter((i) => i.kind !== 'pending')
      .reduce((a, i) => a + i.count, 0),
    items,
  });
}
