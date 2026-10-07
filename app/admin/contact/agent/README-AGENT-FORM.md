# Agent form — how it differs from Supplier and Customer

`app/admin/contact/agent/` — Add / Edit Agent.

Supplier, Agent and Customer all share `models/Contact.js`, `TabbedFormView` and
the same `contactKind` discriminator. They do **not** share a field list. Each
one has its own `tabs.js`, and the Agent form was brought in line with the
deployed screen at `erp.orbiteerp.com/admin/contact/agent/add`.

This file records the places where "Agent looks wrong, Supplier looks right" is
actually **correct** — so nobody copies fields back in.

---

## Tabs

Basic Information · Purchase Details · Financial Details.

There is no Production Details tab. The deployed Agent form shows one, but it is
empty, so it was dropped rather than rendered blank.

## Basic Information

```
Type *                                  (own row, agent contact types only)
Short Name                              (own row, half width)
Mr. · First Name* · Middle Name · Last Name · DOB · Gender
Billing Details    Address line 1 · Address line 2
                   City · State · Country · District · Zip Code · Mobile*
                   Alt Contact · Landline · Fax · Email · Email 2 · Website URL
Shipping Details   [ ] Same as Billing Address
                   (same six rows again)
```

### Fields deliberately absent

Supplier and Customer carry these. **The Agent form must not.**

| Field | Why not |
|---|---|
| Business Type | not on the deployed Agent screen |
| GST NO | Financial Details already has GST Type / Gst Reg. Date |
| Contact Type (2) | Individual/Business split is a supplier concept |
| Business Name | an agent is a person; see *Naming* below |
| Allow Login, User Name, Password | agents are not portal users here |

Two of those (`businessType`, `contactType2`) used to be `req: true` on this
form. Removing them removes the requirement — an agent saved before this change
keeps whatever it stored, since the keys still exist on the model.

### Naming — the part that has a knock-on effect

`models/Contact.js` sets `LABEL_FIELD = 'businessName'`, and every Agent picker
reads it. Dropping the field from the form would have made every agent created
afterwards show as **"(untitled)"** in the GRC, Delivery, Delivery Challan and
IC Delivery Challan forms, and blank in the Agents list.

So two fallbacks were added at the same time:

- **`app/api/options/route.js`** — refs may declare
  `nameFallback: ['firstName', 'lastName']`. When `businessName` is blank the
  option label, *and the type-ahead search*, use the personal name instead.
  Set on `supplier`, `agent` and `customer`.
- **`app/admin/contact/agent/page.jsx`** — the Name column derives the same way
  via `col.value(row)`.

This mirrors `lib/refLabels.js`, which already fell back for list columns; the
dropdowns were the only place that did not.

The Agents list search (`app/api/agent/route.js`) already searched `firstName`
and `lastName`, so it needed no change.

### Type dropdown

`ref: 'contact-type-agent'`, not `'contact-type'`.

The Contact Type master (`app/admin/contact/contact-type/`) tags every row
Customer / Supplier / Agent. The plain `contact-type` ref returns all of them —
on the seeded tenant that is ten rows including *RETAIL* and *Vendor for Goods*,
none of which are valid for an agent. The narrowed ref filters
`where: { contactType: 'Agent' }` and returns just **AGENTS**.

`contact-type-supplier` and `contact-type-customer` exist alongside it. The
Supplier and Customer forms still use the unfiltered `contact-type` — switching
them is a separate change, since their existing records may point at a type
tagged with a different kind.

## Purchase Details

Matches the deployed screen:

- **no** Markup Price Calculation / Discount Type / Discount
- **no** Agent Setup section
- Payment Setup asks for **Entry Date** and **Document Date** (two date fields),
  where Supplier and Customer ask for a single *Payment Date Type* select.
  `entryDate` and `documentDate` were added to `models/Contact.js`;
  `paymentDateType` stays for the other two forms.

## Financial Details

Five sections. Three of them are **3 across**, not 4:

| Section | Cols | Fields |
|---|---|---|
| Supplier Ledger Mapping | 3 | Supplier Type · Opening Balance |
| Puchase Ledger Mapping | 3 | Purchases · Purchases Return · Consignment Purchases |
| Company Reg. Details | 4 | PAN · CIN · GST Type · Gst Reg. Date · SSI No · SSI Reg. Date · MSME No · MSME Reg. Date |
| TDS Setup | 4 | TDS Ledger · TDS Percent (%) · TDS Name · TDS Section |
| **Agent** Bank Details | 3 | **Agent** Name as Per Bank · Bank Name · Account No. · IFSC · Swift Code |

The bank section is titled *Agent* Bank Details here and *Supplier* Bank Details
on the supplier form; both write the same `bankAccountName` key.

"Puchase Ledger Mapping" is spelled that way on the deployed screen. Left as-is.

---

## Layout mechanics these changes introduced

Both are generic and available to every tabbed form.

- **`section.cols`** — `TabbedFormView` reads `6` → `.form-grid-6`, `3` →
  `.form-grid`, anything else → `.form-grid-4`. Written as literal class
  strings; Tailwind scans source text, so a built-up `xl:grid-cols-${n}` would
  never be generated.
- **`field.row`** — adds `xl:col-start-1`, forcing the field to open a new grid
  row. Needed on Basic Information, where Type, Short Name and the name row each
  sit alone without filling their track count.

## Zip Code autofill

The Billing and Shipping **Zip Code** fields on this form are `type: 'zip'` —
typing a six-digit PIN fills City, State, Country and District. Supplier and
Customer got the same treatment. See
[PINCODE-AUTOFILL.md](../../../../PINCODE-AUTOFILL.md).
