import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Ledger from '@/models/Ledger';
import LedgerGroup from '@/models/LedgerGroup';
import VoucherSetting from '@/models/VoucherSetting';
import Voucher from '@/models/Voucher';
import { requireSession } from '@/lib/session';

/* /api/voucher/ledgers?type=receipt&side=cr&business=&location=&finYear=
   -> { options: [{ value, label, balance }] }

   Feeds the ledger dropdowns on the voucher forms, and this is what makes
   Masters -> Voucher Settings mean something: that screen holds a Dr and a
   Cr list of ledger GROUPS per voucher type, and each dropdown offers the
   ledgers sitting under the groups for its side.

   Sub-groups count. Ticking "Bank Accounts" offers everything beneath it,
   which is the only reading that makes the tree worth having - the same walk
   the dashboard does for EXPENSES.

   Fallback: with nothing configured, every ledger is offered. A brand new
   install has no Voucher Settings row, and an empty dropdown with no
   explanation is worse than an unfiltered one. */

const json = (d, s = 200) => Response.json(d, { status: s });
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

/* every group id at or beneath the ticked ones */
function descendants(groups, rootIds) {
  const byParent = new Map();
  for (const g of groups) {
    const key = String(g.parentGroupId || 'root');
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  }
  const out = [];
  const seen = new Set();
  const walk = (id) => {
    if (seen.has(String(id))) return;   // a cycle in the tree must not hang this
    seen.add(String(id));
    out.push(id);
    (byParent.get(String(id)) || []).forEach((c) => walk(c._id));
  };
  rootIds.forEach(walk);
  return out;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const type = String(sp.get('type') || '').toLowerCase();
  const side = sp.get('side') === 'dr' ? 'dr' : 'cr';
  const b = sp.get('business');
  const businessId = b && isValidObjectId(b) ? b : null;
  /* the discount row picks from any ledger - it is not part of the
     configured money-in / money-out sides */
  const anyLedger = sp.get('any') === '1';

  await dbConnect();

  const ledgerScope = businessId ? { businessId } : {};
  let filter = { ...ledgerScope };

  if (!anyLedger && type) {
    const setting = await VoucherSetting.findOne(ledgerScope).lean();
    const picked = setting?.groups?.[type]?.[side] || [];
    const rootIds = picked.filter((id) => isValidObjectId(id));

    if (rootIds.length) {
      const groups = await LedgerGroup.find(ledgerScope).select('_id parentGroupId').lean();
      filter.ledgerGroupId = { $in: descendants(groups, rootIds) };
    }
    /* else: nothing configured for this side - leave the filter open */
  }

  const rows = await Ledger.find(filter).sort({ name: 1 }).limit(500).lean();
  if (!rows.length) return json({ options: [], configured: false });

  /* Balance = opening balance, plus everything posted to that ledger by a
     voucher. Vouchers are the only thing in this project that posts, so this
     is the whole picture rather than a partial one. */
  const ids = rows.map((r) => r._id);
  const posted = await Voucher.aggregate([
    { $match: { ...(businessId ? { businessId: rows[0].businessId } : {}) } },
    { $unwind: '$lines' },
    { $match: { 'lines.ledgerId': { $in: ids } } },
    {
      $group: {
        _id: '$lines.ledgerId',
        debit: { $sum: { $ifNull: ['$lines.debit', 0] } },
        credit: { $sum: { $ifNull: ['$lines.credit', 0] } },
      },
    },
  ]);
  const movement = new Map(posted.map((p) => [String(p._id), r2(p.debit - p.credit)]));

  return json({
    options: rows.map((r) => ({
      value: String(r._id),
      label: r.name || '(untitled)',
      balance: r2((Number(r.openingBalance) || 0) + (movement.get(String(r._id)) || 0)),
    })),
    configured: true,
  });
}
