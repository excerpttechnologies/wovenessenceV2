/* Form fields for Ledger Groups.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "groupName", label: "Group Name", type: "text", req: true },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
    { k: "parentGroupId", label: "Parent Group", type: "ref", ref: "ledgergroups" },
  ];
