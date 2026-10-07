/* Tab + section layout for Customers.

   Matched to the deployed page at erp.orbiteerp.com/admin/contact/customer/add:
     - three tabs, and the second is "Sales Details" (not "Purchase Details",
       which is the Supplier wording)
     - no Contact Type (2), no Allow Login / User Name / Password
     - Prefix and Gender render without a label above them
     - identity row is 4 across; the name row and both address blocks are
       6 across, via each section's `cols`
   Supplier and Agent keep their own wider form - only this file changed.

   OPEN QUESTION - Business Type options. The deployed page shows
   "Un-Registered" pre-selected, but that value is not in this project's option
   list (8 legal-entity types: Proprietorship, Partnership, LLP, ...). It has
   been added at the top and set as the default so the deployed default
   renders. If the deployed dropdown is actually a GST status list
   (Registered / Un-Registered) rather than entity types, replace `opts` below
   with that list - the screenshot only reveals the selected value. */

export const TABS = [
    {
      "key": "basic",
      "label": "Basic Information",
      "sections": [
        {
          "title": "",
          "cols": 4,
          "fields": [
            {
              "k": "typeId",
              "label": "Type",
              "type": "ref",
              "ref": "contact-type",
              "req": true
            },
            {
              "k": "businessType",
              "label": "Business Type",
              "type": "select",
              "req": true,
              "placeholder": "--Select--",
              "opts": [
                {
                  "v": "Un-Registered",
                  "l": "Un-Registered"
                },
                {
                  "v": "Proprietorship",
                  "l": "Proprietorship"
                },
                {
                  "v": "Partnership",
                  "l": "Partnership"
                },
                {
                  "v": "Private Limited",
                  "l": "Private Limited"
                },
                {
                  "v": "Public Limited",
                  "l": "Public Limited"
                },
                {
                  "v": "LLP",
                  "l": "LLP"
                },
                {
                  "v": "HUF",
                  "l": "HUF"
                },
                {
                  "v": "Trust",
                  "l": "Trust"
                },
                {
                  "v": "Individual",
                  "l": "Individual"
                }
              ],
              "def": "Un-Registered"
            },
            {
              "k": "gstNo",
              "label": "GST NO",
              "type": "text",
              "placeholder": "ex: 22AAAAA0000A1Z5"
            },
            {
              "k": "businessName",
              "label": "Business Name",
              "ph": true,
              "type": "text",
              "span": 2
            },
            {
              "k": "shortName",
              "label": "Short Name",
              "ph": true,
              "type": "text",
              "span": 2
            }
          ]
        },
        {
          "title": "",
          "cols": 6,
          "fields": [
            {
              "k": "prefix",
              "label": "Prefix",
              "type": "select",
              "def": "Mr.",
              "opts": [
                {
                  "v": "Mr.",
                  "l": "Mr."
                },
                {
                  "v": "Mrs.",
                  "l": "Mrs."
                },
                {
                  "v": "Ms.",
                  "l": "Ms."
                },
                {
                  "v": "Dr.",
                  "l": "Dr."
                },
                {
                  "v": "M/s.",
                  "l": "M/s."
                }
              ],
              "ph": true
            },
            {
              "k": "firstName",
              "label": "First Name*",
              "ph": true,
              "type": "text",
              "req": true
            },
            {
              "k": "middleName",
              "label": "Middle Name",
              "ph": true,
              "type": "text"
            },
            {
              "k": "lastName",
              "label": "Last Name",
              "ph": true,
              "type": "text"
            },
            {
              "k": "dob",
              "label": "DOB",
              "ph": true,
              "type": "date"
            },
            {
              "k": "gender",
              "label": "Gender",
              "type": "select",
              "placeholder": "--Select Gender--",
              "opts": [
                {
                  "v": "Male",
                  "l": "Male"
                },
                {
                  "v": "Female",
                  "l": "Female"
                },
                {
                  "v": "Other",
                  "l": "Other"
                }
              ],
              "ph": true
            }
          ]
        },
        {
          "title": "Billing Details",
          "fields": [
            {
              "k": "billingAddressLine1",
              "label": "Address line 1",
              "ph": true,
              "type": "text",
              "span": 3
            },
            {
              "k": "billingAddressLine2",
              "label": "Address line 2",
              "ph": true,
              "type": "text",
              "span": 3
            },
            {
              "k": "billingCity",
              "label": "City",
              "ph": true,
              "type": "city"
            },
            {
              "k": "billingState",
              "label": "State",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingCountry",
              "label": "Country",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingDistrict",
              "label": "District",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingTaluk",
              "label": "Taluk",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingZipCode",
              "label": "Zip Code",
              "ph": true,
              "type": "zip",
              "fill": {
                "city": "billingCity",
                "state": "billingState",
                "country": "billingCountry",
                "district": "billingDistrict",
                "taluk": "billingTaluk"
              }
            },
            {
              "k": "billingMobile",
              "label": "Mobile*",
              "ph": true,
              "type": "text",
              "req": true
            },
            {
              "k": "billingAlternateContactNumber",
              "label": "Alternate Contact Number",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingLandline",
              "label": "Landline",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingFax",
              "label": "Fax",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingEmail",
              "label": "Email",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingEmail2",
              "label": "Email 2",
              "ph": true,
              "type": "text"
            },
            {
              "k": "billingWebsiteUrl",
              "label": "Website URL",
              "ph": true,
              "type": "text"
            }
          ],
          "cols": 6
        },
        {
          "title": "Shipping Details",
          "toggle": {
            "k": "sameAsBilling",
            "label": "Same as Billing Address"
          },
          "fields": [
            {
              "k": "shippingAddressLine1",
              "label": "Address line 1",
              "ph": true,
              "type": "text",
              "span": 3
            },
            {
              "k": "shippingAddressLine2",
              "label": "Address line 2",
              "ph": true,
              "type": "text",
              "span": 3
            },
            {
              "k": "shippingCity",
              "label": "Select City",
              "ph": true,
              "type": "city"
            },
            {
              "k": "shippingState",
              "label": "State",
              "ph": true,
              "type": "text"
            },
            {
              "k": "shippingCountry",
              "label": "Country",
              "ph": true,
              "type": "text"
            },
            {
              "k": "shippingDistrict",
              "label": "District",
              "ph": true,
              "type": "text"
            },
            {
              "k": "shippingZipCode",
              "label": "Zip Code",
              "ph": true,
              "type": "zip",
              "fill": {
                "city": "shippingCity",
                "state": "shippingState",
                "country": "shippingCountry",
                "district": "shippingDistrict"
              }
            },
            {
              "k": "shippingMobile",
              "label": "Mobile",
              "ph": true,
              "type": "text",
              "req": false
            },
            {
              "k": "shippingAlternateContactNumber",
              "label": "Alternate Contact Number",
              "ph": true,
              "type": "text"
            },
            {
              "k": "shippingLandline",
              "label": "Landline",
              "ph": true,
              "type": "text"
            },
            {
              "k": "shippingFax",
              "label": "Fax",
              "ph": true,
              "type": "text"
            },
            {
              "k": "shippingEmail",
              "label": "Email",
              "ph": true,
              "type": "text"
            },
            {
              "k": "shippingEmail2",
              "label": "Email 2",
              "ph": true,
              "type": "text"
            },
            {
              "k": "shippingWebsiteUrl",
              "label": "Website URL",
              "ph": true,
              "type": "text"
            }
          ],
          "cols": 6
        }
      ]
    },
    {
      "key": "sales",
      "label": "Sales Details",
      /* Rebuilt to match erp.orbiteerp.com/admin/contact/customer/add.
         This tab used to be a copy of the Supplier "Purchase Details" tab -
         Markup Price Calculation, Purchase Order Setup, Payment Setup and
         Purchase Terms. None of those are on the deployed Customer screen;
         a customer is sold to, not bought from. Supplier and Agent keep them. */
      "sections": [
        {
          "title": "Price Setup",
          "cols": 3,
          "fields": [
            {
              "k": "priceList",
              "label": "Price List",
              "type": "select",
              "req": true,
              "def": "ON RSP",
              "opts": [
                { "v": "ON RSP", "l": "ON RSP" },
                { "v": "ON WSP", "l": "ON WSP" },
                { "v": "ON DP", "l": "ON DP" },
                { "v": "ON MRP", "l": "ON MRP" }
              ]
            },
            {
              "k": "discountType",
              "label": "Discount Type",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                { "v": "Percentage", "l": "Percentage" },
                { "v": "Amount", "l": "Amount" }
              ]
            },
            {
              "k": "discount",
              "label": "Discount",
              "type": "number"
            }
          ]
        },
        {
          "title": "Agent Setup",
          "cols": 3,
          "fields": [
            {
              "k": "agentId",
              "label": "Agent Name",
              "type": "ref",
              "ref": "agent",
              "placeholder": "Select Supplier"
            },
            {
              "k": "commissionPercent",
              "label": "Commission %",
              "type": "number"
            },
            {
              "k": "paymentLedgerId",
              "label": "Payment Ledger",
              "type": "ref",
              "ref": "ledger"
            }
          ]
        },
        {
          "title": "Credit Setup",
          "cols": 3,
          /* placeholder-only on the deployed screen - no labels above these */
          "fields": [
            { "k": "saleDueDate", "label": "Sale Due Date", "ph": true, "type": "number" },
            { "k": "interestChargedIfDelay", "label": "Interest Charged if Delay", "ph": true, "type": "number" },
            { "k": "graceDays", "label": "Grace Days", "ph": true, "type": "number" },
            { "k": "invoiceCreditLimit", "label": "Invoice Credit Limit", "ph": true, "type": "number" },
            { "k": "overdues", "label": "Overdues", "ph": true, "type": "number" },
            { "k": "overduesDaysLock", "label": "Overdues Days Lock", "ph": true, "type": "number" }
          ]
        },
        {
          "title": "Tax Other Setup",
          "cols": 3,
          "fields": [
            {
              "k": "logisticsTerms",
              "label": "Logistics Terms",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                { "v": "To Pay", "l": "To Pay" },
                { "v": "Paid", "l": "Paid" },
                { "v": "Self Pickup", "l": "Self Pickup" }
              ]
            },
            {
              "k": "logisticsApplicable",
              "label": "Logistics Applicable",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                { "v": "Yes", "l": "Yes" },
                { "v": "No", "l": "No" }
              ]
            },
            {
              "k": "salesTermId",
              "label": "Sales Term",
              "type": "ref",
              "ref": "sales/master/term"
            },
            {
              "k": "transporterId",
              "label": "Transporter Name",
              "type": "ref",
              "ref": "transporter",
              "placeholder": "--Select--"
            },
            {
              "k": "remarks",
              "label": "Remarks",
              "type": "text"
            }
          ]
        }
      ]
    },
    {
      "key": "financial",
      "label": "Financial Details",
      /* Also rebuilt: the supplier wording ("Supplier Ledger Mapping",
         "Puchase Ledger Mapping", "Supplier Bank Details") and the whole
         TDS Setup section are not on the deployed Customer screen. */
      "sections": [
        {
          "title": "Group Ledger Mapping",
          "cols": 3,
          "fields": [
            {
              "k": "customerType",
              "label": "Customer Type",
              "type": "text"
            },
            {
              "k": "openingBalance",
              "label": "Opening Balance",
              "type": "number",
              "req": true,
              "def": 0
            }
          ]
        },
        {
          "title": "Ledger Mapping",
          "cols": 6,
          "fields": [
            {
              "k": "salesLedgerId",
              "label": "Sales Ledger",
              "type": "ref",
              "ref": "ledger",
              "span": 3
            },
            {
              "k": "salesReturnLedgerId",
              "label": "Sales Return Ledger",
              "type": "ref",
              "ref": "ledger",
              "span": 3
            }
          ]
        },
        {
          "title": "Company Reg. Details",
          "cols": 4,
          "fields": [
            { "k": "pan", "label": "PAN (ex: AAAAA1234A)", "type": "text" },
            { "k": "cin", "label": "CIN", "type": "text" },
            {
              "k": "gstType",
              "label": "GST Type",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                { "v": "Registered", "l": "Registered" },
                { "v": "Unregistered", "l": "Unregistered" },
                { "v": "Composition", "l": "Composition" },
                { "v": "SEZ", "l": "SEZ" }
              ]
            },
            { "k": "gstRegDate", "label": "Gst Reg. Date", "type": "date" },
            { "k": "ssiNo", "label": "SSI No", "type": "text" },
            { "k": "ssiRegDate", "label": "SSI Reg. Date", "type": "date" },
            { "k": "msmeNo", "label": "MSME No", "type": "text" },
            { "k": "msmeRegDate", "label": "MSME Reg. Date", "type": "date" }
          ]
        },
        {
          "title": "Customer Bank Details",
          "cols": 3,
          "fields": [
            { "k": "bankAccountName", "label": "Customer Name as Per Bank", "type": "text" },
            { "k": "bankName", "label": "Bank Name", "type": "text" },
            { "k": "accountNo", "label": "Account No.", "type": "text" },
            { "k": "ifsc", "label": "IFSC", "type": "text" },
            { "k": "swiftCode", "label": "Swift Code", "type": "text" }
          ]
        }
      ]
    }
  ];
