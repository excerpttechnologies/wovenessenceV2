/* Card spec for the Stock Adjustments entry screen. */

export const FORM = {
    "title": "Stock Adjustment",
    "cards": [
      {
        "type": "fields",
        "fields": [
          {
            "k": "adjustmentReason",
            "label": "Adjustment Reason",
            "type": "select",
            "req": true,
            "placeholder": "--Select--",
            "opts": [
              {
                "v": "Lost",
                "l": "Lost"
              },
              {
                "v": "Damaged",
                "l": "Damaged"
              },
              {
                "v": "Expired",
                "l": "Expired"
              },
              {
                "v": "Theft",
                "l": "Theft"
              },
              {
                "v": "Other",
                "l": "Other"
              }
            ]
          },
          {
            "k": "adjustmentDate",
            "label": "Adjustment Date",
            "type": "date",
            "req": true,
            "def": "today"
          },
          {
            "k": "stockPointId",
            "label": "Stock Point",
            "type": "ref",
            "ref": "stockpoint",
            "req": true
          },
          {
            "k": "remarks",
            "label": "Remarks",
            "type": "text",
            "span": "all"
          }
        ]
      },
      {
        "type": "scanTabs",
        "title": "Items",
        "tabs": [
          {
            "k": "Addition",
            "label": "Stock Addition"
          },
          {
            "k": "Subtraction",
            "label": "Stock Subtraction"
          }
        ],
        "empty": "No items found",
        "cols": [
          "Item Code",
          "Item Name",
          "HSN",
          "GST Slab",
          "UOM",
          "Stock",
          "QTY",
          "Final Rate",
          "Before Tax",
          "IGST Amount",
          "CGST Amount",
          "SGST Amount",
          "Net Amount"
        ]
      }
    ]
  };
