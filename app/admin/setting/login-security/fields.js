/* Form fields for Login Security.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "authentication", label: "Authentication", type: "radio", req: true, def: "Enable", opts: [{"v":"Enable","l":"Enable"},{"v":"Disable","l":"Disable"}] },
    { k: "ipAddress", label: "IP Address", type: "text", req: true },
  ];
