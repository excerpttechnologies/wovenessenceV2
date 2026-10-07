/* Card spec for the Sales Invoice entry screen.
   Each source card carries the upstream resource's own endpoint. */

export const FORM = {
    "title": "Sales Invoice",
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
          }
        ]
      },
      {
        "type": "info",
        "items": [
          "<b>Delivery Challans:</b> Lists delivery challans for the selected customer that are linked to the customer but have not yet been converted into sales invoices.",
          "<b>Multiple Delivery Challans Selection:</b> You can select multiple delivery challans for creating a consolidated sales invoice."
        ]
      },
      {
        "type": "sourceTable",
        "label": "Delivery Challan List",
        "req": true,
        "from": "transaction/sell/deliverychallan",
        "unconvertedBy": "salesInvoiceId",
        "byCustomer": true,
        "empty": "No Challans Found...",
        "cols": [
          {
            "k": "dcDate",
            "t": "Date",
            "f": "date"
          },
          {
            "k": "deliveryChallanNo",
            "t": "DC Code"
          },
          {
            "k": "totalQty",
            "t": "Total Qty.",
            "f": "amount"
          },
          {
            "k": "taxableValue",
            "t": "Taxable Amt.",
            "f": "amount"
          },
          {
            "k": "taxAmount",
            "t": "Tax Amount",
            "f": "amount"
          },
          {
            "k": "roundOff",
            "t": "Round Off",
            "f": "amount"
          },
          {
            "k": "netValue",
            "t": "Net Amount",
            "f": "amount"
          }
        ],
        "endpoint": "/api/sell-deliverychallan"
      },
      {
        "type": "grid",
        "empty": "No Data..",
        "paginated": true,
        "cols": [
          "DC Code",
          "Item Code",
          "Item Name",
          "HSN Code",
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
