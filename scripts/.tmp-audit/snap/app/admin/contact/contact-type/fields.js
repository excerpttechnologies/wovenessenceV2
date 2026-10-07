/* Form fields for Contact Types. Lives beside its pages, not in a registry. */

export const FIELDS = [
    { k: "name", label: "Name", type: "text", req: true, span: "all", uppercase: true },
    { k: "contactType", label: "Contact Type", type: "select", req: true, placeholder: "--Select--", opts: [{"v":"Customer","l":"Customer"},{"v":"Supplier","l":"Supplier"},{"v":"Agent","l":"Agent"}] },
    { k: "prefix", label: "Prefix", type: "text", req: true },
    { k: "status", label: "Status", type: "select", req: true, def: "Active", opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}] },
    { k: "colorLebel", label: "Color Lebel", type: "text" },
    { k: "description", label: "Description", type: "text", span: "all" },
  ];
