/* Card spec for the Credit Note entry screen.
   Each source card carries the upstream resource's own endpoint. */

export const FORM = {
    "title": "Credit Note",
    "cards": [
      {
        "type": "fields",
        "fields": [
          {
            "k": "customerGstn",
            "label": "Customer GSTN",
            "type": "text",
            "readOnly": true,
            "span": 2
          },
          {
            "k": "customerAddress",
            "label": "Customer Address",
            "type": "text",
            "span": 2
          }
        ]
      },
      {
        "type": "info",
        "items": [
          "<b>Sales Returns:</b> List of sales returns for which credit notes have not been created",
          "<b>Customers:</b> List of customers for whom sales returns have not been create."
        ]
      },
      {
        "type": "source",
        "label": "Sales Return List",
        "req": true,
        "multi": true,
        "from": "transaction/sell/salereturn",
        "unconvertedBy": "creditNoteId",
        "withCustomer": true,
        "endpoint": "/api/sell-salereturn"
      },
      {
        "type": "grid",
        "empty": "No data found",
        "cols": [
          "SL No",
          "Item Code",
          "Item Name",
          "HSN",
          "GST Slab",
          "UoM",
          "QTY",
          "Unit Rate",
          "Before Tax",
          "IGST Amount",
          "CGST Amount",
          "SGST Amount",
          "Net Amount"
        ]
      }
    ]
  };
