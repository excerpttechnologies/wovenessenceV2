/* Form fields for Location Setting.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "taxBasis", label: "Tax Basis", type: "radio", def: "Inclusive", opts: [{"v":"Inclusive","l":"Inclusive"},{"v":"Exclusive","l":"Exclusive"}] },
    { k: "posDuplicateScan", label: "POS Duplicate Scan", type: "radio", def: "No", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}] },
  ];
