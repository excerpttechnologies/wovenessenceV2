# Customer form — how it differs from Supplier and Agent

`app/admin/contact/customer/` — Add / Edit Customer.

Supplier, Agent and Customer share `models/Contact.js`, `TabbedFormView` and the
`contactKind` discriminator. They do **not** share a field list — each has its
own `tabs.js`. This one is matched to
`erp.orbiteerp.com/admin/contact/customer/add`.

Three tabs: **Basic Information · Sales Details · Financial Details**.

---

## The problem this fixed

Sales Details and Financial Details were a straight copy of the **Supplier**
form. A customer is sold to, not bought from, so the screen asked for the wrong
things entirely:

| Was showing | Should be |
|---|---|
| Price Calculation Setup (Markup on Cost RSP/WSP/DP, round-offs) | Price Setup (Price List, Discount Type, Discount) |
| Purchase Order Setup | *gone* |
| Payment Setup (Payment within Days, Payment Date Type…) | Credit Setup |
| Purchase Terms | Sales Term |
| Supplier Ledger Mapping | Group Ledger Mapping |
| Puchase Ledger Mapping (Purchases, Purchases Return) | Ledger Mapping (Sales, Sales Return) |
| TDS Setup | *gone* |
| Supplier Bank Details / Supplier Name as Per Bank | Customer Bank Details / Customer Name as Per Bank |

Nothing outside the form read those keys, so removing them broke no route —
checked across `app/api/`. A customer saved earlier **keeps** whatever it stored
in them; the values are simply no longer editable from this screen.

---

## Sales Details

| Section | Cols | Fields |
|---|---|---|
| Price Setup | 3 | Price List * · Discount Type · Discount |
| Agent Setup | 3 | Agent Name · Commission % · Payment Ledger |
| Credit Setup | 3 | Sale Due Date · Interest Charged if Delay · Grace Days · Invoice Credit Limit · Overdues · Overdues Days Lock |
| Tax Other Setup | 3 | Logistics Terms · Logistics Applicable · Sales Term · Transporter Name · Remarks |

Notes:

- **Price List** defaults to `ON RSP`, matching the deployed screen. Options are
  ON RSP / ON WSP / ON DP / ON MRP, mirroring the price fields the Item master
  already carries.
- **Agent Name** placeholder reads *"Select Supplier"* — that is what the
  deployed screen says, typo and all. It is a real `ref: 'agent'` picker.
- **Credit Setup** fields are placeholder-only (no label above), as deployed.
  All six are stored as numbers; *Sale Due Date* is a day count, not a calendar
  date, which is how it reads next to Grace Days and Overdues Days Lock.
- **Transporter Name** is `ref: 'transporter'`. The deployed screen renders a
  plain `--Select--`, but this project has a real Transporter master, so it is
  wired to that rather than a hard-coded list.

## Financial Details

| Section | Cols | Fields |
|---|---|---|
| Group Ledger Mapping | 3 | Customer Type · Opening Balance * |
| Ledger Mapping | 6 | Sales Ledger · Sales Return Ledger (half width each) |
| Company Reg. Details | 4 | PAN · CIN · GST Type · Gst Reg. Date · SSI No · SSI Reg. Date · MSME No · MSME Reg. Date |
| Customer Bank Details | 3 | Customer Name as Per Bank · Bank Name · Account No. · IFSC · Swift Code |

**Customer Type** is a free-text box, as it renders on the deployed screen
(showing `B2B-Loacl` there). It is not the same thing as the Basic tab's
*Type*, which is a Contact Type picker.

**Bank fields** reuse the same keys as Supplier (`bankAccountName`, `bankName`,
`accountNo`, `ifsc`, `swiftCode`) — only the labels differ per form.

---

## New keys on `models/Contact.js`

Customer-only. Supplier and Agent leave them at their defaults.

```
priceList  saleDueDate  interestChargedIfDelay  graceDays  invoiceCreditLimit
overdues   overduesDaysLock  logisticsApplicable  salesTermId  transporterId
remarks    customerType  salesLedgerId  salesReturnLedgerId
```

## Basic Information

Unchanged by this round, and already matched: identity row 4 across, name row
and both address blocks 6 across, no Contact Type (2), no Allow Login / User
Name / Password.

Its **Zip Code** fields now autofill City, State, Country and District — see
[PINCODE-AUTOFILL.md](../../../../PINCODE-AUTOFILL.md). That change applies to
Supplier and Agent too.

### Still open

The deployed Basic tab shows **Business Type = "Un-Registered"**, a value that
is not in this project's option list (8 legal-entity types: Proprietorship,
Partnership, LLP, …). It has been added at the top and set as the default so the
deployed default renders. If that dropdown is really a GST-status list
(Registered / Un-Registered) rather than entity types, replace `opts` — the
screenshot only reveals the selected value, not the list.

---

## Related

- [Agent form](../agent/README-AGENT-FORM.md) — the same exercise for Agents
- [PIN code autofill](../../../../PINCODE-AUTOFILL.md)
