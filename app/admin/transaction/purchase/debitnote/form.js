/* Card spec for the Debit Note entry screen.
   Each source card carries the upstream resource's own endpoint. */

export const FORM = {
    "title": "Debit Note",
    "cards": [
      {
        "type": "fields",
        "fields": [
          {
            "k": "vendorGstNo",
            "label": "Vendor GST No",
            "type": "text",
            "readOnly": true,
            "span": 2
          },
          {
            "k": "agentId",
            "label": "Agent",
            "type": "ref",
            "ref": "agent",
            "readOnly": true,
            "span": 2
          },
          {
            "k": "logisticId",
            "label": "Logistic",
            "type": "ref",
            "ref": "logistic"
          },
          {
            "k": "vendorInvoiceCopy",
            "label": "Vendor Invoice Copy",
            "type": "file",
            "info": true
          },
          {
            "k": "vendorWaybill",
            "label": "Vendor Waybill",
            "type": "file",
            "info": true
          }
        ]
      },
      {
        "type": "source",
        "label": "GRT List",
        "req": true,
        "multi": true,
        "from": "transaction/purchase/grt",
        "unconvertedBy": "debitNoteId",
        "withSupplier": true,
        "info": [
          "<b>Unconverted GRTs:</b> Displays the list of Goods Return Transactions (GRTs) that have not yet been converted into Debit Notes.",
          "<b>Multiple GRT Merge:</b> You can select multiple GRTs and merge them into a single Debit Note.",
          "<b>Supplier-Based GRT Filtering:</b> GRTs are listed based on the selected supplier."
        ],
        "endpoint": "/api/purchase-grt"
      },
      {
        "type": "grid",
        "total": true,
        "empty": "No Record Found",
        "cols": [
          "Sl No",
          "GRT Code",
          "Item Code",
          "Item Name",
          "HSN",
          "GST Slab",
          "UOM",
          "Return Quantity",
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
