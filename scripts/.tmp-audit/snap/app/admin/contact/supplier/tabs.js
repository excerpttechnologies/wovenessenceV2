/* Tab + section layout for Suppliers - the same three-tab shape the Customer
   form uses: Basic Information (identity + Billing + Shipping), Purchase
   Details, Financial Details. Production Details removed on request.

   TabbedFormView renders this as a tab strip with a Submit on each tab, which
   is the original behaviour and the one Contacts > Customers still uses.

   /api/supplier flattens THIS array to build its validation field list, so a
   section that lost its fields would silently stop validating them. */

export const TABS = [
    {
      "key": "basic",
      "label": "Basic Information",
      "sections": [
        {
          "title": "",
          "fields": [
            {
              "k": "typeId",
              "label": "Type",
              "type": "ref",
              "ref": "contact-type",
              "req": true
            },
            {
              "k": "gstNo",
              "label": "GST NO",
              "type": "text",
              "placeholder": "ex: 22AAAAA0000A1Z5"
            },
            /* Named the way the GST portal names them, which is also where
               their values come from: Legal Name of Business -> businessName,
               Trade Name -> shortName. Labelled above the box rather than
               placeholdered inside it, so the name survives being typed into.
               The keys are untouched - the GST paste mapping still holds. */
            {
              "k": "businessName",
              "label": "Legal Name of Business",
              "type": "text",
              "span": 2
            },
            {
              "k": "shortName",
              "label": "Trade Name",
              "type": "text",
              "span": 2
            },
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
              ]
            },
            {
              "k": "firstName",
              "label": "First Name",
              "ph": true,
              "type": "text"
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
            /* Constitution of Business on the GST portal. Same options and
               same key as the Customer form, so the two contact types spell a
               proprietorship the same way. Added at the END of this section
               deliberately: dropped in beside GST NO it would push Business
               Name onto the next grid row, and those fields were to keep the
               positions they have. */
            {
              "k": "businessType",
              "label": "Business Type",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                { "v": "Un-Registered", "l": "Un-Registered" },
                { "v": "Proprietorship", "l": "Proprietorship" },
                { "v": "Partnership", "l": "Partnership" },
                { "v": "Private Limited", "l": "Private Limited" },
                { "v": "Public Limited", "l": "Public Limited" },
                { "v": "LLP", "l": "LLP" },
                { "v": "HUF", "l": "HUF" },
                { "v": "Trust", "l": "Trust" },
                { "v": "Individual", "l": "Individual" },
                /* the constitutions the portal returns that none of the above
                   covers - Government Department, Statutory Body, Foreign
                   Company and the like - land here rather than being forced
                   into a shape they are not */
                { "v": "Others", "l": "Others" }
              ]
            }
          ]
        },
        /* ------------------------------------------------------------------
           GST Details - everything the GST portal prints about the
           registration itself. Its own section rather than extra fields in
           the identity block above, so nothing that was already on this form
           moves; it sits directly under GST NO's row, which is where the
           brief asked for it.

           Four of these are read-only badges: they are the portal's answer,
           not the operator's, and typing over them would only make the record
           disagree with the registration. They show a dash until a GST paste
           fills them. Additional Trade Name is a plain editable field - the
           portal often has none, and the operator may know it.

           The two jurisdiction offices have no field of their own. They are
           stored with the supplier (hidden, so they stay in the API's field
           list) instead of being read and thrown away. */
        {
          "title": "GST Details",
          "fields": [
            {
              "k": "gstRegDate",
              "label": "GST Registration Date",
              "type": "date"
            },
            {
              "k": "gstStatus",
              "label": "GST Status",
              "type": "badge"
            },
            {
              "k": "gstTaxpayerType",
              "label": "Taxpayer Type",
              "type": "badge"
            },
            {
              "k": "gstAadhaarAuthenticated",
              "label": "Aadhaar Authenticated",
              "type": "badge"
            },
            {
              "k": "gstEkycVerified",
              "label": "e-KYC Verified",
              "type": "badge"
            },
            {
              "k": "additionalTradeName",
              "label": "Additional Trade Name",
              "type": "text",
              "span": 2
            },
            {
              "k": "gstCoreBusinessActivity",
              "label": "Business Activities",
              "type": "badge",
              "span": 2
            },
            {
              "k": "hsn",
              "label": "HSN",
              "type": "text",
              "span": 2
            },
            {
              "k": "gstAdministrativeOffice",
              "label": "GST Administrative Office",
              "type": "text",
              "hidden": true
            },
            {
              "k": "gstOtherOffice",
              "label": "GST Other Office",
              "type": "text",
              "hidden": true
            }
          ]
        },
        {
          "title": "Billing Details",
          "fields": [
            /* One Address input over the two columns the collection has always
               had. `parts` makes TabbedFormView join them for display and
               split them back on edit; the two entries below stay in the tab
               definition - and so in the API's field list - but `hidden`
               takes their inputs off the form. No schema change, no new key
               in the payload. */
            {
              "k": "billingAddress",
              "label": "Address",
              "ph": true,
              /* a textarea, not a one-line box: a full street address runs
                 past what a single line can show, and .f-textarea is the
                 project's own control - no new styling, and it resizes. */
              "type": "textarea",
              /* span 3 of the section's 4 tracks - a full street address needs
                 the room, and City still flows onto the same row. Collapses to
                 the full width of the 2-track md grid and to one column below
                 that, so nothing has to scroll sideways. */
              "span": 3,
              "parts": ["billingAddressLine1", "billingAddressLine2"]
            },
            {
              "k": "billingAddressLine1",
              "label": "Address line 1",
              "ph": true,
              "type": "text",
              "hidden": true
            },
            {
              "k": "billingAddressLine2",
              "label": "Address line 2",
              "ph": true,
              "type": "text",
              "hidden": true
            },
            {
              "k": "billingCity",
              "label": "City",
              "ph": true,
              "type": "city"
            },
            /* The registered address names a district as well as a city, and
               the collection has always had a column for it. Free text, not
               the city dropdown: there is no district master to pick from. */
            {
              "k": "billingDistrict",
              "label": "District",
              "ph": true,
              "type": "text"
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
              "k": "billingZipCode",
              "label": "Zip Code",
              "ph": true,
              "type": "zip",
              /* the PIN still fills City / State / Country / District - only
                 the "SURAT, GUJARAT" echo under the box is dropped */
              "hideLookupText": true,
              "fill": {
                "city": "billingCity",
                "state": "billingState",
                "country": "billingCountry",
                "district": "billingDistrict"
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
          ]
        },
        {
          "title": "Shipping Details",
          "toggle": {
            "k": "sameAsBilling",
            "label": "Same as Billing Address"
          },
          "fields": [
            /* One Address input over the two columns the collection has always
               had. `parts` makes TabbedFormView join them for display and
               split them back on edit; the two entries below stay in the tab
               definition - and so in the API's field list - but `hidden`
               takes their inputs off the form. No schema change, no new key
               in the payload. */
            {
              "k": "shippingAddress",
              "label": "Address",
              "ph": true,
              /* a textarea, not a one-line box: a full street address runs
                 past what a single line can show, and .f-textarea is the
                 project's own control - no new styling, and it resizes. */
              "type": "textarea",
              /* span 3 of the section's 4 tracks - a full street address needs
                 the room, and City still flows onto the same row. Collapses to
                 the full width of the 2-track md grid and to one column below
                 that, so nothing has to scroll sideways. */
              "span": 3,
              "parts": ["shippingAddressLine1", "shippingAddressLine2"]
            },
            {
              "k": "shippingAddressLine1",
              "label": "Address line 1",
              "ph": true,
              "type": "text",
              "hidden": true
            },
            {
              "k": "shippingAddressLine2",
              "label": "Address line 2",
              "ph": true,
              "type": "text",
              "hidden": true
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
              "k": "shippingZipCode",
              "label": "Zip Code",
              "ph": true,
              "type": "zip",
              "hideLookupText": true,
              "fill": {
                "city": "shippingCity",
                "state": "shippingState",
                "country": "shippingCountry"
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
          ]
        }
      ]
    },
    {
      "key": "purchase",
      "label": "Purchase Details",
      "sections": [
        {
          "title": "Price Calculation Setup",
          "fields": [
            {
              "k": "discountType",
              "label": "Discount Type",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                {
                  "v": "Amount",
                  "l": "Amount"
                },
                {
                  "v": "Percentage",
                  "l": "Percentage"
                }
              ]
            },
            {
              "k": "discount",
              "label": "Discount",
              "type": "number"
            },
            {
              "k": "markUpOnCostRsp",
              "label": "Mark Up on Cost RSP",
              "type": "number"
            },
            {
              "k": "rspRoundOff",
              "label": "RSP Round Off",
              "type": "number"
            },
            {
              "k": "markUpOnCostWsp",
              "label": "Mark Up on Cost WSP",
              "type": "number"
            },
            {
              "k": "wspRoundOff",
              "label": "WSP Round Off",
              "type": "number"
            },
            {
              "k": "markUpOnCostDp",
              "label": "Mark Up on Cost E-comm",
              "type": "number"
            },
            {
              "k": "dpRoundOff",
              "label": "E-comm Round Off",
              "type": "number"
            }
          ]
        },
        {
          "title": "Agent Setup",
          "fields": [
            {
              "k": "agentId",
              "label": "Agent Name",
              "type": "ref",
              "ref": "agent",
              "placeholder": "Select Agent"
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
          "title": "Purchase Order Setup",
          "fields": [
            {
              "k": "orderDeliveryEstimatedDays",
              "label": "Order Delivery Estimated(Days)",
              "type": "number"
            },
            {
              "k": "orderAcceptedDelaysDays",
              "label": "Order Accepted Delays(Days)",
              "type": "number"
            },
            {
              "k": "orderAdvanceLimit",
              "label": "Order Advance Limit",
              "type": "number"
            }
          ]
        },
        {
          "title": "Payment Setup",
          "fields": [
            {
              "k": "paymentWithinDays",
              "label": "Payment within (Days)",
              "type": "number"
            },
            {
              "k": "paymentDateType",
              "label": "Payment Date Type",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                {
                  "v": "Invoice Date",
                  "l": "Invoice Date"
                },
                {
                  "v": "GRC Date",
                  "l": "GRC Date"
                },
                {
                  "v": "Month End",
                  "l": "Month End"
                }
              ]
            },
            {
              "k": "discountAllowWithinPercent",
              "label": "Discount Allow Within %",
              "type": "number"
            },
            {
              "k": "discountAllowInDays",
              "label": "In Days",
              "type": "number"
            }
          ]
        },
        {
          "title": "Tax Other Setup",
          "fields": [
            {
              "k": "logisticsTerms",
              "label": "Logistics Terms",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                {
                  "v": "To Pay",
                  "l": "To Pay"
                },
                {
                  "v": "Paid",
                  "l": "Paid"
                },
                {
                  "v": "Self Pickup",
                  "l": "Self Pickup"
                }
              ]
            }
          ]
        }
      ]
    },
    {
      "key": "financial",
      "label": "Financial Details",
      "sections": [
        {
          "title": "Supplier Ledger Mapping",
          "fields": [
            {
              "k": "supplierType",
              "label": "Supplier Type",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                {
                  "v": "Sundry Creditors",
                  "l": "Sundry Creditors"
                },
                {
                  "v": "Sundry Debtors",
                  "l": "Sundry Debtors"
                }
              ]
            },
          ]
        },
        {
          "title": "Puchase Ledger Mapping",
          "fields": [
            {
              "k": "purchasesLedgerId",
              "label": "Purchases",
              "hint": "(Group Mapping: Purchases Accounts)",
              "type": "ref",
              "ref": "ledger"
            },
            {
              "k": "purchasesReturnLedgerId",
              "label": "Purchases Return",
              "hint": "(Group Mapping: Purchases Return)",
              "type": "ref",
              "ref": "ledger"
            },
            {
              "k": "consignmentPurchases",
              "label": "Consignment Purchases",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                {
                  "v": "Yes",
                  "l": "Yes"
                },
                {
                  "v": "No",
                  "l": "No"
                }
              ]
            }
          ]
        },
        {
          "title": "Company Reg. Details",
          "fields": [
            {
              "k": "pan",
              "label": "PAN (ex: AAAAA1234A)",
              "type": "text"
            },
            {
              "k": "cin",
              "label": "CIN",
              "type": "text"
            },
            {
              "k": "gstType",
              "label": "GST Type",
              "type": "select",
              "placeholder": "--Select--",
              "opts": [
                {
                  "v": "Registered",
                  "l": "Registered"
                },
                {
                  "v": "Unregistered",
                  "l": "Unregistered"
                },
                {
                  "v": "Composition",
                  "l": "Composition"
                },
                {
                  "v": "SEZ",
                  "l": "SEZ"
                }
              ]
            },
            {
              "k": "gstRegDate",
              "label": "Gst Reg. Date",
              "type": "date"
            },
            {
              "k": "ssiNo",
              "label": "SSI No",
              "type": "text"
            },
            {
              "k": "ssiRegDate",
              "label": "SSI Reg. Date",
              "type": "date"
            },
            {
              "k": "msmeNo",
              "label": "MSME No",
              "type": "text"
            },
            {
              "k": "msmeRegDate",
              "label": "MSME Reg. Date",
              "type": "date"
            }
          ]
        },
        {
          "title": "TDS Setup",
          "fields": [
            {
              "k": "tdsLedgerId",
              "label": "TDS Ledger",
              "type": "ref",
              "ref": "ledger"
            },
            {
              "k": "tdsPercent",
              "label": "TDS Percent (%)",
              "type": "number"
            },
            {
              "k": "tdsName",
              "label": "TDS Name",
              "type": "text"
            },
            {
              "k": "tdsSection",
              "label": "TDS Section",
              "type": "text"
            }
          ]
        },
        {
          "title": "Supplier Bank Details",
          "fields": [
            {
              "k": "bankAccountName",
              "label": "Supplier Name as Per Bank",
              "type": "text"
            },
            {
              "k": "bankName",
              "label": "Bank Name",
              "type": "text"
            },
            {
              "k": "accountNo",
              "label": "Account No.",
              "type": "text"
            },
            {
              "k": "ifsc",
              "label": "IFSC",
              "type": "text"
            },
            {
              "k": "swiftCode",
              "label": "Swift Code",
              "type": "text"
            }
          ]
        }
      ]
    }
  ];



/* k -> label for every supplier field, so the import preview can name a row
   the way the form does instead of showing the raw key. */
export const FIELD_LABELS = Object.fromEntries(
  TABS.flatMap((t) => (t.sections || []).flatMap((s) => (s.fields || [])))
    .map((f) => [f.k, f.label || f.k]),
);

  export const AGENT_QUICK_FIELDS = [
    { k: 'typeId', label: 'Type', type: 'ref', ref: 'contact-type-agent', req: true },
    { k: 'shortName', label: 'Short Name', type: 'text' },
    { k: 'prefix', label: 'Prefix', type: 'select', def: 'Mr.', opts: [
      { v: 'Mr.', l: 'Mr.' }, { v: 'Mrs.', l: 'Mrs.' }, { v: 'Ms.', l: 'Ms.' },
    ] },
    { k: 'firstName', label: 'First Name', type: 'text', req: true },
    { k: 'billingMobile', label: 'Mobile', type: 'text', req: true },
  ];
