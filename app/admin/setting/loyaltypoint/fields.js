/* Form fields for Loyalty Point schemes (/admin/setting/loyaltypoint).
   Lives beside the pages that use it - not in a global registry.

   EARNING under this model: one point for every full "purchase amount for
   1 point" rupees on the bill - 25 here means a 100 bill earns 4 points.
   0 = the scheme redeems old points but earns none. */

const MONTH_OPTS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 18, 24]
  .map((m) => ({ v: String(m), l: m + (m === 1 ? ' Month' : ' Months') }));

export const SECTIONS = [
  {
    title: "",
    fields: [
      { k: "loyaltyPointName", label: "Scheme Name", type: "text", req: true, span: "all" },
      {
        k: "active",
        label: "Active",
        type: "select",
        req: true,
        def: "Yes",
        opts: [{ v: "Yes", l: "Active (Yes)" }, { v: "No", l: "Inactive (No)" }],
      },
      {
        k: "loyaltyPointsApplicable",
        label: "Loyalty Points Applicable",
        type: "select",
        req: true,
        def: "Yes",
        opts: [{ v: "Yes", l: "YES" }, { v: "No", l: "NO" }],
      },
      { k: "pointsToInr", label: "Points to INR (1 Point = ? INR)", type: "number", req: true, def: 0 },
      { k: "purchaseAmountForOnePoint", label: "Purchase Amount for 1 Point [0 = No Points]", type: "number", req: true, def: 0 },
      { k: "pointsExpireAfter", label: "Points Expire After", type: "select", req: true, def: "12", opts: MONTH_OPTS },
      { k: "otpRequired", label: "OTP Required for Redemption", type: "select", req: true, def: "No", opts: [{ v: "Yes", l: "Yes" }, { v: "No", l: "No" }] },
      { k: "fromDate", label: "From Date", type: "date" },
      { k: "toDate", label: "To Date", type: "date" },
    ],
  },
];

/* What /api/loyalty-point validates and stores - every field across the
   sections, flattened. Derived rather than declared so the two can never
   drift: this screen renders FIELDS, and anything rendered has to be
   saveable. */
export const FIELDS = SECTIONS.flatMap((s) => s.fields || []);
