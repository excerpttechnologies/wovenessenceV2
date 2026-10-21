/* Form fields for All Tax.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "taxName", label: "Tax Name", type: "text", req: true },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
    { k: "igstLedgerId", label: "IGST Ledger", type: "ref", ref: "ledger" },
    { k: "cgstLedgerId", label: "CGST Ledger", type: "ref", ref: "ledger" },
    { k: "sgstLedgerId", label: "SGST Ledger", type: "ref", ref: "ledger" },
    { k: "cessLedgerId", label: "CESS Ledger", type: "ref", ref: "ledger" },
    { k: "igst", label: "IGST", type: "number", req: true },
    { k: "cgst", label: "CGST", type: "number", req: true },
    { k: "sgst", label: "SGST", type: "number", req: true },
    { k: "cess", label: "CESS", type: "number", req: true },
    { k: "note", label: "Note", type: "textarea", span: "all" },
  ];
