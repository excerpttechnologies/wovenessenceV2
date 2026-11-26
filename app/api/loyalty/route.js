import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import {
  resolveLoyaltyScheme, customerLoyaltyEligibility, pointsBalance, allowedRedemption,
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
  const requestedSchemeId = (sp.get('schemeId') || '').trim();
  const resolved = await resolveLoyaltyScheme(sp.get('business'), {
    date: txDate,
    schemeId: requestedSchemeId,
  });
  /* Fall back to the highest-priority eligible scheme if the requested schemeId
     is no longer valid for the updated transaction date. */
  const fallback = resolved.requestedInvalid && resolved.eligibleSchemes.length
    ? { rules: resolved.eligibleSchemes[0], eligibleSchemes: resolved.eligibleSchemes, reason: '' }
    : resolved;

  const rules = fallback.rules;
  const schemeChoices = (fallback.eligibleSchemes || []).map((s) => ({
    schemeId: s.schemeId,
    name: s.name,
    pointsToInr: s.pointsToInr,
    perAmountModel: s.hasPerAmount,
    purchaseAmountForOnePoint: s.purchaseAmountForOnePoint,
    fromDate: s.fromDate,
    toDate: s.toDate,
    otpRequired: s.otpRequired,
  }));

  /* No active, applicable, in-date scheme exists for this business. */
  if (!rules) {
    return json({
      active: false,
      eligible: false,
      eligibleSchemes: [],
      reason: fallback.reason || 'No active loyalty scheme applies.',
    });
  }

  const customer = (sp.get('customer') || '').trim();
  const amount = Number(sp.get('amount') || 0);

  /* A walk-in has nobody to credit. An active scheme exists, so the till
     tells the cashier to select a customer. */
  if (!customer) {
    return json({
      active: true,
      eligible: false,
      contactTypeEligible: false,
      schemeId: rules.schemeId,
      name: rules.name,
      fromDate: rules.fromDate,
      toDate: rules.toDate,
      eligibleSchemes: schemeChoices,
      pointsToInr: rules.pointsToInr,
      perAmountModel: rules.hasPerAmount,
      purchaseAmountForOnePoint: rules.purchaseAmountForOnePoint,
      otpRequired: rules.otpRequired,
      earningPercentage: rules.earningPercentage,
      minPurchaseAmount: rules.minPurchaseAmount,
      maxRewardPoint: rules.maxRewardPoint,
      minRedemptionPoints: rules.minRedemptionPoints,
      maxRedemptionPoints: rules.maxRedemptionPoints,
      minAmountForRedemption: rules.minAmountForRedemption,
      balance: 0,
      balanceValue: 0,
      todayLockedPoints: 0,
      allowedPoints: 0,
      allowedAmount: 0,
      reason: 'Select a customer to earn or redeem points.',
    });
  }

  /* Enforce Contact Type loyalty eligibility before returning balances or
     redemption caps. */
  const eligibility = await customerLoyaltyEligibility({
    businessId: sp.get('business'),
    customerId: customer,
  });

  if (!eligibility.eligible) {
    return json({
      active: true,
      eligible: false,
      contactTypeEligible: false,
      contactTypeName: eligibility.contactType?.name || '',
      schemeId: rules.schemeId,
      name: rules.name,
      eligibleSchemes: [],
      balance: 0,
      balanceValue: 0,
      todayLockedPoints: 0,
      allowedPoints: 0,
      allowedAmount: 0,
      reason: eligibility.reason || 'Loyalty Points Not Applicable for This Customer Type',
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
    contactTypeName: eligibility.contactType?.name || '',
    schemeId: rules.schemeId,
    name: rules.name,
    fromDate: rules.fromDate,
    toDate: rules.toDate,
    eligibleSchemes: schemeChoices,
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
