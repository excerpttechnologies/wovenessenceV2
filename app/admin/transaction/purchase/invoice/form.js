/* Card spec for the Purchase Invoice entry screen.
   Each source card carries the upstream resource's own endpoint. */

export const FORM = {
    "cards": [
      {
        "type": "fields",
        "fields": [
          {
            "k": "supplierId",
            "label": "Supplier",
            "type": "ref",
            "ref": "supplier",
            "req": true
          },
          {
            "k": "vendorGstNo",
            "label": "Vendor GST No",
            "type": "text",
            "readOnly": true
          },
          {
            "k": "grcNumber",
            "label": "GRC Number",
            "type": "text",
            "readOnly": true
          },
          {
            "k": "vendorDocNo",
            "label": "Vendor Doc No",
            "type": "text",
            "readOnly": true
          },
          {
            "k": "grcDate",
            "label": "GRC Date",
            "type": "date",
            "readOnly": true
          },
          {
            "k": "vendorDocDate",
            "label": "Vendor Doc Date",
            "type": "date",
            "readOnly": true
          },
          {
            "k": "purchaseGroupId",
            "label": "Purchase Group",
            "type": "ref",
            "ref": "purchasegroup",
            "readOnly": true
          },
          {
            "k": "occasion",
            "label": "Occasion",
            "type": "select",
            "placeholder": "--Select--",
            "opts": [
              {
                "v": "Wedding",
                "l": "Wedding"
              },
              {
                "v": "Festival",
                "l": "Festival"
              },
              {
                "v": "Regular",
                "l": "Regular"
              },
              {
                "v": "Clearance",
                "l": "Clearance"
              }
            ]
          },
          {
            "k": "purchaseTermId",
            "label": "Purchase Term",
            "type": "ref",
            "ref": "purchase/master/term",
            "readOnly": true
          },
          {
            "k": "agentId",
            "label": "Agent",
            "type": "ref",
            "ref": "agent",
            "readOnly": true
          },
          {
            "k": "logisticId",
            "label": "Logistic",
            "type": "ref",
            "ref": "logistic",
            "readOnly": true
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
        "label": "GRC List",
        "req": true,
        "from": "transaction/purchase/grc",
        "unconvertedBy": "purchaseInvoiceId",
        "info": [
          "<b>Displays GRCs</b> (Goods Receipt Challans) linked to the selected supplier that have not yet been converted into purchase invoices."
        ],
        "endpoint": "/api/purchase-grc"
      },
      {
        "type": "grid",
        "empty": "No Data..",
        "cols": [
          "Sl No",
          "Item Code",
          "Item Name",
          "HSN",
          "GST Slab",
          "UOM",
          "QTY/MTR",
          "No. of Cuts",
          "Purchase Rate",
          "Discount",
          "R.Off Discount",
          "Final Rate",
          "Before Tax",
          "IGST Amount",
          "CGST Amount",
          "SGST Amount",
          "Net Amount",
          "RSP",
          "WSP",
          "DP",
          "Attribute"
        ]
      }
    ]
  };
