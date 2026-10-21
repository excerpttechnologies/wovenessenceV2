/* Form fields for Payment Methods.
   Lives beside the pages that use it - not in a global registry. */

export const FIELDS = [
    { k: "paymentMethodName", label: "Payment Method Name", type: "text", req: true },
    { k: "methodType", label: "Method Type", type: "radio", req: true, def: "None", opts: [{"v":"None","l":"None"},{"v":"Cash","l":"Cash"},{"v":"Loyalty","l":"Loyalty"}] },
    { k: "counterId", label: "Counter", type: "ref", ref: "poscounter", req: true, placeholder: "Select Counter" },
    { k: "ledgerId", label: "Ledger", type: "ref", ref: "ledger", req: true },
    { k: "isActive", label: "Is Active", type: "radio", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}], def: "Yes" },
    { k: "isDefault", label: "Is Default", type: "radio", opts: [{"v":"Yes","l":"Yes"},{"v":"No","l":"No"}], def: "No" },
  ];
