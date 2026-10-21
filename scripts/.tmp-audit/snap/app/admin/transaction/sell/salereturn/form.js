/* Card spec for the Sales Return entry screen.
   Each source card carries the upstream resource's own endpoint. */

export const FORM = {
    "title": "Sales Return",
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
            "readOnly": true
          },
          {
            "k": "customerAddress",
            "label": "Customer Address",
            "type": "text"
          },
          {
            "k": "returnDate",
            "label": "Return Date",
            "type": "date",
            "req": true,
            "def": "today"
          }
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
      }
    ]
  };
