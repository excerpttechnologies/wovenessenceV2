/* Form fields for E-commerce Settings.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "markupType", label: "Markup Type", type: "select", req: true, def: "Fixed", opts: [{"v":"Fixed","l":"Fixed"},{"v":"Percentage","l":"Percentage"}] },
    { k: "markupValue", label: "Markup Value", type: "number", req: true, def: 0 },
    { k: "billGenerationBasedOn", label: "Bill Generation Based on", type: "select", req: true, def: "Location", opts: [{"v":"Location","l":"Location"},{"v":"Business","l":"Business"}] },
    { k: "cod", label: "Cash on Delivery (COD)", type: "select", req: true, def: "Yes", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}] },
    { k: "codProcessingCharge", label: "COD Processing Charge", type: "number", req: true, def: 0 },
    { k: "shippingChargeType", label: "Shipping Charge Type", type: "select", req: true, def: "Fixed", opts: [{"v":"Fixed","l":"Fixed"},{"v":"Percentage","l":"Percentage"}] },
    { k: "shippingFee", label: "Shipping Fee", type: "number", req: true, def: 0 },
  ];
