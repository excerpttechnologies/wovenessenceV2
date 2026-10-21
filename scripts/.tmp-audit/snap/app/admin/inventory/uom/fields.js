/* Form fields for Unit of Measurements. Lives beside its pages, not in a registry. */

export const FIELDS = [
    { k: "name", label: "Name", type: "text", req: true, span: "all" },
    { k: "shortName", label: "Short Name", type: "text", req: true, span: "all" },
    { k: "allowDecimal", label: "Allow decimal", type: "select", req: true, placeholder: "--Select--", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}], span: "all" },
    { k: "defaultValue", label: "Default Value", type: "text", span: "all" },
  ];
