/* Form fields for Attribute Addons. Lives beside its pages, not in a registry. */

export const FIELDS = [
    { k: "name", label: "Name", type: "text", req: true, span: "all" },
    { k: "status", label: "Status", type: "select", req: true, def: "Active", opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], span: "all" },
  ];
