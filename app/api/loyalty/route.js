import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import {
  resolveCustomerLoyalty, pointsBalance, allowedRedemption,
} from '@/lib/loyalty';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/loyalty?business=<id>&customer=<id>&amount=<bill>

   What the till needs to show the loyalty strip: is loyalty on, what does this
   customer hold, and how much of it may come off the bill in front of them.

   SEPARATE FROM /api/loyalty-point, which is the Masters screen's CRUD for the
   settings themselves. That one is gated on the Loyalty Point master, so a
   cashier who may run the till but not edit the master would be refused it -
   and the till would lose the balance. This returns no settings a cashier
   could not already infer from their own screen: the conversion rate, the
   caps, and this one customer's number.

   A read only. Nothing here moves a point; that happens when the sale is
   saved, inside the same transaction - see app/api/sell-pos/route.js. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  /* Roles & Permissions (17-10-2026): the till reads this while billing, so
     POS Read, Create OR Update lets it through; refused only when all three
     are withheld for the business */
  let denied = null;
  for (const action of [PERM.READ, PERM.CREATE, PERM.UPDATE]) {
    denied = await screenDenial({ session, screen: SCREENS.POS, label: 'POS', action, businessId: sp.get('business') });
    if (!denied) break;
  }
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const txDate = sp.get('date') || new Date();
  const customer = (sp.get('customer') || '').trim();
  const amount = Number(sp.get('amount') || 0);

  const resolution = await resolveCustomerLoyalty({
    businessId: sp.get('business'),
    customerId: customer,
    date: txDate,
  });
  const rules = resolution.rules;

  /* A walk-in has nobody to credit. Report whether the business has any active
     loyalty scheme so the till knows whether to prompt for a customer. */
  if (!customer) {
    return json({
      active: Boolean(resolution.active),
      eligible: false,
      contactTypeEligible: false,
      balance: 0,
      balanceValue: 0,
      todayLockedPoints: 0,
      allowedPoints: 0,
      allowedAmount: 0,
      reason: resolution.reason,
    });
  }

  /* Strictly use ONLY the loyalty scheme assigned to the customer's Contact
     Type. If Not Applicable, inactive, or outside validity dates, never fall
     back to any other scheme. */
  if (!resolution.eligible || !rules) {
    return json({
      active: Boolean(resolution.active),
      eligible: false,
      contactTypeEligible: false,
      contactTypeName: resolution.contactType?.name || '',
      schemeId: rules?.schemeId || '',
      name: rules?.name || '',
      balance: 0,
      balanceValue: 0,
      todayLockedPoints: 0,
      allowedPoints: 0,
      allowedAmount: 0,
      reason: resolution.reason || 'Loyalty Points Not Applicable for This Customer Type',
    });
  }

  const balance = await pointsBalance({ businessId: sp.get('business'), customerId: customer });
  /* points earned TODAY spend from TOMORROW - the redemption ceiling is
     worked on the balance without them, while `balance` above stays the
     full figure for display */
  const redeemable = await pointsBalance({
    businessId: sp.get('business'), customerId: customer, excludeEarnedToday: true,
  });
  const allowed = allowedRedemption({ rules, balance: redeemable, billAmount: amount });
  const todayLockedPoints = Math.max(0, balance - redeemable);

  return json({
    active: true,
    eligible: true,
    contactTypeEligible: true,
    contactTypeName: resolution.contactType?.name || '',
    schemeId: rules.schemeId,
    name: rules.name,
    fromDate: rules.fromDate,
    toDate: rules.toDate,
    pointsToInr: rules.pointsToInr,
    /* the six-field master's earning model, for the till's preview */
    perAmountModel: rules.hasPerAmount,
    purchaseAmountForOnePoint: rules.purchaseAmountForOnePoint,
    otpRequired: rules.otpRequired,
    earningPercentage: rules.earningPercentage,
    minPurchaseAmount: rules.minPurchaseAmount,
    maxRewardPoint: rules.maxRewardPoint,
    minRedemptionPoints: rules.minRedemptionPoints,
    maxRedemptionPoints: rules.maxRedemptionPoints,
    minAmountForRedemption: rules.minAmountForRedemption,
    balance,
    balanceValue: balance * rules.pointsToInr,
    todayLockedPoints,
    allowedPoints: allowed.points,
    allowedAmount: allowed.amount,
    reason: allowed.points === 0 && todayLockedPoints > 0 && balance > 0
      ? 'Points earned today can be redeemed from tomorrow.'
      : allowed.reason,
  });
}
