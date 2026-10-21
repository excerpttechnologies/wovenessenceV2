/* Form fields for Split Barcode Settings.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "useFor", label: "Use For", type: "radio", req: true, def: "Current Setting", opts: [{"v":"Current Setting","l":"Current Setting"},{"v":"Barcode Setting","l":"Barcode Setting"}] },
    { k: "prefix", label: "Prefix", type: "text" },
    { k: "suffix", label: "Suffix", type: "text" },
    { k: "startNumber", label: "Start Number", type: "number", req: true },
    { k: "numberLenght", label: "Number Lenght", type: "number", req: true },
    { k: "sampleBarcode", label: "Sample Barcode", type: "text", req: true },
    { k: "effectiveDate", label: "Effective Date", type: "date", req: true },
    { k: "expiryDate", label: "Expiry Date", type: "date", req: true },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
  ];

export const NOTE = ["* Prefix Short Code: [OLD]=Old Barcode"];
