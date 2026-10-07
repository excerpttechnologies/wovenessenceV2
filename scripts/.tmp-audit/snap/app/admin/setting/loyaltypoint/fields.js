/* Form fields for Loyalty Point.
   Lives beside the pages that use it - not in a global registry. */

export const SECTIONS = [
    { title: "", fields: [{"k":"active","label":"Active :","type":"radio","def":"Yes","opts":[{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}]},{"k":"loyaltyPointName","label":"Loyalty point name","type":"text","req":true},{"k":"pointsToInr","label":"Points to INR (1 Point = ? INR)","type":"number","req":true,"def":0},{"k":"earningPercentage","label":"Earning in percentage (0 to 100)","type":"number","req":true,"def":0},{"k":"minPurchaseAmount","label":"Min purchase amount","type":"number","req":true,"def":0},{"k":"maxRewardPoint","label":"Max reward point [0 = No Limit]","type":"number","req":true,"def":0},{"k":"expiryPeriod","label":"Expiry Period (IN Days) [0 = No Expiry]","type":"number","req":true,"def":0},{"k":"ledgerId","label":"Ledger","type":"ref","ref":"ledger","req":true}] },
    { title: "Redemption", fields: [{"k":"minRedemptionPoints","label":"Min redemption Points","type":"number","req":true,"def":0},{"k":"maxRedemptionPoints","label":"Max redemption Points [0 = No Limit]","type":"number","req":true,"def":0},{"k":"minAmountForRedemption","label":"Min amount required for redemption","type":"number","req":true,"def":0},{"k":"redemptionType","label":"Redemption type","type":"select","req":true,"def":"Gateway","opts":[{"v":"Gateway","l":"Gateway"},{"v":"Manual","l":"Manual"}]},{"k":"otpRequired","label":"OTP required for redemption","type":"select","req":true,"def":"No","opts":[{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}]}] },
  ];

/* What /api/loyalty-point validates and stores - every field across both
   sections, flattened. Derived rather than declared so the two can never drift:
   this page renders SECTIONS, and anything rendered has to be saveable.

   It was previously a hand-written `[ , ]` - a sparse array with one hole.
   validate() iterates with forEach, which SKIPS holes, so the route produced an
   empty document and silently dropped every value typed on this screen. Same
   failure the totals fields had before they were added to the route field
   lists; the array shape just made it harder to see. */
export const FIELDS = SECTIONS.flatMap((s) => s.fields || []);
