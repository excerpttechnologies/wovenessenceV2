/* Form fields for Stock Points.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "stockPoint", label: "Stock Point", type: "text", req: true },
    { k: "type", label: "Type", type: "select", req: true, placeholder: "--Select--", opts: [{"v":"Warehouse","l":"Warehouse"},{"v":"Stockroom","l":"Stockroom"},{"v":"Showroom","l":"Showroom"},{"v":"Transit Stock","l":"Transit Stock"}] },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
    { k: "parentId", label: "Parent", type: "ref", ref: "stockpoint" },
    { k: "description", label: "Description", type: "textarea", span: "all" },
  ];
