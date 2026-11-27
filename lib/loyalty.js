import { isValidObjectId, Types } from 'mongoose';
import LoyaltyPoint from '@/models/LoyaltyPoint';
import LoyaltyLedger, { LOYALTY_KIND } from '@/models/LoyaltyLedger';
import ContactType from '@/models/ContactType';
import Business from '@/models/Business';
import { Customer } from '@/lib/contacts';

export const LOYALTY_DISABLED_BY_TYPE_MSG = 'Loyalty Points Not Applicable for This Customer Type';

/* --------------------------------------------------------------------------
   Date helpers (YYYY-MM-DD, timezone-safe for date-picker inputs)
   -------------------------------------------------------------------------- */
export function toYmd(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export function normalizeSchemeRow(doc) {
  if (!doc) return null;
  const applicableRaw = doc.loyaltyPointsApplicable;
  const loyaltyPointsApplicable =
    applicableRaw === undefined || applicableRaw === null || String(applicableRaw).trim() === ''
      ? 'Yes'
      : String(applicableRaw).trim().toLowerCase() === 'yes'
        ? 'Yes'
        : 'No';
  const active = String(doc.active || '').trim().toLowerCase() === 'yes' ? 'Yes' : 'No';
  return {
    ...doc,
    _id: String(doc._id),
    businessId: doc.businessId ? String(doc.businessId) : '',
    active,
    loyaltyPointsApplicable,
    /* schemes saved before the field existed behave as next-day, which is
       what the till always enforced */
    redeemTiming: String(doc.redeemTiming || '').trim().toLowerCase() === 'instant' ? 'instant' : 'nextDay',
    fromDate: toYmd(doc.fromDate) || '',
    toDate: toYmd(doc.toDate) || '',
  };
}

export function validateSchemeRules(doc, errors) {
  if (doc.pointsToInr !== null && doc.pointsToInr !== undefined && Number(doc.pointsToInr) < 0) {
    errors.pointsToInr = 'Points to INR cannot be negative.';
  }
  if (
    doc.purchaseAmountForOnePoint !== null &&
    doc.purchaseAmountForOnePoint !== undefined &&
    Number(doc.purchaseAmountForOnePoint) < 0
  ) {
    errors.purchaseAmountForOnePoint = 'Purchase amount cannot be negative.';
  }
  const fromYmd = toYmd(doc.fromDate);
  const toYmdVal = toYmd(doc.toDate);
  if ((fromYmd && !toYmdVal) || (!fromYmd && toYmdVal)) {
    if (!fromYmd) errors.fromDate = 'From Date is required when To Date is set.';
    if (!toYmdVal) errors.toDate = 'To Date is required when From Date is set.';
  } else if (fromYmd && toYmdVal && toYmdVal < fromYmd) {
    errors.toDate = 'To Date cannot be earlier than From Date.';
  }
  doc.active = String(doc.active || '').trim().toLowerCase() === 'no' ? 'No' : 'Yes';
  doc.loyaltyPointsApplicable =
    String(doc.loyaltyPointsApplicable ?? 'Yes').trim().toLowerCase() === 'no' ? 'No' : 'Yes';
  doc.redeemTiming =
    String(doc.redeemTiming || '').trim().toLowerCase() === 'instant' ? 'instant' : 'nextDay';
  return { errors, doc, ok: Object.keys(errors).length === 0 };
}

/* Loyalty Points - the rules, in one place.

   Masters -> Loyalty Point holds the settings; this turns them into the two
   answers the till needs: how many points a bill earns, and how much a
   customer may take off the next one.

   EVERYTHING HERE IS OFF BY DEFAULT. A business with no Loyalty Point record,
   or one marked Active = No, gets `null` from rules() and every function below
   then does nothing at all. That is what lets this be added to a live till
   without changing a single existing sale.

   POINTS BELONG TO A NAMED CUSTOMER. A walk-in bill has nobody to credit and
   nobody to charge, so it neither earns nor redeems. */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const asId = (v) => (v && isValidObjectId(String(v)) ? new Types.ObjectId(String(v)) : null);

/* The settings for a business, or null when loyalty is not in play.

   Read fresh rather than cached: it is one small document, and a cache here
   would mean an operator changing the earning rate has to wait for something
   invisible to expire before the till agrees. */
/* Convert one LoyaltyPoint scheme document into normalized till rules, or
   null if neither earning nor redemption is configured on it. */
export function schemeToRules(doc) {
  if (!doc) return null;
  const isActive = String(doc.active || '').trim().toLowerCase() === 'yes';
  const rawApplicable = doc.loyaltyPointsApplicable;
  /* Legacy LoyaltyPoint docs created before loyaltyPointsApplicable existed
     did not carry the field and are treated as applicable ('Yes'). */
  const isApplicable =
    rawApplicable === undefined || rawApplicable === null || String(rawApplicable).trim() === ''
      ? true
      : String(rawApplicable).trim().toLowerCase() === 'yes';

  const rules = {
    schemeId: doc._id ? String(doc._id) : '',
    name: String(doc.loyaltyPointName || 'Loyalty Points'),
    active: isActive,
    loyaltyPointsApplicable: isApplicable,
    fromDate: toYmd(doc.fromDate),
    toDate: toYmd(doc.toDate),
    pointsToInr: num(doc.pointsToInr),
    purchaseAmountForOnePoint: num(doc.purchaseAmountForOnePoint),
    hasPerAmount: doc.purchaseAmountForOnePoint !== undefined && doc.purchaseAmountForOnePoint !== null,
    expiryMonths: num(doc.pointsExpireAfter),
    otpRequired: String(doc.otpRequired || '').trim().toLowerCase() === 'yes',
    /* 'instant' lets same-day earnings redeem; anything else - including a
       scheme saved before the field existed - is 'nextDay' */
    redeemTiming: String(doc.redeemTiming || '').trim().toLowerCase() === 'instant' ? 'instant' : 'nextDay',
    earningPercentage: num(doc.earningPercentage),
    minPurchaseAmount: num(doc.minPurchaseAmount),
    maxRewardPoint: num(doc.maxRewardPoint),
    maxRedemptionPoints: num(doc.maxRedemptionPoints),
    minRedemptionPoints: num(doc.minRedemptionPoints),
    minAmountForRedemption: num(doc.minAmountForRedemption),
    expiryDays: num(doc.expiryPeriod),
    createdAt: doc.createdAt ? new Date(doc.createdAt).getTime() : 0,
  };

  const earns = rules.hasPerAmount ? rules.purchaseAmountForOnePoint > 0 : rules.earningPercentage > 0;
  if (rules.pointsToInr <= 0 && !earns) return null;

  return rules;
}

export function isSchemeEligibleOnDate(rules, txDate = new Date()) {
  if (!rules) return false;
  if (!rules.active || !rules.loyaltyPointsApplicable) return false;
  const day = toYmd(txDate) || toYmd(new Date());
  if (rules.fromDate && day < rules.fromDate) return false;
  if (rules.toDate && day > rules.toDate) return false;
  return true;
}

function schemeDateSpanDays(rules) {
  if (!rules?.fromDate || !rules?.toDate) return Number.MAX_SAFE_INTEGER;
  const start = new Date(rules.fromDate).getTime();
  const end = new Date(rules.toDate).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return Number.MAX_SAFE_INTEGER;
  return Math.max(0, Math.round((end - start) / (24 * 60 * 60 * 1000)));
}

/* Deterministic priority ordering when multiple schemes are simultaneously
   eligible on a transaction date (never awarding cumulatively across multiple
   schemes):
     1. Date-bounded schemes take priority over unbounded legacy configs.
     2. Narrower validity window wins (specific promo over year-long scheme).
     3. Most recent fromDate wins.
     4. Most recently created scheme wins. */
function compareEligibleSchemes(a, b) {
  const aBounded = a.fromDate && a.toDate ? 0 : 1;
  const bBounded = b.fromDate && b.toDate ? 0 : 1;
  if (aBounded !== bBounded) return aBounded - bBounded;

  const spanDiff = schemeDateSpanDays(a) - schemeDateSpanDays(b);
  if (spanDiff !== 0) return spanDiff;

  if ((a.fromDate || '') !== (b.fromDate || '')) {
    return (b.fromDate || '').localeCompare(a.fromDate || '');
  }
  return (b.createdAt || 0) - (a.createdAt || 0);
}

/* Resolve all configured schemes for a business and return the ones active,
   applicable, and valid on `date`, sorted in priority order. */
export async function eligibleLoyaltySchemes(businessId, { date = new Date() } = {}) {
  const id = asId(businessId);
  if (!id) return { allSchemesCount: 0, eligibleSchemes: [] };

  const docs = await LoyaltyPoint.find({ businessId: id }).sort({ createdAt: -1 }).lean();
  const eligibleSchemes = docs
    .map(schemeToRules)
    .filter((r) => isSchemeEligibleOnDate(r, date))
    .sort(compareEligibleSchemes);

  return {
    allSchemesCount: docs.length,
    eligibleSchemes,
  };
}

/* Resolve the single scheme to apply for a transaction. If `schemeId` is
   provided, it must be among the business's eligible schemes for `date`
   (otherwise `requestedInvalid: true` is returned so the backend can reject
   attempts to apply an inactive, inapplicable, or out-of-date scheme). */
export async function resolveLoyaltyScheme(businessId, { date = new Date(), schemeId = '' } = {}) {
  const { allSchemesCount, eligibleSchemes } = await eligibleLoyaltySchemes(businessId, { date });
  const wantedId = String(schemeId || '').trim();

  if (wantedId) {
    const matched = isValidObjectId(wantedId)
      ? eligibleSchemes.find((s) => s.schemeId === wantedId)
      : null;
    if (!matched) {
      return {
        rules: null,
        eligibleSchemes,
        allSchemesCount,
        requestedInvalid: true,
        reason: 'Selected loyalty scheme is not active, not applicable, or outside its validity dates.',
      };
    }
    return {
      rules: matched,
      eligibleSchemes,
      allSchemesCount,
      requestedInvalid: false,
      reason: '',
    };
  }

  if (!eligibleSchemes.length) {
    return {
      rules: null,
      eligibleSchemes: [],
      allSchemesCount,
      requestedInvalid: false,
      reason: allSchemesCount === 0
        ? 'No loyalty point scheme configured for this business.'
        : 'No active loyalty scheme is valid for this transaction date.',
    };
  }

  return {
    rules: eligibleSchemes[0],
    eligibleSchemes,
    allSchemesCount,
    requestedInvalid: false,
    reason: '',
  };
}

/* The active highest-priority settings for a business on a given date, or null
   when no eligible scheme is in play. */
export async function loyaltyRules(businessId, opts = {}) {
  const { rules } = await resolveLoyaltyScheme(businessId, opts);
  return rules;
}

/* CONTACT-TYPE SCHEME VALIDATION & POS RESOLUTION.

   Every Contact Type optionally points to ONE LoyaltyPoint scheme via
   `loyaltySchemeId` (null = Not Applicable). Legacy Contact Types without
   `loyaltySchemeId` (even if `loyaltyPointsApplicable === true` from an older
   boolean toggle) safely resolve as Not Applicable without mutating records. */

export async function validateContactTypeLoyaltyScheme({ businessId, loyaltySchemeId }) {
  const rawId = loyaltySchemeId ? String(loyaltySchemeId).trim() : '';
  if (!rawId) {
    return {
      ok: true,
      loyaltySchemeId: null,
      loyaltyPointsApplicable: false,
      scheme: null,
    };
  }

  if (!isValidObjectId(rawId)) {
    return {
      ok: false,
      error: 'Selected loyalty scheme is invalid.',
    };
  }

  const scheme = await LoyaltyPoint.findById(rawId).lean();
  if (!scheme) {
    return {
      ok: false,
      error: 'Selected loyalty scheme does not exist.',
    };
  }

  const bizId = asId(businessId);
  if (bizId && scheme.businessId && String(scheme.businessId) !== String(bizId)) {
    return {
      ok: false,
      error: 'Selected loyalty scheme does not belong to this business.',
    };
  }

  return {
    ok: true,
    loyaltySchemeId: String(scheme._id),
    loyaltyPointsApplicable: true,
    scheme,
  };
}

export async function resolveCustomerLoyalty({ businessId, customerId, date = new Date() }) {
  const bizId = asId(businessId);
  const custId = asId(customerId);

  const hasBusinessScheme = async () => {
    if (!bizId) return false;
    const docs = await LoyaltyPoint.find({ businessId: bizId }).lean();
    return docs.some((d) => isSchemeEligibleOnDate(schemeToRules(d), date));
  };

  if (!custId) {
    const active = await hasBusinessScheme();
    return {
      active,
      eligible: false,
      contactTypeEligible: false,
      rules: null,
      customer: null,
      contactType: null,
      reason: active
        ? 'Select a customer to earn or redeem points.'
        : 'No active loyalty point scheme configured for this business.',
    };
  }

  const customer = await Customer.findById(custId)
    .select('_id businessId typeId contactKind')
    .lean();
  if (!customer || (customer.contactKind && customer.contactKind !== 'Customer')) {
    return {
      active: await hasBusinessScheme(),
      eligible: false,
      contactTypeEligible: false,
      rules: null,
      customer: null,
      contactType: null,
      reason: 'Selected customer was not found.',
    };
  }

  if (bizId && customer.businessId && String(customer.businessId) !== String(bizId)) {
    return {
      active: true,
      eligible: false,
      contactTypeEligible: false,
      rules: null,
      customer,
      contactType: null,
      reason: 'Customer does not belong to the selected business.',
    };
  }

  const typeId = asId(customer.typeId);
  if (!typeId) {
    return {
      active: await hasBusinessScheme(),
      eligible: false,
      contactTypeEligible: false,
      rules: null,
      customer,
      contactType: null,
      reason: LOYALTY_DISABLED_BY_TYPE_MSG,
    };
  }

  const contactType = await ContactType.findById(typeId)
    .select('_id businessId name contactType status loyaltySchemeId loyaltyPointsApplicable')
    .lean();
  if (!contactType) {
    return {
      active: await hasBusinessScheme(),
      eligible: false,
      contactTypeEligible: false,
      rules: null,
      customer,
      contactType: null,
      reason: LOYALTY_DISABLED_BY_TYPE_MSG,
    };
  }

  if (bizId && contactType.businessId && String(contactType.businessId) !== String(bizId)) {
    return {
      active: true,
      eligible: false,
      contactTypeEligible: false,
      rules: null,
      customer,
      contactType,
      reason: 'Customer Contact Type does not belong to the selected business.',
    };
  }

  if (contactType.loyaltyPointsApplicable !== true) {
    return {
      active: await hasBusinessScheme(),
      eligible: false,
      contactTypeEligible: false,
      rules: null,
      customer,
      contactType,
      reason: LOYALTY_DISABLED_BY_TYPE_MSG,
    };
  }

  const assignedSchemeId = asId(contactType.loyaltySchemeId);
  const { rules: resolvedRules, reason: schemeReason } = await resolveLoyaltyScheme(bizId, {
    date,
    schemeId: assignedSchemeId ? String(assignedSchemeId) : '',
  });
  if (!resolvedRules) {
    return {
      active: false,
      eligible: false,
      contactTypeEligible: true,
      rules: null,
      customer,
      contactType,
      reason: schemeReason || 'No active loyalty point scheme configured for this business.',
    };
  }

  return {
    active: true,
    eligible: true,
    contactTypeEligible: true,
    rules: resolvedRules,
    customer,
    contactType,
    reason: '',
  };
}

export async function customerLoyaltyEligibility({ businessId, customerId }) {
  const res = await resolveCustomerLoyalty({ businessId, customerId });
  return {
    eligible: res.eligible,
    reason: res.reason,
    customer: res.customer,
    contactType: res.contactType,
  };
}

/* The business's configured IANA timezone (Business.timezone on the master),
   or '' when unset - callers then fall back to the server's own day. */
export async function businessTimeZone(businessId) {
  const id = asId(businessId);
  if (!id) return '';
  const biz = await Business.findById(id).select('timezone').lean();
  return String(biz?.timezone || '').trim();
}

/* Wall-clock fields of `date` as seen in `timeZone`. */
function tzParts(date, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const p = {};
  dtf.formatToParts(date).forEach((part) => { if (part.type !== 'literal') p[part.type] = part.value; });
  return {
    y: Number(p.year), m: Number(p.month), d: Number(p.day),
    H: Number(p.hour) % 24, M: Number(p.minute), S: Number(p.second),
  };
}

/* The UTC instant of local midnight on `now`'s calendar day IN `timeZone`.

   "Earned today" has to mean the business's today, not the server's: a till
   in Kolkata must not unlock points at 05:30 IST because the host runs UTC.
   With no (or an invalid) timezone this is the server's own midnight, which
   is what the till did before timezones were consulted. */
export function startOfDayInZone(now, timeZone) {
  const fallback = new Date(now);
  fallback.setHours(0, 0, 0, 0);
  if (!timeZone) return fallback;
  try {
    const today = tzParts(now, timeZone);
    const wallMs = (p) => Date.UTC(p.y, p.m - 1, p.d, p.H, p.M, p.S);
    /* offset = wall-clock-as-UTC minus the instant; midnight local is
       UTC-midnight minus that offset. Recomputed once at the candidate so a
       DST shift between `now` and midnight cannot land an hour off. */
    let guess = Date.UTC(today.y, today.m - 1, today.d)
      - (wallMs(tzParts(now, timeZone)) - now.getTime());
    for (let i = 0; i < 2; i += 1) {
      guess = Date.UTC(today.y, today.m - 1, today.d)
        - (wallMs(tzParts(new Date(guess), timeZone)) - guess);
    }
    return new Date(guess);
  } catch {
    return fallback;
  }
}

/* WHAT A CUSTOMER HAS, counted as dated lots.

   Points expire, so a balance is not simply the sum of the column. Earnings
   are laid out oldest first, past redemptions are taken off the front of that
   queue, and what remains is counted only if it has not passed its date.

   FIFO because the alternative spends the newest points first and quietly
   lets the oldest expire - the customer loses points they were entitled to,
   and nothing in the record explains why.

   Returns whole points. A fraction of a point cannot be spent, and rounding
   at the point of display rather than here is how a balance that says 4 buys
   only 3. */
export async function pointsBalance({
  businessId, customerId, now = new Date(), excludeEarnedToday = false,
  timeZone = '', session = null,
}) {
  const business = asId(businessId);
  const customer = asId(customerId);
  if (!business || !customer) return 0;

  let q = LoyaltyLedger
    .find({ businessId: business, customerId: customer })
    .sort({ createdAt: 1 });
  if (session) q = q.session(session);
  const rows = await q.lean();

  /* POINTS EARNED TODAY ARE SPENDABLE FROM TOMORROW when the scheme says so
     (excludeEarnedToday). With it the lots earned since BUSINESS-midnight -
     the business's configured timezone, server-local when unset - are left
     out, so the redemption ceiling is yesterday's balance; the plain call
     still reports the full balance for display. */
  const dayStart = startOfDayInZone(now, timeZone);

  const lots = [];
  let spent = 0;

  for (const row of rows) {
    const points = num(row.points);
    if (points > 0) {
      if (excludeEarnedToday && row.createdAt && new Date(row.createdAt) >= dayStart) continue;
      lots.push({ points, expiresAt: row.expiresAt || null });
    } else spent += Math.abs(points);
  }

  /* take what has already been spent off the oldest lots first */
  for (const lot of lots) {
    if (spent <= 0) break;
    const taken = Math.min(lot.points, spent);
    lot.points -= taken;
    spent -= taken;
  }

  const live = lots.reduce((sum, lot) => (
    lot.points > 0 && (!lot.expiresAt || new Date(lot.expiresAt) > now)
      ? sum + lot.points
      : sum
  ), 0);

  return Math.max(0, Math.floor(live));
}

/* HOW MANY POINTS A BILL EARNS.

   points = bill x earning%, floored, subject to the two gates in the master:
   the bill must reach minPurchaseAmount, and no more than maxRewardPoint is
   given for one bill (0 = no cap).

   Floored, not rounded: a bill that earns 3.9 points earns 3. Rounding up
   would hand out points the percentage did not earn, and half a point cannot
   be spent anyway. */
export function pointsEarnedFor(rules, amount) {
  if (!rules) return 0;
  const value = num(amount);
  if (value <= 0) return 0;

  /* the six-field master: one point per every purchaseAmountForOnePoint
     rupees, nothing else gating it. 0 there means the scheme earns nothing. */
  if (rules.hasPerAmount) {
    return rules.purchaseAmountForOnePoint > 0
      ? Math.floor(value / rules.purchaseAmountForOnePoint)
      : 0;
  }

  /* percentage-era config never re-saved */
  if (rules.earningPercentage <= 0) return 0;
  if (rules.minPurchaseAmount > 0 && value < rules.minPurchaseAmount) return 0;

  let points = Math.floor((value * rules.earningPercentage) / 100);
  if (rules.maxRewardPoint > 0) points = Math.min(points, rules.maxRewardPoint);

  return Math.max(0, points);
}

/* WHAT A NUMBER OF POINTS TAKES OFF A BILL, in rupees. */
export function redemptionValue(rules, points) {
  if (!rules || rules.pointsToInr <= 0) return 0;
  return Math.max(0, Math.floor(num(points))) * rules.pointsToInr;
}

/* THE MOST THIS BILL MAY TAKE, given what the customer holds.

   Four ceilings, and the smallest wins:
     the balance          - cannot spend what is not there
     maxRedemptionPoints  - the master's per-bill cap (0 = none)
     the bill itself      - points may settle a bill, never overpay it and
                            turn into change
     minRedemptionPoints  - below this the answer is zero, not a part of it

   Returned as whole points and as the rupees they are worth, so the till and
   the server can agree without either recomputing the other's figure. */
export function allowedRedemption({ rules, balance, billAmount }) {
  const none = { points: 0, amount: 0, reason: '' };
  if (!rules || rules.pointsToInr <= 0) return { ...none, reason: 'Loyalty redemption is not configured.' };

  const held = Math.max(0, Math.floor(num(balance)));
  const bill = num(billAmount);

  if (held <= 0) return { ...none, reason: 'No points available.' };
  if (rules.minAmountForRedemption > 0 && bill < rules.minAmountForRedemption) {
    return { ...none, reason: `A bill of at least ${rules.minAmountForRedemption} is needed to redeem points.` };
  }

  let points = held;
  if (rules.maxRedemptionPoints > 0) points = Math.min(points, rules.maxRedemptionPoints);
  /* never more than the bill is worth */
  points = Math.min(points, Math.floor(bill / rules.pointsToInr));

  if (points < rules.minRedemptionPoints) {
    return { ...none, reason: `At least ${rules.minRedemptionPoints} points are needed to redeem.` };
  }

  return { points, amount: redemptionValue(rules, points), reason: '' };
}

/* THE ROWS A COMPLETED SALE WRITES.

   Returns the documents rather than saving them, so the caller can insert
   them inside the transaction that creates the invoice - points and the bill
   that moved them land together or not at all.

   Earning is on what the customer actually PAID, after any points came off.
   Points are a discount; earning on the pre-discount figure would pay the
   customer twice for the same money and lets a balance grow by being spent. */
export function saleLedgerRows({
  rules, businessId, locationId, customerId, invoiceId, invoiceNo,
  billAmount, redeemPoints = 0, createdBy = '', now = new Date(),
  schemeId = '', schemeName = '',
}) {
  const rows = [];
  if (!rules) return rows;

  const business = asId(businessId);
  const customer = asId(customerId);
  if (!business || !customer) return rows;

  const resolvedSchemeId = asId(rules.schemeId || schemeId);
  const resolvedSchemeName = String(rules.name || schemeName || '');

  const base = {
    businessId: business,
    locationId: asId(locationId),
    customerId: customer,
    invoiceId: asId(invoiceId),
    invoiceNo: String(invoiceNo || ''),
    schemeId: resolvedSchemeId,
    schemeName: resolvedSchemeName,
    createdBy: String(createdBy || ''),
  };

  const spent = Math.max(0, Math.floor(num(redeemPoints)));
  if (spent > 0) {
    rows.push({
      ...base,
      kind: LOYALTY_KIND.REDEEM,
      points: -spent,
      amount: redemptionValue(rules, spent),
      expiresAt: null,
      note: `${spent} points redeemed on ${base.invoiceNo || 'this bill'}`,
    });
  }

  const payable = Math.max(0, num(billAmount) - redemptionValue(rules, spent));
  const earned = pointsEarnedFor(rules, payable);
  if (earned > 0) {
    rows.push({
      ...base,
      kind: LOYALTY_KIND.EARN,
      points: earned,
      amount: payable,
      /* the master's months first, the old days field for a config never
         re-saved; nothing set means these never expire */
      expiresAt: rules.expiryMonths > 0
        ? (() => { const d = new Date(now); d.setMonth(d.getMonth() + rules.expiryMonths); return d; })()
        : rules.expiryDays > 0
          ? new Date(now.getTime() + rules.expiryDays * 24 * 60 * 60 * 1000)
          : null,
      note: `${earned} points earned on ${base.invoiceNo || 'this bill'}`,
    });
  }

  return rows;
}
