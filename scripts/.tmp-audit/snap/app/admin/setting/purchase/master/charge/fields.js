/* Form fields for All Purchase Charge Master.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "chargeName", label: "Charge Name", type: "text", req: true },
    { k: "chargeType", label: "Charge Type", type: "select", req: true, placeholder: "--Select--", opts: [{"v":"Amount","l":"Amount"},{"v":"Percentage","l":"Percentage"}] },
    { k: "status", label: "Status", type: "radio", req: true, opts: [{"v":"Active","l":"Active"},{"v":"Inactive","l":"Inactive"}], def: "Active" },
    { k: "gstPosition", label: "GST Position", type: "select", req: true, placeholder: "--Select--", opts: [{"v":"Before GST","l":"Before GST"},{"v":"After GST","l":"After GST"}] },
    { k: "purchaseChargeLedgerId", label: "Purchase Charge Ledger", type: "ref", ref: "ledger" },
  ];
