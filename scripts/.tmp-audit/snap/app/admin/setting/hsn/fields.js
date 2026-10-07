/* Form fields for HSN Codes.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "code", label: "Code", type: "text", req: true },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
    { k: "effectiveDate", label: "Effective Date", type: "date", req: true },
    { k: "description", label: "Description", type: "textarea", req: true, span: "all" },
  ];

export const ROWS_TABLE = {
    "title": "Tax Slabs",
    "info": [
      "<b>Tax Slabs Immutable On Edit:</b> You can add or delete tax slabs only while creating a new record. Once created, tax slabs cannot be added or removed during editing. only the amount &amp; tax name can be edited."
    ],
    "key": "taxSlabs",
    "cols": [
      {
        "k": "gstTaxNameId",
        "label": "GST Tax Name",
        "type": "ref",
        "ref": "tax",
        "req": true
      },
      {
        "k": "amountFrom",
        "label": "Amount From",
        "type": "number",
        "req": true
      },
      {
        "k": "amountTo",
        "label": "Amount To",
        "type": "number",
        "req": true
      }
    ]
  };
