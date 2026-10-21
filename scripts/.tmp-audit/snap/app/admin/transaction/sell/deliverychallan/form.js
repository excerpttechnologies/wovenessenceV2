/* Card spec for the Add Delivery Challan entry screen.
   Each source card carries the upstream resource's own endpoint. */

export const FORM = {
    "title": "Add Delivery Challan",
    "cards": [
      {
        "type": "fields",
        "fields": [
          {
            "k": "customerId",
            "label": "Customer Name",
            "type": "ref",
            "ref": "customer",
            "req": true
          },
          {
            "k": "customerGstn",
            "label": "Customer GSTN",
            "type": "text",
            "req": true,
            "readOnly": true
          },
          {
            "k": "customerAddress",
            "label": "Customer Address",
            "type": "text"
          },
          {
            "k": "dcDate",
            "label": "DC Date",
            "type": "date",
            "req": true,
            "def": "today"
          },
          {
            "k": "stockPointId",
            "label": "Stock Point",
            "type": "ref",
            "ref": "stockpoint"
          },
          {
            "k": "logisticId",
            "label": "Logistics Details",
            "type": "ref",
            "ref": "logistic"
          },
          {
            "k": "salesTerm",
            "label": "Sales Term",
            "type": "select",
            "placeholder": "--Select--",
            "opts": [
              {
                "v": "After Tax",
                "l": "After Tax"
              },
              {
                "v": "Before Tax",
                "l": "Before Tax"
              }
            ]
          },
          {
            "k": "salesGroupId",
            "label": "Sales Group",
            "type": "ref",
            "ref": "purchasegroup"
          },
          {
            "k": "salesPersonId",
            "label": "Sales Person",
            "type": "ref",
            "ref": "agent"
          },
          {
            "k": "salesLedgerId",
            "label": "Sales Ledger",
            "type": "ref",
            "ref": "ledger"
          },
          {
            "k": "agentId",
            "label": "Agent",
            "type": "ref",
            "ref": "agent"
          },
          {
            "k": "customerWaybill",
            "label": "Customer Waybill",
            "type": "file",
            "info": true
          }
        ]
      },
      {
        "type": "info",
        "items": [
          "<b>Item Code Validation:</b> The item code must exist in the GRC Item list, regardless of whether a purchase invoice has been created for the GRC.",
          "<b>Stock Availability Check:</b> The item must be available in stock before proceeding.",
          "<b>Unit Price Calculation:</b> The item's unit price is determined based on the selected customer's pricing setup (RSP, WSP, or DP)."
        ]
      },
      {
        "type": "scan"
      },
      {
        "type": "grid",
        "empty": "No Items Added",
        "removable": true,
        "cols": [
          "Item Code",
          "Item Name",
          "HSN",
          "GST Slab",
          "UOM",
          "QTY",
          "Unit Rate",
          "Discount",
          "R.Off Discount",
          "Final Rate",
          "Before Tax",
          "IGST Amount",
          "CGST Amount",
          "SGST Amount",
          "Net Amount"
        ]
      },
      {
        "type": "totals",
        "rows": [
          {
            "label": "Taxable Value",
            "op": "+",
            "value": "taxableValue"
          },
          {
            "label": "Discount(%)",
            "op": "-",
            "input": "discountPercent"
          },
          {
            "label": "RoundOff Discount(Amt)",
            "op": "-",
            "input": "roundOffDiscountAmt"
          },
          {
            "label": "Round Off",
            "value": "roundOff"
          },
          {
            "label": "Net Value",
            "value": "netValue"
          }
        ]
      }
    ]
  };
