/* Tab + section layout for Agents.
   Production Details removed on request - Basic / Purchase / Financial only. */

export const TABS = [
    {
      "key": "basic",
      "label": "Basic Information",
      "sections": [
        {
          "title": "",
          /* Six across, matching the deployed Basic Information tab: Type on
             its own row, Short Name on its own row, then the six name fields
             across. Business Type / GST NO / Contact Type (2) / Business Name /
             Allow Login / User Name / Password are NOT on the deployed Agent
             form - they belong to Supplier and Customer, which still carry
             them. See app/admin/contact/agent/README-AGENT-FORM.md. */
          "cols": 6,
          "fields": [
            {
              "k": "typeId",
              "label": "Type",
              "type": "ref",
              /* narrowed to contactType: 'Agent' so the picker offers AGENTS
                 only, not all ten contact types */
              "ref": "contact-type-agent",
              "req": true,
              "span": 2
            },
            {
              "k": "shortName",
              "label": "Short Name",
              "ph": true,
              "type": "text",
              "row": true,
              "span": 3
            },
            {
              "row": true,
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
              ]
            }
          ]
        },
        {
          "title": "Billing Details",
          "cols": 6,
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
              "k": "billingZipCode",
              "label": "Zip Code",
              "ph": true,
              "type": "zip",
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
          "cols": 6,
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
              "label": "Mark Up on Cost DP",
              "type": "number"
            },
            {
              "k": "dpRoundOff",
              "label": "Dp Round Off",
              "type": "number"
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
              "k": "entryDate",
              "label": "Entry Date",
              "type": "date"
            },
            {
              "k": "documentDate",
              "label": "Document Date",
              "type": "date"
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
              "k": "purchaseTermsId",
              "label": "Purchase Terms",
              "type": "ref",
              "ref": "purchase/master/term"
            },
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
          "cols": 3,
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
          "title": "Puchase Ledger Mapping",
          "cols": 3,
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
          "title": "Agent Bank Details",
          "cols": 3,
          "fields": [
            {
              "k": "bankAccountName",
              "label": "Agent Name as Per Bank",
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
