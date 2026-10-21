/* Form fields for Purchase Groups.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "purchaseGroup", label: "Purchase Group", type: "text", req: true },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
  ];
